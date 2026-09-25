import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  availabilitySlotSchema,
  changePasswordSchema,
  copyAvailabilitySchema,
  copyWeekToMonthSchema,
  teacherCreateSchema,
  teacherUpdateSchema,
} from "@/lib/validation";
import {
  monthRange,
  toWallClockInput,
  wallClockToUtc,
  weekDays,
} from "@/lib/datetime";

export type TeacherDto = {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  level: string | null;
  /** Numer konta do wypłat — widzi właściciel konta i admin. */
  bankAccount: string | null;
  /** Ile stawek ma ustalonych — szczegóły w zakładce Przedmioty. */
  rateCount: number;
  active: boolean;
  studentCount: number;
  createdAt: string;
};

const TEACHER_SELECT = {
  id: true,
  userId: true,
  firstName: true,
  lastName: true,
  phone: true,
  level: true,
  bankAccount: true,
  active: true,
  createdAt: true,
  user: { select: { email: true } },
  _count: { select: { students: true, rates: true } },
} satisfies Prisma.TeacherProfileSelect;

type TeacherRow = Prisma.TeacherProfileGetPayload<{ select: typeof TEACHER_SELECT }>;

function mapTeacher(row: TeacherRow): TeacherDto {
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: `${row.firstName} ${row.lastName}`,
    phone: row.phone,
    level: row.level,
    bankAccount: row.bankAccount,
    rateCount: row._count.rates,
    active: row.active,
    studentCount: row._count.students,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Nauczyciel nie ma prawa zobaczyć danych innego nauczyciela — jedyny dozwolony
 * "cudzy" odczyt to własny profil.
 */
function assertCanReadTeacher(actor: Actor, teacherId: string): void {
  if (actor.role === "ADMIN") return;
  if (actor.teacherProfileId !== teacherId) {
    throw new NotFoundError("Nie znaleziono nauczyciela.");
  }
}

export async function listTeachers(
  actor: Actor,
  options: { includeInactive?: boolean } = {}
): Promise<TeacherDto[]> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Listę nauczycieli widzi tylko administrator.");
  }
  const rows = await prisma.teacherProfile.findMany({
    where: options.includeInactive ? {} : { active: true },
    select: TEACHER_SELECT,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return rows.map(mapTeacher);
}

export async function getTeacher(actor: Actor, id: string): Promise<TeacherDto> {
  assertCanReadTeacher(actor, id);
  const row = await prisma.teacherProfile.findUnique({
    where: { id },
    select: TEACHER_SELECT,
  });
  if (!row) throw new NotFoundError("Nie znaleziono nauczyciela.");
  return mapTeacher(row);
}

export async function getMyTeacherProfile(actor: Actor): Promise<TeacherDto> {
  if (actor.role !== "TEACHER") {
    throw new ForbiddenError("Ten widok jest dostępny tylko dla nauczyciela.");
  }
  return getTeacher(actor, actor.teacherProfileId);
}

export async function createTeacher(
  actor: Actor,
  input: z.input<typeof teacherCreateSchema>
): Promise<TeacherDto> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Konta nauczycieli zakłada administrator.");
  }
  const data = teacherCreateSchema.parse(input);

  const taken = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });
  if (taken) throw new ValidationError("Konto z tym adresem e-mail już istnieje.");

  const passwordHash = await hashPassword(data.password);
  const created = await prisma.teacherProfile.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      level: data.level,
      user: { create: { email: data.email, passwordHash, role: "TEACHER" } },
    },
    select: TEACHER_SELECT,
  });
  return mapTeacher(created);
}

export async function updateTeacher(
  actor: Actor,
  id: string,
  input: z.input<typeof teacherUpdateSchema>
): Promise<TeacherDto> {
  const data = teacherUpdateSchema.parse(input);

  if (actor.role === "TEACHER") {
    if (actor.teacherProfileId !== id) {
      throw new NotFoundError("Nie znaleziono nauczyciela.");
    }
    // Aktywność konta zmienia wyłącznie admin (stawki żyją w osobnym serwisie).
    if (data.active !== undefined) {
      throw new ForbiddenError("Statusu konta nie zmienia nauczyciel.");
    }
  }

  const update: Prisma.TeacherProfileUpdateInput = {};
  if (data.firstName !== undefined) update.firstName = data.firstName;
  if (data.lastName !== undefined) update.lastName = data.lastName;
  if (data.phone !== undefined) update.phone = data.phone;
  if (data.level !== undefined) update.level = data.level;
  if (data.bankAccount !== undefined) update.bankAccount = data.bankAccount;
  if (data.active !== undefined) update.active = data.active;

  const exists = await prisma.teacherProfile.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) throw new NotFoundError("Nie znaleziono nauczyciela.");

  const updated = await prisma.teacherProfile.update({
    where: { id },
    data: update,
    select: TEACHER_SELECT,
  });
  return mapTeacher(updated);
}

