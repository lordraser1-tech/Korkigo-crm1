/**
 * Przedmioty, poziomy i stawki per przedmiot/poziom.
 *
 * Listę przedmiotów widzą obie role — nauczyciel potrzebuje jej, żeby zapisać
 * lekcję. Stawki są rozdzielone: własne stawki nauczyciela widzi on sam
 * i admin, natomiast **ceny uczniów wyłącznie admin**.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { toAmount } from "@/lib/money";
import {
  studentRateSchema,
  subjectLevelSchema,
  subjectSchema,
  teacherRateSchema,
} from "@/lib/validation";

const RATES_ADMIN_ONLY = "Stawki ustala wyłącznie administrator.";
const STUDENT_PRICES_ADMIN_ONLY =
  "Ceny uczniów są widoczne wyłącznie dla administratora.";

function assertAdmin(actor: Actor, message = RATES_ADMIN_ONLY): void {
  if (actor.role !== "ADMIN") throw new ForbiddenError(message);
}

export type SubjectLevelDto = {
  id: string;
  name: string;
  subjectId: string;
  subjectName: string;
  /** „Polski · Maturalny” — do list wyboru. */
  label: string;
  active: boolean;
  lessonCount: number;
};

export type SubjectDto = {
  id: string;
  name: string;
  active: boolean;
  levels: SubjectLevelDto[];
};

const LEVEL_SELECT = {
  id: true,
  name: true,
  active: true,
  subjectId: true,
  subject: { select: { name: true } },
  _count: { select: { lessons: true } },
} satisfies Prisma.SubjectLevelSelect;

type LevelRow = Prisma.SubjectLevelGetPayload<{ select: typeof LEVEL_SELECT }>;

function mapLevel(row: LevelRow): SubjectLevelDto {
  return {
    id: row.id,
    name: row.name,
    subjectId: row.subjectId,
    subjectName: row.subject.name,
    label: `${row.subject.name} · ${row.name}`,
    active: row.active,
    lessonCount: row._count.lessons,
  };
}

// ---------- PRZEDMIOTY I POZIOMY ----------

export async function listSubjects(
  _actor: Actor,
  options: { includeInactive?: boolean } = {}
): Promise<SubjectDto[]> {
  const where = options.includeInactive ? {} : { active: true };
  const rows = await prisma.subject.findMany({
    where,
    select: {
      id: true,
      name: true,
      active: true,
      levels: {
        where: options.includeInactive ? {} : { active: true },
        select: LEVEL_SELECT,
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    active: row.active,
    levels: row.levels.map(mapLevel),
  }));
}

/** Płaska lista poziomów — do selectów i macierzy stawek. */
export async function listSubjectLevels(
  _actor: Actor,
  options: { includeInactive?: boolean } = {}
): Promise<SubjectLevelDto[]> {
  const rows = await prisma.subjectLevel.findMany({
    where: options.includeInactive ? {} : { active: true },
    select: LEVEL_SELECT,
    orderBy: [{ subject: { name: "asc" } }, { name: "asc" }],
  });
  return rows.map(mapLevel);
}

export async function createSubject(
  actor: Actor,
  input: z.input<typeof subjectSchema>
): Promise<SubjectDto> {
  assertAdmin(actor, "Przedmioty tworzy administrator.");
  const data = subjectSchema.parse(input);

  const taken = await prisma.subject.findUnique({
    where: { name: data.name },
    select: { id: true },
  });
  if (taken) throw new ValidationError("Przedmiot o tej nazwie już istnieje.");

  const created = await prisma.subject.create({
    data: { name: data.name },
    select: { id: true, name: true, active: true },
  });
  return { ...created, levels: [] };
}

export async function updateSubject(
  actor: Actor,
  id: string,
  input: { name?: string; active?: boolean }
): Promise<void> {
  assertAdmin(actor, "Przedmioty edytuje administrator.");
  const data: Prisma.SubjectUpdateInput = {};
  if (input.name !== undefined) {
    data.name = subjectSchema.parse({ name: input.name }).name;
  }
  if (input.active !== undefined) data.active = input.active;

  const exists = await prisma.subject.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw new NotFoundError("Nie znaleziono przedmiotu.");
  await prisma.subject.update({ where: { id }, data });
}

export async function deleteSubject(actor: Actor, id: string): Promise<void> {
  assertAdmin(actor, "Przedmioty usuwa administrator.");
  const lessons = await prisma.lesson.count({
    where: { subjectLevel: { subjectId: id } },
  });
  if (lessons > 0) {
    throw new ValidationError(
      "Ten przedmiot ma już lekcje w historii — zamiast usuwać, wyłącz go."
    );
  }
  const result = await prisma.subject.deleteMany({ where: { id } });
  if (result.count === 0) throw new NotFoundError("Nie znaleziono przedmiotu.");
}

export async function createSubjectLevel(
  actor: Actor,
  input: z.input<typeof subjectLevelSchema>
): Promise<SubjectLevelDto> {
  assertAdmin(actor, "Poziomy tworzy administrator.");
  const data = subjectLevelSchema.parse(input);

  const subject = await prisma.subject.findUnique({
    where: { id: data.subjectId },
    select: { id: true },
  });
  if (!subject) throw new ValidationError("Wybrany przedmiot nie istnieje.");

  const taken = await prisma.subjectLevel.findUnique({
    where: { subjectId_name: { subjectId: data.subjectId, name: data.name } },
    select: { id: true },
  });
  if (taken) {
    throw new ValidationError("Ten przedmiot ma już poziom o takiej nazwie.");
  }

  const created = await prisma.subjectLevel.create({
    data: { subjectId: data.subjectId, name: data.name },
    select: LEVEL_SELECT,
  });
  return mapLevel(created);
}

export async function updateSubjectLevel(
  actor: Actor,
  id: string,
  input: { name?: string; active?: boolean }
): Promise<void> {
  assertAdmin(actor, "Poziomy edytuje administrator.");
  const exists = await prisma.subjectLevel.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw new NotFoundError("Nie znaleziono poziomu.");

  const data: Prisma.SubjectLevelUpdateInput = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ValidationError("Podaj nazwę poziomu.");
    data.name = name;
  }
  if (input.active !== undefined) data.active = input.active;
  await prisma.subjectLevel.update({ where: { id }, data });
}

