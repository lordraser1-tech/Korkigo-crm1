import { randomUUID } from "node:crypto";
import { Prisma, type LessonStatus, type LessonType } from "@prisma/client";
import { z } from "zod";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { addWeeksToWallClock, wallClockToUtc } from "@/lib/datetime";
import {
  lessonCreateSchema,
  lessonTopicSchema,
  lessonUpdateSchema,
} from "@/lib/validation";

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
  student: { select: { firstName: true, lastName: true } },
  teacher: { select: { firstName: true, lastName: true } },
} satisfies Prisma.LessonSelect;

type LessonRow = Prisma.LessonGetPayload<{ select: typeof LESSON_SELECT }>;

function mapLesson(row: LessonRow): LessonDto {
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
  return rows.map(mapLesson);
}

export async function getLesson(actor: Actor, id: string): Promise<LessonDto> {
  const row = await prisma.lesson.findFirst({
    where: { id, ...lessonScope(actor) },
    select: LESSON_SELECT,
  });
  if (!row) throw new NotFoundError("Nie znaleziono lekcji.");
  return mapLesson(row);
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
  return rows.map(mapLesson);
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

  const repeats = data.type === "RECURRING" ? data.repeatWeeks : 1;
  const seriesId = data.type === "RECURRING" ? randomUUID() : null;

  const rows = Array.from({ length: repeats }, (_, index) => ({
    studentId: target.studentId,
    teacherId: target.teacherId,
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
  return created.map(mapLesson);
}

/**
 * Lekcja ujęta na wystawionym rachunku jest zamrożona — inaczej zmiana statusu
 * albo terminu rozjechałaby się z dokumentem, który uczeń już dostał.
 */
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

export async function updateLesson(
  actor: Actor,
  id: string,
  input: z.input<typeof lessonUpdateSchema>
): Promise<LessonDto> {
  const data = lessonUpdateSchema.parse(input);

  const existing = await prisma.lesson.findFirst({
    where: { id, ...lessonScope(actor) },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Nie znaleziono lekcji.");
  await assertNotInvoiced(id);


  const update: Prisma.LessonUpdateInput = {};
  if (data.scheduledAt !== undefined) {
    update.scheduledAt = wallClockToUtc(data.scheduledAt);
  }
  if (data.durationMinutes !== undefined) {
    update.durationMinutes = data.durationMinutes;
  }
  if (data.status !== undefined) update.status = data.status;

  const updated = await prisma.lesson.update({
    where: { id },
    data: update,
    select: LESSON_SELECT,
  });
  return mapLesson(updated);
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
  return mapLesson(updated);
}

export async function setLessonStatus(
  actor: Actor,
  id: string,
  status: LessonStatus
): Promise<LessonDto> {
  return updateLesson(actor, id, { status });
}

export async function deleteLesson(actor: Actor, id: string): Promise<void> {
  const where: Prisma.LessonWhereInput =
    actor.role === "ADMIN" ? { id } : { id, teacherId: actor.teacherProfileId };
  const visible = await prisma.lesson.findFirst({ where, select: { id: true } });
  if (!visible) throw new NotFoundError("Nie znaleziono lekcji.");
  await assertNotInvoiced(id);

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