export async function setTeacherPassword(
  actor: Actor,
  teacherId: string,
  newPassword: string
): Promise<void> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Hasło nauczyciela resetuje administrator.");
  }
  if (newPassword.length < 8) {
    throw new ValidationError("Hasło musi mieć min. 8 znaków.");
  }
  const teacher = await prisma.teacherProfile.findUnique({
    where: { id: teacherId },
    select: { userId: true },
  });
  if (!teacher) throw new NotFoundError("Nie znaleziono nauczyciela.");

  await prisma.user.update({
    where: { id: teacher.userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
}

export async function changeOwnPassword(
  actor: Actor,
  input: z.input<typeof changePasswordSchema>
): Promise<void> {
  const data = changePasswordSchema.parse(input);
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { passwordHash: true },
  });
  if (!user) throw new NotFoundError("Nie znaleziono konta.");

  const ok = await verifyPassword(data.currentPassword, user.passwordHash);
  if (!ok) throw new ValidationError("Obecne hasło jest nieprawidłowe.");

  await prisma.user.update({
    where: { id: actor.userId },
    data: { passwordHash: await hashPassword(data.newPassword) },
  });
}

// ---------- DYSPOZYCYJNOŚĆ (konkretne dni) ----------

export type AvailabilityDto = {
  id: string;
  teacherId: string;
  /** Dzień w formacie „RRRR-MM-DD” (czas warszawski). */
  date: string;
  startTime: string;
  endTime: string;
};

/** Admin podaje `teacherId`; nauczyciel zawsze operuje na własnym grafiku. */
function resolveTeacherId(actor: Actor, requested?: string | null): string {
  if (actor.role === "TEACHER") {
    if (requested && requested !== actor.teacherProfileId) {
      throw new ForbiddenError("Możesz zarządzać tylko własną dyspozycyjnością.");
    }
    return actor.teacherProfileId;
  }
  if (!requested) throw new ValidationError("Wskaż nauczyciela.");
  return requested;
}

function mapSlot(row: {
  id: string;
  teacherId: string;
  date: Date;
  startTime: string;
  endTime: string;
}): AvailabilityDto {
  return {
    id: row.id,
    teacherId: row.teacherId,
    date: toWallClockInput(row.date).slice(0, 10),
    startTime: row.startTime,
    endTime: row.endTime,
  };
}

export async function listAvailability(
  actor: Actor,
  teacherId?: string | null,
  range?: { from: Date; to: Date }
): Promise<AvailabilityDto[]> {
  const id = resolveTeacherId(actor, teacherId);
  const rows = await prisma.availabilitySlot.findMany({
    where: {
      teacherId: id,
      ...(range ? { date: { gte: range.from, lt: range.to } } : {}),
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      teacherId: true,
      date: true,
      startTime: true,
      endTime: true,
    },
  });
  return rows.map(mapSlot);
}

export async function createAvailability(
  actor: Actor,
  input: z.input<typeof availabilitySlotSchema>
): Promise<AvailabilityDto> {
  const data = availabilitySlotSchema.parse(input);
  const teacherId = resolveTeacherId(actor, data.teacherId);
  const date = wallClockToUtc(`${data.date}T00:00`);

  const existing = await prisma.availabilitySlot.findUnique({
    where: {
      teacherId_date_startTime: {
        teacherId,
        date,
        startTime: data.startTime,
      },
    },
    select: { id: true },
  });
  if (existing) {
    throw new ValidationError("Takie okno już istnieje w tym dniu.");
  }

  const created = await prisma.availabilitySlot.create({
    data: {
      teacherId,
      date,
      startTime: data.startTime,
      endTime: data.endTime,
    },
    select: {
      id: true,
      teacherId: true,
      date: true,
      startTime: true,
      endTime: true,
    },
  });
  return mapSlot(created);
}

export async function deleteAvailability(actor: Actor, id: string): Promise<void> {
  const where: Prisma.AvailabilitySlotWhereInput =
    actor.role === "ADMIN" ? { id } : { id, teacherId: actor.teacherProfileId };
  const result = await prisma.availabilitySlot.deleteMany({ where });
  if (result.count === 0) throw new NotFoundError("Nie znaleziono wpisu grafiku.");
}

