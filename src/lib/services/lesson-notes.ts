/**
 * Notatki z lekcji — szablon „co było / jak poszło / cel / co dalej".
 *
 * Granica ról, tak samo jak wszędzie indziej: nauczyciel widzi wyłącznie
 * notatki ze SWOICH lekcji, admin wszystkie i może po nich szukać. Cudza
 * notatka daje `NotFoundError`, nie 403 — nie potwierdzamy, że istnieje.
 *
 * Notatka nie zawiera żadnych kwot, więc ten sam widok jest bezpieczny dla
 * obu ról; nie ma tu odpowiednika `selectFor` z cenami ucznia.
 */
import { z } from "zod";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NotFoundError } from "@/lib/errors";
import { lessonNoteSchema, lessonNoteFilterSchema } from "@/lib/validation";

export type LessonNoteDto = {
  id: string;
  lessonId: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  /** Termin lekcji, nie data napisania notatki — po nim się ją odnajduje. */
  lessonAt: string;
  subjectLabel: string;
  lessonStatus: string;
  topic: string | null;
  whatWeDid: string;
  howItWent: string;
  goal: string;
  nextSteps: string;
  createdAt: string;
  updatedAt: string;
};

/** Lekcja bez notatki — to z niej powstaje lista „do uzupełnienia". */
export type LessonAwaitingNoteDto = {
  lessonId: string;
  studentId: string;
  studentName: string;
  teacherName: string;
  lessonAt: string;
  subjectLabel: string;
  lessonStatus: string;
  topic: string | null;
};

const NOTE_SELECT = {
  id: true,
  lessonId: true,
  studentId: true,
  whatWeDid: true,
  howItWent: true,
  goal: true,
  nextSteps: true,
  createdAt: true,
  updatedAt: true,
  student: { select: { firstName: true, lastName: true } },
  lesson: {
    select: {
      scheduledAt: true,
      status: true,
      topic: true,
      teacherId: true,
      teacher: { select: { firstName: true, lastName: true } },
      subjectLevel: { select: { name: true, subject: { select: { name: true } } } },
    },
  },
} satisfies Prisma.LessonNoteSelect;

type NoteRow = Prisma.LessonNoteGetPayload<{ select: typeof NOTE_SELECT }>;

function subjectLabel(level: { name: string; subject: { name: string } }): string {
  return `${level.subject.name} · ${level.name}`;
}

function mapNote(row: NoteRow): LessonNoteDto {
  return {
    id: row.id,
    lessonId: row.lessonId,
    studentId: row.studentId,
    studentName: `${row.student.firstName} ${row.student.lastName}`,
    teacherId: row.lesson.teacherId,
    teacherName: `${row.lesson.teacher.firstName} ${row.lesson.teacher.lastName}`,
    lessonAt: row.lesson.scheduledAt.toISOString(),
    subjectLabel: subjectLabel(row.lesson.subjectLevel),
    lessonStatus: row.lesson.status,
    topic: row.lesson.topic,
    whatWeDid: row.whatWeDid,
    howItWent: row.howItWent,
    goal: row.goal,
    nextSteps: row.nextSteps,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Zakres notatek liczymy po **nauczycielu LEKCJI**, nie po tym, kto dziś
 * opiekuje się uczniem. Ucznia da się przepisać innemu nauczycielowi, a wtedy
 * zakres po `student.teacherId` oddałby nowemu nauczycielowi notatki z zajęć,
 * których nie prowadził, i odciął autora od własnych. Notatka należy do lekcji.
 */
function noteScope(actor: Actor): Prisma.LessonNoteWhereInput {
  if (actor.role === "ADMIN") return {};
  return { lesson: { teacherId: actor.teacherProfileId } };
}

function lessonScope(actor: Actor): Prisma.LessonWhereInput {
  if (actor.role === "ADMIN") return {};
  return { teacherId: actor.teacherProfileId };
}

/** Notatka dla jednej lekcji albo `null`, gdy jej jeszcze nie ma. */
export async function getLessonNote(
  actor: Actor,
  lessonId: string
): Promise<LessonNoteDto | null> {
  const row = await prisma.lessonNote.findFirst({
    where: { lessonId, ...noteScope(actor) },
    select: NOTE_SELECT,
  });
  return row ? mapNote(row) : null;
}

/**
 * Zapis notatki — jedna na lekcję (`lessonId` jest unikatem), więc to zawsze
 * „utwórz albo nadpisz".
 *
 * `studentId` bierzemy **z lekcji**, nigdy z formularza. Gdyby przychodził
 * z wejścia, nauczyciel mógłby podpiąć notatkę pod cudzego ucznia — pole jest
 * zdenormalizowane po to, żeby dało się szukać po uczniu, a nie po to, żeby
 * ktokolwiek je ustawiał.
 */
export async function saveLessonNote(
  actor: Actor,
  lessonId: string,
  input: z.input<typeof lessonNoteSchema>
): Promise<LessonNoteDto> {
  const data = lessonNoteSchema.parse(input);

  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, ...lessonScope(actor) },
    select: { id: true, studentId: true },
  });
  if (!lesson) throw new NotFoundError("Nie znaleziono lekcji.");

  const row = await prisma.lessonNote.upsert({
    where: { lessonId },
    create: { lessonId, studentId: lesson.studentId, ...data },
    update: data,
    select: NOTE_SELECT,
  });
  return mapNote(row);
}

