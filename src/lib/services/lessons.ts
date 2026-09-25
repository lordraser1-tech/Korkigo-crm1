import { randomUUID } from "node:crypto";
import { Prisma, type LessonStatus, type LessonType } from "@prisma/client";
import { z } from "zod";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  addWeeksToWallClock,
  toWallClockInput,
  wallClockToUtc,
} from "@/lib/datetime";
import { toAmount } from "@/lib/money";
import {
  lessonCreateSchema,
  lessonTopicSchema,
  lessonUpdateSchema,
} from "@/lib/validation";
import { resolveLessonRates } from "@/lib/services/subjects";
import {
  cancellationCharge,
  cancellationChargePercent,
} from "@/lib/policy";
import { cancelLessonSchema } from "@/lib/validation";

export type LessonDto = {
  id: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  scheduledAt: string;
  endsAt: string;
  durationMinutes: number;
  type: LessonType;
  seriesId: string | null;
  status: LessonStatus;
  /** Temat zajęć — wpisuje nauczyciel przy swojej lekcji. */
  topic: string | null;
  subjectLevelId: string;
  /** „Polski · Maturalny” — przedmiot i poziom tej konkretnej lekcji. */
  subjectLabel: string;
  /** Kiedy uczeń zgłosił odwołanie (nie kiedy wpisano je do systemu). */
  cancelledReportedAt: string | null;
  /** Kwota naliczona uczniowi za odwołanie; `null` gdy lekcja nie jest odwołana. */
  cancellationAmount: number | null;
  /** Kwota wynikająca z regulaminu — różnica od powyższej oznacza korektę. */
  cancellationAutoAmount: number | null;
  cancellationNote: string | null;
  detachedFromSeries: boolean;
  /** Czy lekcja została już rozliczona z nauczycielem. */
  teacherPayoutId: string | null;
};

const LESSON_SELECT = {
  id: true,
  studentId: true,
  teacherId: true,
  scheduledAt: true,
  durationMinutes: true,
  type: true,
  seriesId: true,
  status: true,
  topic: true,
  subjectLevelId: true,
  cancelledReportedAt: true,
  cancellationAmount: true,
  cancellationAutoAmount: true,
  cancellationNote: true,
  detachedFromSeries: true,
  teacherPayoutId: true,
  subjectLevel: {
    select: { name: true, subject: { select: { name: true } } },
  },
  student: { select: { firstName: true, lastName: true } },
  teacher: { select: { firstName: true, lastName: true } },
} satisfies Prisma.LessonSelect;

type LessonRow = Prisma.LessonGetPayload<{ select: typeof LESSON_SELECT }>;

/**
 * Kwoty odwołania są pochodną ceny ucznia (przy progu 100% to dokładnie
 * `StudentRate`), więc nauczyciel dostaje je jako `null` — tak samo jak nie
 * dostaje `rateCount` czy `billingMode`. Sam status i moment zgłoszenia
 * zostają, bo nauczyciel musi wiedzieć, że lekcja przepadła.
 */
function mapLesson(row: LessonRow, actor: Actor): LessonDto {
  const showAmounts = actor.role === "ADMIN";
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: `${row.student.firstName} ${row.student.lastName}`,
    teacherId: row.teacherId,
    teacherName: `${row.teacher.firstName} ${row.teacher.lastName}`,
    scheduledAt: row.scheduledAt.toISOString(),
    endsAt: new Date(
      row.scheduledAt.getTime() + row.durationMinutes * 60_000
    ).toISOString(),
    durationMinutes: row.durationMinutes,
    type: row.type,
    seriesId: row.seriesId,
    status: row.status,
    topic: row.topic,
    subjectLevelId: row.subjectLevelId,
    subjectLabel: `${row.subjectLevel.subject.name} · ${row.subjectLevel.name}`,
    cancelledReportedAt: row.cancelledReportedAt?.toISOString() ?? null,
    cancellationAmount:
      !showAmounts || row.cancellationAmount === null
        ? null
        : toAmount(row.cancellationAmount),
    cancellationAutoAmount:
      !showAmounts || row.cancellationAutoAmount === null
        ? null
        : toAmount(row.cancellationAutoAmount),
    cancellationNote: row.cancellationNote,
    detachedFromSeries: row.detachedFromSeries,
    teacherPayoutId: row.teacherPayoutId,
  };
}