export async function deleteSubjectLevel(
  actor: Actor,
  id: string
): Promise<void> {
  assertAdmin(actor, "Poziomy usuwa administrator.");
  const lessons = await prisma.lesson.count({ where: { subjectLevelId: id } });
  if (lessons > 0) {
    throw new ValidationError(
      "Ten poziom ma już lekcje w historii — zamiast usuwać, wyłącz go."
    );
  }
  const result = await prisma.subjectLevel.deleteMany({ where: { id } });
  if (result.count === 0) throw new NotFoundError("Nie znaleziono poziomu.");
}

// ---------- STAWKI ----------

export type RateCell = {
  subjectLevelId: string;
  label: string;
  amount: number | null;
};

export type TeacherRatesDto = {
  teacherId: string;
  teacherName: string;
  rates: RateCell[];
};

export type StudentRatesDto = {
  studentId: string;
  studentName: string;
  rates: RateCell[];
};

async function levelsForMatrix(): Promise<SubjectLevelDto[]> {
  const rows = await prisma.subjectLevel.findMany({
    where: { active: true },
    select: LEVEL_SELECT,
    orderBy: [{ subject: { name: "asc" } }, { name: "asc" }],
  });
  return rows.map(mapLevel);
}

/** Stawki nauczyciela: admin dowolnego, nauczyciel wyłącznie własne. */
export async function getTeacherRates(
  actor: Actor,
  teacherId: string
): Promise<TeacherRatesDto> {
  if (actor.role === "TEACHER" && actor.teacherProfileId !== teacherId) {
    throw new NotFoundError("Nie znaleziono nauczyciela.");
  }
  const teacher = await prisma.teacherProfile.findUnique({
    where: { id: teacherId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      rates: { select: { subjectLevelId: true, amount: true } },
    },
  });
  if (!teacher) throw new NotFoundError("Nie znaleziono nauczyciela.");

  const levels = await levelsForMatrix();
  const byLevel = new Map(
    teacher.rates.map((rate) => [rate.subjectLevelId, toAmount(rate.amount)])
  );

  return {
    teacherId: teacher.id,
    teacherName: `${teacher.firstName} ${teacher.lastName}`,
    rates: levels.map((level) => ({
      subjectLevelId: level.id,
      label: level.label,
      amount: byLevel.get(level.id) ?? null,
    })),
  };
}