export async function deleteLessonNote(
  actor: Actor,
  lessonId: string
): Promise<void> {
  const existing = await prisma.lessonNote.findFirst({
    where: { lessonId, ...noteScope(actor) },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Nie znaleziono notatki.");
  await prisma.lessonNote.delete({ where: { id: existing.id } });
}

/**
 * Lista notatek. Nauczyciel dostaje swoje bez pytania — `teacherId` z wejścia
 * jest dla niego ignorowane, tak samo jak w grafiku (`schedule.resolveScope`),
 * więc nie da się go obejść parametrem w adresie.
 */
export async function listLessonNotes(
  actor: Actor,
  options: z.input<typeof lessonNoteFilterSchema> = {}
): Promise<LessonNoteDto[]> {
  const filter = lessonNoteFilterSchema.parse(options);

  const where: Prisma.LessonNoteWhereInput = { ...noteScope(actor) };
  if (filter.studentId) where.studentId = filter.studentId;
  if (actor.role === "ADMIN" && filter.teacherId) {
    where.lesson = { teacherId: filter.teacherId };
  }

  if (filter.query) {
    const contains = { contains: filter.query, mode: "insensitive" } as const;
    // Szukamy po treści notatki ORAZ po tym, kogo i czego dotyczy — inaczej
    // „Oleksandra" albo „Polski" nie znalazłoby nic, choć to pierwsze, co
    // człowiek wpisuje.
    where.OR = [
      { whatWeDid: contains },
      { howItWent: contains },
      { goal: contains },
      { nextSteps: contains },
      { student: { firstName: contains } },
      { student: { lastName: contains } },
      { lesson: { topic: contains } },
      { lesson: { teacher: { firstName: contains } } },
      { lesson: { teacher: { lastName: contains } } },
      { lesson: { subjectLevel: { subject: { name: contains } } } },
    ];
  }

  const rows = await prisma.lessonNote.findMany({
    where,
    select: NOTE_SELECT,
    orderBy: { lesson: { scheduledAt: "desc" } },
    take: filter.limit,
  });
  return rows.map(mapNote);
}

/**
 * Lekcje bez notatki — żeby „co uzupełnić" nie było zgadywanką.
 *
 * Bierzemy tylko lekcje, które się ODBYŁY (zrealizowane i nieobecności).
 * Zaplanowanej nie ma czego opisywać, a odwołana się nie odbyła — wisiałyby
 * na liście w nieskończoność i zrobiłyby z niej szum.
 */
export async function listLessonsAwaitingNote(
  actor: Actor,
  options: { studentId?: string | null; teacherId?: string | null; limit?: number } = {}
): Promise<LessonAwaitingNoteDto[]> {
  const where: Prisma.LessonWhereInput = {
    ...lessonScope(actor),
    status: { in: ["COMPLETED", "NO_SHOW"] },
    note: null,
  };
  if (options.studentId) where.studentId = options.studentId;
  if (actor.role === "ADMIN" && options.teacherId) {
    where.teacherId = options.teacherId;
  }

  const rows = await prisma.lesson.findMany({
    where,
    select: {
      id: true,
      studentId: true,
      scheduledAt: true,
      status: true,
      topic: true,
      student: { select: { firstName: true, lastName: true } },
      teacher: { select: { firstName: true, lastName: true } },
      subjectLevel: { select: { name: true, subject: { select: { name: true } } } },
    },
    orderBy: { scheduledAt: "desc" },
    take: options.limit ?? 50,
  });

  return rows.map((row) => ({
    lessonId: row.id,
    studentId: row.studentId,
    studentName: `${row.student.firstName} ${row.student.lastName}`,
    teacherName: `${row.teacher.firstName} ${row.teacher.lastName}`,
    lessonAt: row.scheduledAt.toISOString(),
    subjectLabel: subjectLabel(row.subjectLevel),
    lessonStatus: row.status,
    topic: row.topic,
  }));
}

/** Ile lekcji czeka na notatkę — do kropki przy zakładce. */
export async function countLessonsAwaitingNote(actor: Actor): Promise<number> {
  return prisma.lesson.count({
    where: {
      ...lessonScope(actor),
      status: { in: ["COMPLETED", "NO_SHOW"] },
      note: null,
    },
  });
}