/** Nauczyciel nigdy nie dostaje lekcji z innym `teacherId`. */
export function lessonScope(actor: Actor): Prisma.LessonWhereInput {
  return actor.role === "ADMIN" ? {} : { teacherId: actor.teacherProfileId };
}

export type LessonFilters = {
  from?: Date | null;
  to?: Date | null;
  teacherId?: string | null;
  studentId?: string | null;
  status?: LessonStatus | null;
};

function buildWhere(actor: Actor, filters: LessonFilters): Prisma.LessonWhereInput {
  const where: Prisma.LessonWhereInput = { ...lessonScope(actor) };
  if (filters.from || filters.to) {
    where.scheduledAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lt: filters.to } : {}),
    };
  }
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.status) where.status = filters.status;
  if (filters.teacherId && actor.role === "ADMIN") where.teacherId = filters.teacherId;
  return where;
}

export async function listLessons(
  actor: Actor,
  filters: LessonFilters = {}
): Promise<LessonDto[]> {
  const rows = await prisma.lesson.findMany({
    where: buildWhere(actor, filters),
    select: LESSON_SELECT,
    orderBy: { scheduledAt: "asc" },
  });
  return rows.map((row) => mapLesson(row, actor));
}

export async function getLesson(actor: Actor, id: string): Promise<LessonDto> {
  const row = await prisma.lesson.findFirst({
    where: { id, ...lessonScope(actor) },
    select: LESSON_SELECT,
  });
  if (!row) throw new NotFoundError("Nie znaleziono lekcji.");
  return mapLesson(row, actor);
}

export async function upcomingLessons(
  actor: Actor,
  limit = 5,
  now = new Date()
): Promise<LessonDto[]> {
  const rows = await prisma.lesson.findMany({
    where: {
      ...lessonScope(actor),
      scheduledAt: { gte: now },
      status: "SCHEDULED",
    },
    select: LESSON_SELECT,
    orderBy: { scheduledAt: "asc" },
    take: limit,
  });
  return rows.map((row) => mapLesson(row, actor));
}

export async function countLessonsByStatus(
  actor: Actor,
  filters: LessonFilters = {}
): Promise<Record<LessonStatus, number>> {
  const grouped = await prisma.lesson.groupBy({
    by: ["status"],
    where: buildWhere(actor, filters),
    _count: { _all: true },
  });
  const result: Record<LessonStatus, number> = {
    SCHEDULED: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    NO_SHOW: 0,
  };
  for (const row of grouped) result[row.status] = row._count._all;
  return result;
}

/**
 * Ustala parę (uczeń, nauczyciel) dla nowej lekcji i pilnuje, by nauczyciel
 * planował lekcje wyłącznie sobie i wyłącznie swoim uczniom.
 */
async function resolveLessonTarget(
  actor: Actor,
  studentId: string,
  requestedTeacherId?: string | null
): Promise<{ studentId: string; teacherId: string }> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, teacherId: true },
  });
  if (!student) throw new NotFoundError("Nie znaleziono ucznia.");

  if (actor.role === "TEACHER") {
    if (student.teacherId !== actor.teacherProfileId) {
      throw new NotFoundError("Nie znaleziono ucznia.");
    }
    if (requestedTeacherId && requestedTeacherId !== actor.teacherProfileId) {
      throw new ForbiddenError("Możesz planować lekcje tylko dla siebie.");
    }
    return { studentId: student.id, teacherId: actor.teacherProfileId };
  }

  const teacherId = requestedTeacherId || student.teacherId;
  if (!teacherId) {
    throw new ValidationError(
      "Uczeń nie ma przypisanego nauczyciela — wskaż nauczyciela dla lekcji."
    );
  }
  const teacher = await prisma.teacherProfile.findUnique({
    where: { id: teacherId },
    select: { id: true },
  });
  if (!teacher) throw new ValidationError("Wybrany nauczyciel nie istnieje.");
  return { studentId: student.id, teacherId };
}