export async function setTeacherRate(
  actor: Actor,
  input: z.input<typeof teacherRateSchema>
): Promise<void> {
  assertAdmin(actor);
  const data = teacherRateSchema.parse(input);

  if (data.amount === null) {
    await prisma.teacherRate.deleteMany({
      where: { teacherId: data.teacherId, subjectLevelId: data.subjectLevelId },
    });
    return;
  }

  await prisma.teacherRate.upsert({
    where: {
      teacherId_subjectLevelId: {
        teacherId: data.teacherId,
        subjectLevelId: data.subjectLevelId,
      },
    },
    update: { amount: new Prisma.Decimal(data.amount.toFixed(2)) },
    create: {
      teacherId: data.teacherId,
      subjectLevelId: data.subjectLevelId,
      amount: new Prisma.Decimal(data.amount.toFixed(2)),
    },
  });
}

/** Ceny ucznia — wyłącznie dla admina. */
export async function getStudentRates(
  actor: Actor,
  studentId: string
): Promise<StudentRatesDto> {
  assertAdmin(actor, STUDENT_PRICES_ADMIN_ONLY);
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      rates: { select: { subjectLevelId: true, amount: true } },
    },
  });
  if (!student) throw new NotFoundError("Nie znaleziono ucznia.");

  const levels = await levelsForMatrix();
  const byLevel = new Map(
    student.rates.map((rate) => [rate.subjectLevelId, toAmount(rate.amount)])
  );

  return {
    studentId: student.id,
    studentName: `${student.firstName} ${student.lastName}`,
    rates: levels.map((level) => ({
      subjectLevelId: level.id,
      label: level.label,
      amount: byLevel.get(level.id) ?? null,
    })),
  };
}

export async function setStudentRate(
  actor: Actor,
  input: z.input<typeof studentRateSchema>
): Promise<void> {
  assertAdmin(actor, STUDENT_PRICES_ADMIN_ONLY);
  const data = studentRateSchema.parse(input);

  if (data.amount === null) {
    await prisma.studentRate.deleteMany({
      where: { studentId: data.studentId, subjectLevelId: data.subjectLevelId },
    });
    return;
  }

  await prisma.studentRate.upsert({
    where: {
      studentId_subjectLevelId: {
        studentId: data.studentId,
        subjectLevelId: data.subjectLevelId,
      },
    },
    update: { amount: new Prisma.Decimal(data.amount.toFixed(2)) },
    create: {
      studentId: data.studentId,
      subjectLevelId: data.subjectLevelId,
      amount: new Prisma.Decimal(data.amount.toFixed(2)),
    },
  });
}

