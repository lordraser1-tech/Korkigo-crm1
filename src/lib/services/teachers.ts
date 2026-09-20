import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { toAmount } from "@/lib/money";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  availabilitySchema,
  changePasswordSchema,
  teacherCreateSchema,
  teacherUpdateSchema,
} from "@/lib/validation";

export type TeacherDto = {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  level: string | null;
  /** Stawka wypłacana nauczycielowi — widzi ją admin oraz sam zainteresowany. */
  ratePerLesson: number;
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
  ratePerLesson: true,
  active: true,
  createdAt: true,
  user: { select: { email: true } },
  _count: { select: { students: true } },
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
    ratePerLesson: toAmount(row.ratePerLesson),
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
      ratePerLesson: new Prisma.Decimal(data.ratePerLesson.toFixed(2)),
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
    // Własną stawkę i aktywność konta zmienia wyłącznie admin.
    if (data.ratePerLesson !== undefined) {
      throw new ForbiddenError("Stawkę nauczyciela ustala wyłącznie administrator.");
    }
    if (data.active !== undefined) {
      throw new ForbiddenError("Statusu konta nie zmienia nauczyciel.");
    }
  }

  const update: Prisma.TeacherProfileUpdateInput = {};
  if (data.firstName !== undefined) update.firstName = data.firstName;
  if (data.lastName !== undefined) update.lastName = data.lastName;
  if (data.phone !== undefined) update.phone = data.phone;
  if (data.level !== undefined) update.level = data.level;
  if (data.ratePerLesson !== undefined) {
    update.ratePerLesson = new Prisma.Decimal(data.ratePerLesson.toFixed(2));
  }
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

// ---------- DYSPOZYCYJNOŚĆ ----------

export type AvailabilityDto = {
  id: string;
  teacherId: string;
  dayOfWeek: number;
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

export async function listAvailability(
  actor: Actor,
  teacherId?: string | null
): Promise<AvailabilityDto[]> {
  const id = resolveTeacherId(actor, teacherId);
  return prisma.availability.findMany({
    where: { teacherId: id },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      teacherId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
    },
  });
}

export async function createAvailability(
  actor: Actor,
  input: z.input<typeof availabilitySchema>
): Promise<AvailabilityDto> {
  const data = availabilitySchema.parse(input);
  const teacherId = resolveTeacherId(actor, data.teacherId);
  return prisma.availability.create({
    data: {
      teacherId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
    },
    select: {
      id: true,
      teacherId: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
    },
  });
}

export async function deleteAvailability(actor: Actor, id: string): Promise<void> {
  const where: Prisma.AvailabilityWhereInput =
    actor.role === "ADMIN" ? { id } : { id, teacherId: actor.teacherProfileId };
  const result = await prisma.availability.deleteMany({ where });
  if (result.count === 0) throw new NotFoundError("Nie znaleziono wpisu grafiku.");
}