export async function createLessons(
  actor: Actor,
  input: z.input<typeof lessonCreateSchema>
): Promise<LessonDto[]> {
  const data = lessonCreateSchema.parse(input);
  const target = await resolveLessonTarget(actor, data.studentId, data.teacherId);

  // Lekcja bez ustalonych stawek nie powstaje — inaczej trafiłaby na rachunek
  // jako darmowa i wypaczyła zarówno wypłatę, jak i saldo ucznia.
  await resolveLessonRates({
    teacherId: target.teacherId,
    studentId: target.studentId,
    subjectLevelId: data.subjectLevelId,
  });

  const repeats = data.type === "RECURRING" ? data.repeatWeeks : 1;
  const seriesId = data.type === "RECURRING" ? randomUUID() : null;

  const rows = Array.from({ length: repeats }, (_, index) => ({
    studentId: target.studentId,
    teacherId: target.teacherId,
    subjectLevelId: data.subjectLevelId,
    scheduledAt: wallClockToUtc(addWeeksToWallClock(data.scheduledAt, index)),
    durationMinutes: data.durationMinutes,
    type: data.type,
    seriesId,
  }));

  await prisma.lesson.createMany({ data: rows });

  const created = await prisma.lesson.findMany({
    where: seriesId
      ? { seriesId }
      : {
          studentId: target.studentId,
          teacherId: target.teacherId,
          scheduledAt: rows[0].scheduledAt,
        },
    select: LESSON_SELECT,
    orderBy: { scheduledAt: "asc" },
  });
  return created.map((row) => mapLesson(row, actor));
}

/**
 * Lekcja ujęta na wystawionym rachunku jest zamrożona — inaczej zmiana statusu
 * albo terminu rozjechałaby się z dokumentem, który uczeń już dostał.
 */
/**
 * Lekcja rozliczona z nauczycielem jest zamrożona tak samo jak ta na
 * rachunku: inaczej dałoby się usunąć albo przestawić lekcję, za którą
 * pieniądze już wyszły, i wypłata przestałaby się zgadzać z czymkolwiek.
 * Wyjście awaryjne jest to samo co przy rachunku — admin cofa wypłatę.
 */
async function assertNotPaidOut(lessonId: string): Promise<void> {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      teacherPayoutId: true,
      teacherPayout: { select: { paidAt: true } },
    },
  });
  if (lesson?.teacherPayoutId) {
    const when = lesson.teacherPayout
      ? ` z ${toWallClockInput(lesson.teacherPayout.paidAt).slice(0, 10)}`
      : "";
    throw new ValidationError(
      `Lekcja jest rozliczona w wypłacie${when} — najpierw cofnij tę wypłatę.`
    );
  }
}

async function assertNotInvoiced(lessonId: string): Promise<void> {
  const item = await prisma.invoiceItem.findUnique({
    where: { lessonId },
    select: { invoice: { select: { number: true, status: true } } },
  });
  if (item && item.invoice.status !== "CANCELLED") {
    throw new ValidationError(
      `Lekcja jest ujęta na rachunku ${item.invoice.number} — najpierw anuluj rachunek.`
    );
  }
}

export type LessonEditScope = "ONE" | "FUTURE";