/** Usuwa całą dyspozycyjność wskazanego dnia. */
export async function clearAvailabilityDay(
  actor: Actor,
  input: { teacherId?: string | null; date: string }
): Promise<number> {
  const teacherId = resolveTeacherId(actor, input.teacherId);
  const date = wallClockToUtc(`${input.date}T00:00`);
  const result = await prisma.availabilitySlot.deleteMany({
    where: { teacherId, date },
  });
  return result.count;
}

/**
 * Kopiowanie tygodnia — bez tego ustawianie dyspozycyjności dzień po dniu
 * byłoby mordęgą. Istniejące okna w dniach docelowych zostają nietknięte,
 * a duplikaty są pomijane.
 */
export async function copyAvailabilityWeek(
  actor: Actor,
  input: z.input<typeof copyAvailabilitySchema>
): Promise<number> {
  const data = copyAvailabilitySchema.parse(input);
  const teacherId = resolveTeacherId(actor, data.teacherId);

  const sourceDays = weekDays(data.sourceWeek);
  const targetDays = weekDays(data.targetWeek);

  const slots = await prisma.availabilitySlot.findMany({
    where: {
      teacherId,
      date: {
        gte: wallClockToUtc(`${sourceDays[0].dateKey}T00:00`),
        lte: wallClockToUtc(`${sourceDays[6].dateKey}T00:00`),
      },
    },
    select: { date: true, startTime: true, endTime: true },
  });
  if (slots.length === 0) {
    throw new ValidationError("Tydzień źródłowy nie ma żadnych okien.");
  }

  const byDay = new Map(sourceDays.map((day, index) => [day.dateKey, index]));
  const rows = slots
    .map((slot) => {
      const index = byDay.get(toWallClockInput(slot.date).slice(0, 10));
      if (index === undefined) return null;
      return {
        teacherId,
        date: wallClockToUtc(`${targetDays[index].dateKey}T00:00`),
        startTime: slot.startTime,
        endTime: slot.endTime,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const result = await prisma.availabilitySlot.createMany({
    data: rows,
    skipDuplicates: true,
  });
  return result.count;
}

/** Kopiuje układ tygodnia na wszystkie tygodnie wskazanego miesiąca. */
export async function copyAvailabilityToMonth(
  actor: Actor,
  input: z.input<typeof copyWeekToMonthSchema>
): Promise<number> {
  const data = copyWeekToMonthSchema.parse(input);
  const teacherId = resolveTeacherId(actor, data.teacherId);

  const sourceDays = weekDays(data.sourceWeek);
  const slots = await prisma.availabilitySlot.findMany({
    where: {
      teacherId,
      date: {
        gte: wallClockToUtc(`${sourceDays[0].dateKey}T00:00`),
        lte: wallClockToUtc(`${sourceDays[6].dateKey}T00:00`),
      },
    },
    select: { date: true, startTime: true, endTime: true },
  });
  if (slots.length === 0) {
    throw new ValidationError("Tydzień źródłowy nie ma żadnych okien.");
  }

  // Układ tygodnia: dzień tygodnia -> okna.
  const pattern = new Map<number, Array<{ startTime: string; endTime: string }>>();
  for (const slot of slots) {
    const dateKey = toWallClockInput(slot.date).slice(0, 10);
    const dayOfWeek = sourceDays.find((day) => day.dateKey === dateKey)?.dayOfWeek;
    if (dayOfWeek === undefined) continue;
    const list = pattern.get(dayOfWeek) ?? [];
    list.push({ startTime: slot.startTime, endTime: slot.endTime });
    pattern.set(dayOfWeek, list);
  }

  const { from, to } = monthRange(data.month);
  const rows: Array<{
    teacherId: string;
    date: Date;
    startTime: string;
    endTime: string;
  }> = [];

  for (
    let cursor = new Date(from);
    cursor < to;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  ) {
    const dateKey = toWallClockInput(cursor).slice(0, 10);
    const dayOfWeek = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
    for (const slot of pattern.get(dayOfWeek) ?? []) {
      rows.push({
        teacherId,
        date: wallClockToUtc(`${dateKey}T00:00`),
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
    }
  }

  const result = await prisma.availabilitySlot.createMany({
    data: rows,
    skipDuplicates: true,
  });
  return result.count;
}
