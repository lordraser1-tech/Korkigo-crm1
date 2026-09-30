/**
 * Synchronizacja lekcji z kalendarzem Google — JEDNOKIERUNKOWO.
 *
 * CRM jest źródłem prawdy: zmiana w Google nie wraca do bazy. Każdy nauczyciel
 * podłącza własne konto i dostaje wyłącznie swoje lekcje — cudzych nie da się
 * wypchnąć, bo zapytania są zawężone jego `teacherId`.
 *
 * „Co wysłać" poznajemy po `Lesson.googleSyncedAt = null`. Ten znacznik zerują
 * jawnie funkcje z `lessons.ts`; NIE porównujemy go z `updatedAt`, bo Prisma
 * bumpuje `updatedAt` przy każdym zapisie — także przy zapisie samego
 * znacznika — i taka detekcja ścigałaby się sama ze sobą.
 */
import { SignJWT, jwtVerify } from "jose";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { APP_TIME_ZONE, toWallClockInput } from "@/lib/datetime";
import {
  EventGoneError,
  deleteEvent,
  insertEvent,
  patchEvent,
  type CalendarEventInput,
} from "@/lib/google/calendar";
import {
  authorizationUrl,
  exchangeCode,
  fetchGoogleEmail,
  googleConfig,
  refreshAccessToken,
} from "@/lib/google/oauth";

const STATE_TTL = "15m";
/** Odświeżamy token z zapasem, żeby nie trafić w wygaśnięcie w trakcie wysyłki. */
const REFRESH_MARGIN_MS = 60 * 1000;

export type CalendarLinkDto = {
  teacherId: string;
  googleEmail: string;
  calendarId: string;
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  /** Ile lekcji czeka na wypchnięcie. */
  pending: number;
};

/** Konfiguracja bywa niepełna na dev — UI ma o tym mówić, a nie się wywalać. */
export function isCalendarConfigured(): boolean {
  return googleConfig() !== null;
}

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET musi być ustawiony (min. 32 znaki).");
  }
  return new TextEncoder().encode(value);
}

/** Nauczyciel zarządza wyłącznie własnym połączeniem; admin wskazuje czyim. */
function resolveTeacherId(actor: Actor, requested?: string | null): string {
  if (actor.role === "TEACHER") {
    if (requested && requested !== actor.teacherProfileId) {
      throw new ForbiddenError("Możesz zarządzać tylko własnym kalendarzem.");
    }
    return actor.teacherProfileId;
  }
  if (!requested) throw new ValidationError("Wskaż nauczyciela.");
  return requested;
}

export async function getCalendarLink(
  actor: Actor,
  teacherId?: string | null
): Promise<CalendarLinkDto | null> {
  const id = resolveTeacherId(actor, teacherId);
  const row = await prisma.googleCalendarLink.findUnique({
    where: { teacherId: id },
    select: {
      teacherId: true,
      googleEmail: true,
      calendarId: true,
      enabled: true,
      lastSyncAt: true,
      lastSyncError: true,
    },
  });
  if (!row) return null;

  const pending = await prisma.lesson.count({
    where: { teacherId: id, googleSyncedAt: null },
  });

  // Tokeny nie opuszczają serwera — w DTO nie ma ich nawet w formie skróconej.
  return {
    ...row,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    pending,
  };
}

/**
 * Adres zgody Google. `state` to krótkotrwały podpisany token z `teacherId`,
 * więc powrotu nie da się podstawić pod inne konto.
 */
