/**
 * Przypomnienia o lekcji na dobę przed terminem.
 *
 * Kanał wybiera admin per uczeń (`Student.reminderChannel`). Każda próba —
 * także nieudana — trafia do `ReminderLog`, więc cron nie zapętla się na
 * błędzie, a admin ma ślad do ręcznego sprawdzenia.
 */
import { randomBytes } from "node:crypto";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { formatDate, formatTime, monthRange } from "@/lib/datetime";
import { sendReminder } from "@/lib/reminders/channels";
import {
  REMINDER_WINDOW_HOURS,
  buildReminderMessage,
} from "@/lib/reminders/template";

const HOUR_MS = 60 * 60 * 1000;
const TOKEN_TTL_MS = 7 * 24 * HOUR_MS;

export type ReminderRunResult = {
  considered: number;
  sent: number;
  failed: number;
  skipped: number;
  details: Array<{ lessonId: string; channel: string; status: string; error?: string }>;
};

/**
 * Wysyła przypomnienia o lekcjach z okna 23–25 h. Uruchamiany z crona
 * (`/api/cron/reminders`), więc nie przyjmuje `Actor` — dostęp chroni sekret
 * po stronie endpointu.
 */
export async function runReminderBatch(
  now = new Date()
): Promise<ReminderRunResult> {
  const from = new Date(now.getTime() + REMINDER_WINDOW_HOURS.min * HOUR_MS);
  const to = new Date(now.getTime() + REMINDER_WINDOW_HOURS.max * HOUR_MS);

  const lessons = await prisma.lesson.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { gte: from, lt: to },
      reminders: { none: {} },
    },
    select: {
      id: true,
      scheduledAt: true,
      subjectLevel: {
        select: { name: true, subject: { select: { name: true } } },
      },
      student: {
        select: {
          firstName: true,
          contactPhone: true,
          telegramChatId: true,
          reminderChannel: true,
          meetingLink: true,
        },
      },
    },
  });

  const result: ReminderRunResult = {
    considered: lessons.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  for (const lesson of lessons) {
    const channel = lesson.student.reminderChannel;
    if (channel === "NONE") {
      // Uczeń jawnie nie chce przypomnień — nie zapisujemy wpisu, bo to nie
      // jest próba wysyłki.
      result.skipped += 1;
      continue;
    }

    const message = buildReminderMessage({
      firstName: lesson.student.firstName,
      subjectLabel: `${lesson.subjectLevel.subject.name} · ${lesson.subjectLevel.name}`,
      time: formatTime(lesson.scheduledAt),
      date: formatDate(lesson.scheduledAt),
      meetingLink: lesson.student.meetingLink,
    });

    const sendResult = await sendReminder(
      channel,
      {
        telegramChatId: lesson.student.telegramChatId,
        phone: lesson.student.contactPhone,
      },
      message
    );

    await prisma.reminderLog.create({
      data: {
        lessonId: lesson.id,
        channel,
        status: sendResult.ok ? "SENT" : "FAILED",
        error: sendResult.ok ? null : sendResult.error,
      },
    });

    if (sendResult.ok) result.sent += 1;
    else result.failed += 1;

    result.details.push({
      lessonId: lesson.id,
      channel,
      status: sendResult.ok ? "SENT" : "FAILED",
      ...(sendResult.ok ? {} : { error: sendResult.error }),
    });
  }

  return result;
}

// ---------- POŁĄCZENIE KONTA TELEGRAM ----------

export type TelegramLinkDto = {
  token: string;
  url: string;
  expiresAt: string;
};

/** Link zaproszenia dla ucznia — do wysłania mu dowolnym kanałem. */
export async function createTelegramLink(
  actor: Actor,
  studentId: string
): Promise<TelegramLinkDto> {
  const student = await prisma.student.findFirst({
    where:
      actor.role === "ADMIN"
        ? { id: studentId }
        : { id: studentId, teacherId: actor.teacherProfileId },
    select: { id: true },
  });
  if (!student) throw new NotFoundError("Nie znaleziono ucznia.");

  const botName = process.env.TELEGRAM_BOT_NAME;
  if (!botName) {
    throw new ValidationError(
      "Brak TELEGRAM_BOT_NAME w środowisku — bez nazwy bota nie zbuduję linku."
    );
  }

  const token = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.telegramLinkToken.create({
    data: { token, studentId: student.id, expiresAt },
  });

  return {
    token,
    url: `https://t.me/${botName}?start=${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Obsługa `/start <token>` z webhooka. Token jest jednorazowy — po użyciu
 * zostaje unieważniony, żeby nie dało się podpiąć cudzego konta.
 */
export async function connectTelegramByToken(
  token: string,
  chatId: string,
  now = new Date()
): Promise<{ studentId: string }> {
  const record = await prisma.telegramLinkToken.findUnique({
    where: { token },
    select: { id: true, studentId: true, usedAt: true, expiresAt: true },
  });
  if (!record) throw new NotFoundError("Nieznany token.");
  if (record.usedAt) throw new ValidationError("Ten link został już użyty.");
  if (record.expiresAt < now) throw new ValidationError("Link wygasł.");

  await prisma.$transaction([
    prisma.student.update({
      where: { id: record.studentId },
      data: { telegramChatId: chatId },
    }),
    prisma.telegramLinkToken.update({
      where: { id: record.id },
      data: { usedAt: now },
    }),
  ]);

  return { studentId: record.studentId };
}

export async function disconnectTelegram(
  actor: Actor,
  studentId: string
): Promise<void> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Rozłączenie Telegrama wykonuje administrator.");
  }
  await prisma.student.update({
    where: { id: studentId },
    data: { telegramChatId: null },
  });
}

// ---------- LICZNIK WYSYŁEK ----------

export type ReminderUsageDto = {
  monthKey: string;
  telegram: number;
  sms: number;
  failed: number;
};

/** Ile przypomnień poszło w danym miesiącu — SMS-y kosztują, więc admin widzi licznik. */
export async function getReminderUsage(
  actor: Actor,
  monthKey: string
): Promise<ReminderUsageDto> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Licznik wysyłek widzi administrator.");
  }
  const { from, to } = monthRange(monthKey);
  const rows = await prisma.reminderLog.groupBy({
    by: ["channel", "status"],
    where: { sentAt: { gte: from, lt: to } },
    _count: { _all: true },
  });

  let telegram = 0;
  let sms = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.status === "FAILED") failed += row._count._all;
    else if (row.channel === "TELEGRAM") telegram += row._count._all;
    else if (row.channel === "SMS") sms += row._count._all;
  }
  return { monthKey, telegram, sms, failed };
}