export async function updateLesson(
  actor: Actor,
  id: string,
  input: z.input<typeof lessonUpdateSchema>,
  scope: LessonEditScope = "ONE"
): Promise<LessonDto> {
  const data = lessonUpdateSchema.parse(input);

  const existing = await prisma.lesson.findFirst({
    where: { id, ...lessonScope(actor) },
    select: {
      id: true,
      seriesId: true,
      scheduledAt: true,
      detachedFromSeries: true,
    },
  });
  if (!existing) throw new NotFoundError("Nie znaleziono lekcji.");

  // Odwołanie MUSI iść przez `cancelLesson()`, bo tylko tam naliczamy opłatę
  // wg regulaminu i zapisujemy moment zgłoszenia. Gdyby dało się ustawić ten
  // status tędy, każdy wariant wejścia (REST, akcja, skrypt) byłby furtką
  // omijającą regulamin — a lekcja wyszłaby za darmo.
  if (data.status === "CANCELLED") {
    throw new ValidationError(
      "Odwołanie lekcji zapisuj przez `cancelLesson()` — nalicza opłatę wg regulaminu."
    );
  }

  await assertNotInvoiced(id);
  await assertNotPaidOut(id);

  const update: Prisma.LessonUpdateInput = {};
  if (data.scheduledAt !== undefined) {
    update.scheduledAt = wallClockToUtc(data.scheduledAt);
  }
  if (data.durationMinutes !== undefined) {
    update.durationMinutes = data.durationMinutes;
  }
  if (data.status !== undefined) {
    // Skoro odwołanie ma tu zakaz wstępu, każdy status ustawiany tędy czyści
    // naliczenie — lekcja „odkliknięta” z odwołania nie może go ciągnąć dalej.
    update.status = data.status;
    update.cancelledReportedAt = null;
    update.cancellationAmount = null;
    update.cancellationAutoAmount = null;
    update.cancellationNote = null;
  }

  // „Tylko ta” odczepia lekcję od serii, żeby kolejne zmiany zbiorcze jej
  // nie ruszały — tak jak w Kalendarzu Google.
  if (existing.seriesId && scope === "ONE") {
    update.detachedFromSeries = true;
  }

  const updated = await prisma.lesson.update({
    where: { id },
    data: update,
    select: LESSON_SELECT,
  });

  if (scope === "FUTURE" && existing.seriesId && !existing.detachedFromSeries) {
    // Przesunięcie terminu przenosimy jako RÓŻNICĘ, inaczej wszystkie lekcje
    // serii wylądowałyby w jednym terminie.
    const shiftMs =
      data.scheduledAt !== undefined
        ? wallClockToUtc(data.scheduledAt).getTime() -
          existing.scheduledAt.getTime()
        : 0;

    const following = await prisma.lesson.findMany({
      where: {
        seriesId: existing.seriesId,
        detachedFromSeries: false,
        status: "SCHEDULED",
        scheduledAt: { gt: existing.scheduledAt },
        id: { not: id },
        ...lessonScope(actor),
      },
      select: { id: true, scheduledAt: true },
    });

    for (const lesson of following) {
      // Lekcje już zafakturowane zostawiamy w spokoju.
      const item = await prisma.invoiceItem.findUnique({
        where: { lessonId: lesson.id },
        select: { invoice: { select: { status: true } } },
      });
      if (item && item.invoice.status !== "CANCELLED") continue;

      await prisma.lesson.update({
        where: { id: lesson.id },
        data: {
          ...(shiftMs !== 0
            ? { scheduledAt: new Date(lesson.scheduledAt.getTime() + shiftMs) }
            : {}),
          ...(data.durationMinutes !== undefined
            ? { durationMinutes: data.durationMinutes }
            : {}),
        },
      });
    }
  }

  return mapLesson(updated, actor);
}

/**
 * Odwołanie lekcji zgodnie z regulaminem (progi w `src/lib/policy.ts`).
 *
 * Liczy się moment ZGŁOSZENIA odwołania przez ucznia, nie moment kliknięcia
 * w systemie — nauczyciel może wpisać zdarzenie z opóźnieniem. Kwotę wyliczoną
 * z regulaminu zapisujemy obok faktycznej, żeby było widać każdą korektę.
 */
export async function cancelLesson(
  actor: Actor,
  id: string,
  input: z.input<typeof cancelLessonSchema> = {},
  now = new Date()
): Promise<LessonDto> {
  const data = cancelLessonSchema.parse(input);

  const lesson = await prisma.lesson.findFirst({
    where: { id, ...lessonScope(actor) },
    select: {
      id: true,
      studentId: true,
      scheduledAt: true,
      subjectLevelId: true,
    },
  });
  if (!lesson) throw new NotFoundError("Nie znaleziono lekcji.");
  await assertNotInvoiced(id);
  await assertNotPaidOut(id);

  const reportedAt = data.reportedAt ? wallClockToUtc(data.reportedAt) : now;

  const rate = await prisma.studentRate.findUnique({
    where: {
      studentId_subjectLevelId: {
        studentId: lesson.studentId,
        subjectLevelId: lesson.subjectLevelId,
      },
    },
    select: { amount: true },
  });
  const price = rate ? toAmount(rate.amount) : 0;
  const autoAmount = cancellationCharge(price, lesson.scheduledAt, reportedAt);

  let finalAmount = autoAmount;
  if (data.amount !== null) {
    // Korektę kwoty robi wyłącznie admin — nauczyciel tylko odznacza status.
    if (actor.role !== "ADMIN") {
      throw new ForbiddenError(
        "Korektę naliczonej kwoty może wprowadzić tylko administrator."
      );
    }
    finalAmount = data.amount;
  }

  const corrected = Math.abs(finalAmount - autoAmount) > 0.004;
  if (corrected && !data.note) {
    throw new ValidationError(
      "Podaj powód korekty — kwota różni się od wyliczonej z regulaminu."
    );
  }

  const updated = await prisma.lesson.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledReportedAt: reportedAt,
      cancellationAutoAmount: new Prisma.Decimal(autoAmount.toFixed(2)),
      cancellationAmount: new Prisma.Decimal(finalAmount.toFixed(2)),
      cancellationNote: data.note,
    },
    select: LESSON_SELECT,
  });
  return mapLesson(updated, actor);
}