export async function startCalendarConnect(
  actor: Actor,
  teacherId?: string | null
): Promise<string> {
  const id = resolveTeacherId(actor, teacherId);
  const state = await new SignJWT({ teacherId: id, purpose: "google-calendar" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(STATE_TTL)
    .sign(secret());
  return authorizationUrl(state);
}

/** Powrót z Google. Wołane z trasy callbacka, więc bierze `state`, nie `Actor`. */
export async function finishCalendarConnect(
  state: string,
  code: string
): Promise<{ teacherId: string; googleEmail: string }> {
  let teacherId: string;
  try {
    const { payload } = await jwtVerify(state, secret(), { algorithms: ["HS256"] });
    if (payload.purpose !== "google-calendar" || typeof payload.teacherId !== "string") {
      throw new Error("zły state");
    }
    teacherId = payload.teacherId;
  } catch {
    throw new ValidationError("Nieprawidłowy albo przedawniony state — zacznij od nowa.");
  }

  const teacher = await prisma.teacherProfile.findUnique({
    where: { id: teacherId },
    select: { id: true },
  });
  if (!teacher) throw new NotFoundError("Nie znaleziono nauczyciela.");

  const tokens = await exchangeCode(code);
  if (!tokens.refreshToken) {
    throw new ValidationError(
      "Google nie przysłał refresh tokenu — odłącz aplikację w koncie Google i spróbuj ponownie."
    );
  }
  const googleEmail = await fetchGoogleEmail(tokens.accessToken);

  await prisma.googleCalendarLink.upsert({
    where: { teacherId },
    update: {
      googleEmail,
      refreshToken: encryptSecret(tokens.refreshToken),
      accessToken: encryptSecret(tokens.accessToken),
      expiresAt: tokens.expiresAt,
      enabled: true,
      lastSyncError: null,
    },
    create: {
      teacherId,
      googleEmail,
      refreshToken: encryptSecret(tokens.refreshToken),
      accessToken: encryptSecret(tokens.accessToken),
      expiresAt: tokens.expiresAt,
    },
  });

  // Podłączenie kalendarza = wszystko do wysłania od nowa.
  await prisma.lesson.updateMany({
    where: { teacherId },
    data: { googleSyncedAt: null },
  });

  return { teacherId, googleEmail };
}

export async function setCalendarEnabled(
  actor: Actor,
  enabled: boolean,
  teacherId?: string | null
): Promise<void> {
  const id = resolveTeacherId(actor, teacherId);
  const updated = await prisma.googleCalendarLink.updateMany({
    where: { teacherId: id },
    data: { enabled },
  });
  if (updated.count === 0) throw new NotFoundError("Kalendarz nie jest podłączony.");
}

/**
 * Rozłączenie. Zdarzenia już wysłane zostają w Google jako nagrobki do
 * sprzątnięcia — inaczej rozłączenie po cichu wyczyściłoby komuś kalendarz
 * bez możliwości cofnięcia.
 */
export async function disconnectCalendar(
  actor: Actor,
  teacherId?: string | null,
  removeEvents = true
): Promise<void> {
  const id = resolveTeacherId(actor, teacherId);
  const link = await prisma.googleCalendarLink.findUnique({
    where: { teacherId: id },
    select: { calendarId: true },
  });
  if (!link) throw new NotFoundError("Kalendarz nie jest podłączony.");

  if (removeEvents) {
    const synced = await prisma.lesson.findMany({
      where: { teacherId: id, googleEventId: { not: null } },
      select: { googleEventId: true },
    });
    if (synced.length > 0) {
      await prisma.googleCalendarDeletion.createMany({
        data: synced.map((lesson) => ({
          teacherId: id,
          googleEventId: lesson.googleEventId!,
          calendarId: link.calendarId,
        })),
      });
    }
  }

  await prisma.$transaction([
    prisma.lesson.updateMany({
      where: { teacherId: id },
      data: { googleEventId: null, googleSyncedAt: null },
    }),
    prisma.googleCalendarLink.delete({ where: { teacherId: id } }),
  ]);
}

// ---------- TREŚĆ ZDARZENIA ----------

type LessonForSync = {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: string;
  topic: string | null;
  googleEventId: string | null;
  student: { firstName: string; lastName: string; meetingLink: string | null };
  subjectLevel: { name: string; subject: { name: string } };
};

/**
 * Zdarzenie NIE zawiera żadnych kwot — ani ceny ucznia, ani stawki
 * nauczyciela. Kalendarz Google jest poza naszą kontrolą (współdzielenie,
 * powiadomienia, eksport), więc pieniądze tam nie trafiają.
 */
export function buildEvent(lesson: LessonForSync): CalendarEventInput {
  const start = toWallClockInput(lesson.scheduledAt);
  const end = toWallClockInput(
    new Date(lesson.scheduledAt.getTime() + lesson.durationMinutes * 60_000)
  );
  const subjectLabel = `${lesson.subjectLevel.subject.name} · ${lesson.subjectLevel.name}`;
  const studentName = `${lesson.student.firstName} ${lesson.student.lastName}`;

  const lines = [`Uczeń: ${studentName}`, `Przedmiot: ${subjectLabel}`];
  if (lesson.topic) lines.push(`Temat: ${lesson.topic}`);
  if (lesson.student.meetingLink) lines.push(`Pokój: ${lesson.student.meetingLink}`);
  if (lesson.status === "NO_SHOW") lines.push("Status: nieobecność");
  lines.push("", "Wpis z KorkiGO CRM — zmiany wprowadzaj w panelu, nie tutaj.");

  return {
    summary: `${subjectLabel} — ${studentName}`,
    description: lines.join("\n"),
    start,
    end,
    timeZone: APP_TIME_ZONE,
  };
}

// ---------- WYPYCHANIE ----------

const LESSON_SYNC_SELECT = {
  id: true,
  scheduledAt: true,
  durationMinutes: true,
  status: true,
  topic: true,
  googleEventId: true,
  student: { select: { firstName: true, lastName: true, meetingLink: true } },
  subjectLevel: { select: { name: true, subject: { select: { name: true } } } },
} as const;

async function accessTokenFor(link: {
  teacherId: string;
  refreshToken: string;
  accessToken: string | null;
  expiresAt: Date | null;
}): Promise<string> {
  const fresh =
    link.accessToken &&
    link.expiresAt &&
    link.expiresAt.getTime() - REFRESH_MARGIN_MS > Date.now();
  if (fresh) return decryptSecret(link.accessToken!);

  const tokens = await refreshAccessToken(decryptSecret(link.refreshToken));
  await prisma.googleCalendarLink.update({
    where: { teacherId: link.teacherId },
    data: {
      accessToken: encryptSecret(tokens.accessToken),
      expiresAt: tokens.expiresAt,
      ...(tokens.refreshToken
        ? { refreshToken: encryptSecret(tokens.refreshToken) }
        : {}),
    },
  });
  return tokens.accessToken;
}

export type CalendarSyncResult = {
  teachers: number;
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  details: Array<{ teacherId: string; error: string }>;
};

/**
 * Jedno przejście synchronizacji — wołane z crona.
 *
 * Lekcja odwołana jest usuwana z kalendarza: nie odbędzie się, więc nie ma po
 * co blokować terminu. Historia zostaje w CRM-ie.
 */
export async function syncCalendars(
  limitPerTeacher = 50,
  onlyTeacherId?: string | null
): Promise<CalendarSyncResult> {
  const result: CalendarSyncResult = {
    teachers: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    failed: 0,
    details: [],
  };

  const links = await prisma.googleCalendarLink.findMany({
    where: { enabled: true, ...(onlyTeacherId ? { teacherId: onlyTeacherId } : {}) },
    select: {
      teacherId: true,
      calendarId: true,
      refreshToken: true,
      accessToken: true,
      expiresAt: true,
    },
  });

  for (const link of links) {
    result.teachers += 1;
    try {
      const token = await accessTokenFor(link);

      // 1. Nagrobki po lekcjach usuniętych z CRM-a.
      const deletions = await prisma.googleCalendarDeletion.findMany({
        where: { teacherId: link.teacherId },
        take: limitPerTeacher,
      });
      for (const deletion of deletions) {
        await deleteEvent(token, deletion.calendarId, deletion.googleEventId);
        await prisma.googleCalendarDeletion.delete({ where: { id: deletion.id } });
        result.deleted += 1;
      }

      // 2. Lekcje czekające na wysłanie.
      const pending = await prisma.lesson.findMany({
        where: { teacherId: link.teacherId, googleSyncedAt: null },
        select: LESSON_SYNC_SELECT,
        orderBy: { scheduledAt: "asc" },
        take: limitPerTeacher,
      });

      for (const lesson of pending) {
        if (lesson.status === "CANCELLED") {
          if (lesson.googleEventId) {
            await deleteEvent(token, link.calendarId, lesson.googleEventId);
            result.deleted += 1;
          }
          await prisma.lesson.update({
            where: { id: lesson.id },
            data: { googleEventId: null, googleSyncedAt: new Date() },
          });
          continue;
        }

        const event = buildEvent(lesson);
        let eventId = lesson.googleEventId;

        if (eventId) {
          try {
            await patchEvent(token, link.calendarId, eventId, event);
            result.updated += 1;
          } catch (error) {
            // Zdarzenie skasowane ręcznie w Google — zakładamy je od nowa.
            if (!(error instanceof EventGoneError)) throw error;
            eventId = await insertEvent(token, link.calendarId, event);
            result.created += 1;
          }
        } else {
          eventId = await insertEvent(token, link.calendarId, event);
          result.created += 1;
        }

        await prisma.lesson.update({
          where: { id: lesson.id },
          data: { googleEventId: eventId, googleSyncedAt: new Date() },
        });
      }

      await prisma.googleCalendarLink.update({
        where: { teacherId: link.teacherId },
        data: { lastSyncAt: new Date(), lastSyncError: null },
      });
    } catch (error) {
      // Błąd jednego nauczyciela nie może zatrzymać pozostałych.
      const message = error instanceof Error ? error.message : "Nieznany błąd.";
      result.failed += 1;
      result.details.push({ teacherId: link.teacherId, error: message });
      await prisma.googleCalendarLink.update({
        where: { teacherId: link.teacherId },
        data: { lastSyncError: message.slice(0, 500) },
      });
    }
  }

  return result;
}