/** Macierz nauczyciel × przedmiot/poziom. */
export async function getTeacherRateMatrix(
  actor: Actor
): Promise<{ levels: SubjectLevelDto[]; rows: TeacherRatesDto[] }> {
  assertAdmin(actor);
  const [levels, teachers] = await Promise.all([
    levelsForMatrix(),
    prisma.teacherProfile.findMany({
      where: { active: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rates: { select: { subjectLevelId: true, amount: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  return {
    levels,
    rows: teachers.map((teacher) => {
      const byLevel = new Map(
        teacher.rates.map((rate) => [rate.subjectLevelId, toAmount(rate.amount)])
      );
      return {
        teacherId: teacher.id,
        teacherName: `${teacher.firstName} ${teacher.lastName}`,
        rates: levels.map((level) => ({
          subjectLevelId: level.id,
          label: level.label,
          amount: byLevel.get(level.id) ?? null,
        })),
      };
    }),
  };
}

/** Macierz uczeń × przedmiot/poziom. */
export async function getStudentRateMatrix(
  actor: Actor
): Promise<{ levels: SubjectLevelDto[]; rows: StudentRatesDto[] }> {
  assertAdmin(actor, STUDENT_PRICES_ADMIN_ONLY);
  const [levels, students] = await Promise.all([
    levelsForMatrix(),
    prisma.student.findMany({
      where: { status: { not: "ENDED" } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rates: { select: { subjectLevelId: true, amount: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  return {
    levels,
    rows: students.map((student) => {
      const byLevel = new Map(
        student.rates.map((rate) => [rate.subjectLevelId, toAmount(rate.amount)])
      );
      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        rates: levels.map((level) => ({
          subjectLevelId: level.id,
          label: level.label,
          amount: byLevel.get(level.id) ?? null,
        })),
      };
    }),
  };
}

// ---------- WYSZUKIWANIE STAWEK (używane przez inne serwisy) ----------

export type RateLookup = {
  teacher: (teacherId: string, subjectLevelId: string) => number | null;
  student: (studentId: string, subjectLevelId: string) => number | null;
};

const key = (ownerId: string, levelId: string) => `${ownerId}|${levelId}`;

/**
 * Jeden odczyt wszystkich stawek, indeksowany w pamięci. Serwisy liczące
 * zarobki, rachunki i statystyki przechodzą po wielu lekcjach naraz —
 * zapytanie per lekcja byłoby marnotrawstwem.
 */
export async function loadRateLookup(options?: {
  teacherIds?: string[];
  studentIds?: string[];
}): Promise<RateLookup> {
  const [teacherRates, studentRates] = await Promise.all([
    prisma.teacherRate.findMany({
      where: options?.teacherIds ? { teacherId: { in: options.teacherIds } } : {},
      select: { teacherId: true, subjectLevelId: true, amount: true },
    }),
    prisma.studentRate.findMany({
      where: options?.studentIds ? { studentId: { in: options.studentIds } } : {},
      select: { studentId: true, subjectLevelId: true, amount: true },
    }),
  ]);

  const teacherMap = new Map(
    teacherRates.map((rate) => [
      key(rate.teacherId, rate.subjectLevelId),
      toAmount(rate.amount),
    ])
  );
  const studentMap = new Map(
    studentRates.map((rate) => [
      key(rate.studentId, rate.subjectLevelId),
      toAmount(rate.amount),
    ])
  );

  return {
    teacher: (teacherId, subjectLevelId) =>
      teacherMap.get(key(teacherId, subjectLevelId)) ?? null,
    student: (studentId, subjectLevelId) =>
      studentMap.get(key(studentId, subjectLevelId)) ?? null,
  };
}

/**
 * Stawki dla jednej lekcji. Brak którejkolwiek blokuje zapis lekcji —
 * inaczej powstawałyby lekcje „za darmo” przez pomyłkę.
 */
export async function resolveLessonRates(options: {
  teacherId: string;
  studentId: string;
  subjectLevelId: string;
}): Promise<{ teacherAmount: number; studentAmount: number; label: string }> {
  const [level, teacherRate, studentRate] = await Promise.all([
    prisma.subjectLevel.findUnique({
      where: { id: options.subjectLevelId },
      select: { name: true, subject: { select: { name: true } } },
    }),
    prisma.teacherRate.findUnique({
      where: {
        teacherId_subjectLevelId: {
          teacherId: options.teacherId,
          subjectLevelId: options.subjectLevelId,
        },
      },
      select: { amount: true },
    }),
    prisma.studentRate.findUnique({
      where: {
        studentId_subjectLevelId: {
          studentId: options.studentId,
          subjectLevelId: options.subjectLevelId,
        },
      },
      select: { amount: true },
    }),
  ]);

  if (!level) throw new ValidationError("Wybrany przedmiot/poziom nie istnieje.");
  const label = `${level.subject.name} · ${level.name}`;

  const missing: string[] = [];
  if (!teacherRate) missing.push("stawki nauczyciela");
  if (!studentRate) missing.push("ceny dla ucznia");
  if (missing.length > 0) {
    throw new ValidationError(
      `Brak ${missing.join(" i ")} dla „${label}”. Ustal ją w zakładce Przedmioty, zanim zapiszesz lekcję.`
    );
  }

  return {
    teacherAmount: toAmount(teacherRate!.amount),
    studentAmount: toAmount(studentRate!.amount),
    label,
  };
}

/**
 * Dane dla formularza lekcji: przedmioty z poziomami i mapy stawek.
 * Nauczyciel dostaje wyłącznie własne stawki i **nigdy** cen uczniów.
 */
export async function getLessonComposerData(actor: Actor): Promise<{
  subjects: SubjectDto[];
  teacherRates: Record<string, Record<string, number>>;
  studentRates?: Record<string, Record<string, number>>;
}> {
  const subjects = await listSubjects(actor);

  const teacherRows = await prisma.teacherRate.findMany({
    where:
      actor.role === "ADMIN" ? {} : { teacherId: actor.teacherProfileId },
    select: { teacherId: true, subjectLevelId: true, amount: true },
  });

  const teacherRates: Record<string, Record<string, number>> = {};
  for (const row of teacherRows) {
    (teacherRates[row.teacherId] ??= {})[row.subjectLevelId] = toAmount(row.amount);
  }

  if (actor.role !== "ADMIN") return { subjects, teacherRates };

  const studentRows = await prisma.studentRate.findMany({
    select: { studentId: true, subjectLevelId: true, amount: true },
  });
  const studentRates: Record<string, Record<string, number>> = {};
  for (const row of studentRows) {
    (studentRates[row.studentId] ??= {})[row.subjectLevelId] = toAmount(row.amount);
  }

  return { subjects, teacherRates, studentRates };
}