/** Podgląd naliczenia przed zapisem — do formularza odwołania. */
export async function previewCancellation(
  actor: Actor,
  id: string,
  reportedAtWallClock?: string | null,
  now = new Date()
): Promise<{ price: number; percent: number; amount: number }> {
  const lesson = await prisma.lesson.findFirst({
    where: { id, ...lessonScope(actor) },
    select: { scheduledAt: true, studentId: true, subjectLevelId: true },
  });
  if (!lesson) throw new NotFoundError("Nie znaleziono lekcji.");

  const reportedAt = reportedAtWallClock
    ? wallClockToUtc(reportedAtWallClock)
    : now;
  const rate = await prisma.studentRate.findUnique({
    where: {
      studentId_subjectLevelId: {
        studentId: lesson.studentId,
        subjectLevelId: lesson.subjectLevelId,
      },
    },
    select: { amount: true },
  });
  const price = rate ? toAmount(rate.amount) : 0;

  return {
    price,
    percent: cancellationChargePercent(lesson.scheduledAt, reportedAt),
    amount: cancellationCharge(price, lesson.scheduledAt, reportedAt),
  };
}

/**
 * Temat zajęć. Osobna ścieżka od `updateLesson`, bo opisu wolno dopisać także
 * do lekcji ujętej już na rachunku — nie zmienia treści dokumentu, a nauczyciel
 * i tak uzupełnia temat po zajęciach.
 */
export async function setLessonTopic(
  actor: Actor,
  id: string,
  input: z.input<typeof lessonTopicSchema>
): Promise<LessonDto> {
  const { topic } = lessonTopicSchema.parse(input);

  const existing = await prisma.lesson.findFirst({
    where: { id, ...lessonScope(actor) },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Nie znaleziono lekcji.");

  const updated = await prisma.lesson.update({
    where: { id },
    data: { topic },
    select: LESSON_SELECT,
  });
  return mapLesson(updated, actor);
}

export async function setLessonStatus(
  actor: Actor,
  id: string,
  status: LessonStatus
): Promise<LessonDto> {
  // Odwołanie ma własną ścieżkę — nalicza opłatę według regulaminu.
  if (status === "CANCELLED") return cancelLesson(actor, id);

  // Zmiana statusu z odwołanej czyści naliczenie, żeby nie zostało „na zapas”.
  return updateLesson(actor, id, { status });
}

export async function deleteLesson(actor: Actor, id: string): Promise<void> {
  const where: Prisma.LessonWhereInput =
    actor.role === "ADMIN" ? { id } : { id, teacherId: actor.teacherProfileId };
  const visible = await prisma.lesson.findFirst({ where, select: { id: true } });
  if (!visible) throw new NotFoundError("Nie znaleziono lekcji.");
  await assertNotInvoiced(id);
  await assertNotPaidOut(id);

  const result = await prisma.lesson.deleteMany({ where });
  if (result.count === 0) throw new NotFoundError("Nie znaleziono lekcji.");
}

/** Usuwa przyszłe, jeszcze niezrealizowane lekcje z serii cyklicznej. */
export async function deleteFutureSeries(
  actor: Actor,
  seriesId: string,
  from = new Date()
): Promise<number> {
  const where: Prisma.LessonWhereInput = {
    seriesId,
    status: "SCHEDULED",
    scheduledAt: { gte: from },
    ...lessonScope(actor),
  };
  const result = await prisma.lesson.deleteMany({ where });
  if (result.count === 0) throw new NotFoundError("Brak lekcji do usunięcia.");
  return result.count;
}
