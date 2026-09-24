import { Prisma, type BillingMode, type StudentStatus } from "@prisma/client";
import { z } from "zod";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { toAmount } from "@/lib/money";
import { studentCreateSchema, studentUpdateSchema } from "@/lib/validation";
import { getPaymentFlags, type PaymentFlag } from "@/lib/services/billing";

export type StudentDto = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  parentName: string | null;
  parentPhone: string | null;
  parentEmail: string | null;
  languageLevel: string | null;
  subject: string | null;
  status: StudentStatus;
  teacherId: string | null;
  teacherName: string | null;
  /**
   * Stawka płacona przez ucznia. Dla roli TEACHER zawsze `null` — pole nie jest
   * nawet pobierane z bazy (patrz `selectFor`).
   */
  ratePerLesson: number | null;
  /** Tryb rozliczeń ustala admin; nauczyciel go nie widzi. */
  billingMode: BillingMode | null;
  /**
   * Jedyna informacja finansowa dostępna nauczycielowi: „OK” albo „zaległość”,
   * bez kwot, dat i numerów rachunków.
   */
  paymentFlag: PaymentFlag | null;
  createdAt: string;
};

const BASE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  contactEmail: true,
  contactPhone: true,
  parentName: true,
  parentPhone: true,
  parentEmail: true,
  languageLevel: true,
  subject: true,
  status: true,
  teacherId: true,
  createdAt: true,
  teacher: { select: { firstName: true, lastName: true } },
} satisfies Prisma.StudentSelect;

const ADMIN_SELECT = {
  ...BASE_SELECT,
  ratePerLesson: true,
  billingMode: true,
} satisfies Prisma.StudentSelect;

/** Admin dostaje stawkę ucznia; nauczyciel nie pobiera jej z bazy w ogóle. */
function selectFor(actor: Actor) {
  return actor.role === "ADMIN" ? ADMIN_SELECT : BASE_SELECT;
}

/** Nauczyciel widzi wyłącznie uczniów przypisanych do siebie. */
export function studentScope(actor: Actor): Prisma.StudentWhereInput {
  return actor.role === "ADMIN" ? {} : { teacherId: actor.teacherProfileId };
}

type StudentRow = Prisma.StudentGetPayload<{ select: typeof BASE_SELECT }> & {
  ratePerLesson?: Prisma.Decimal;
  billingMode?: BillingMode;
};

function mapStudent(
  row: StudentRow,
  actor: Actor,
  paymentFlag: PaymentFlag | null = null
): StudentDto {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: `${row.firstName} ${row.lastName}`,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    parentName: row.parentName,
    parentPhone: row.parentPhone,
    parentEmail: row.parentEmail,
    languageLevel: row.languageLevel,
    subject: row.subject,
    status: row.status,
    teacherId: row.teacherId,
    teacherName: row.teacher
      ? `${row.teacher.firstName} ${row.teacher.lastName}`
      : null,
    ratePerLesson:
      actor.role === "ADMIN" && row.ratePerLesson !== undefined
        ? toAmount(row.ratePerLesson)
        : null,
    billingMode: actor.role === "ADMIN" ? row.billingMode ?? null : null,
    paymentFlag,
    createdAt: row.createdAt.toISOString(),
  };
}

export type StudentFilters = {
  search?: string | null;
  status?: StudentStatus | null;
  teacherId?: string | null;
};

export async function listStudents(
  actor: Actor,
  filters: StudentFilters = {}
): Promise<StudentDto[]> {
  const where: Prisma.StudentWhereInput = { ...studentScope(actor) };

  if (filters.status) where.status = filters.status;
  // Filtr po nauczycielu to narzędzie admina; nauczyciel i tak jest zawężony.
  if (filters.teacherId && actor.role === "ADMIN") where.teacherId = filters.teacherId;
  if (filters.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: "insensitive" } },
      { lastName: { contains: filters.search, mode: "insensitive" } },
      { contactEmail: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.student.findMany({
    where,
    select: selectFor(actor),
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const flags = await getPaymentFlags(
    actor,
    rows.map((row) => row.id)
  );
  return rows.map((row) =>
    mapStudent(row as StudentRow, actor, flags.get(row.id) ?? null)
  );
}

export async function getStudent(actor: Actor, id: string): Promise<StudentDto> {
  const row = await prisma.student.findFirst({
    where: { id, ...studentScope(actor) },
    select: selectFor(actor),
  });
  // Cudzy uczeń = 404, nie 403 — nie potwierdzamy, że taki rekord istnieje.
  if (!row) throw new NotFoundError("Nie znaleziono ucznia.");
  const flags = await getPaymentFlags(actor, [row.id]);
  return mapStudent(row as StudentRow, actor, flags.get(row.id) ?? null);
}

const RATE_ONLY_ADMIN = "Stawkę ucznia ustala wyłącznie administrator.";
const BILLING_ONLY_ADMIN = "Tryb rozliczeń ustala wyłącznie administrator.";

async function assertTeacherExists(teacherId: string): Promise<void> {
  const exists = await prisma.teacherProfile.findUnique({
    where: { id: teacherId },
    select: { id: true },
  });
  if (!exists) throw new ValidationError("Wybrany nauczyciel nie istnieje.");
}

export async function createStudent(
  actor: Actor,
  input: z.input<typeof studentCreateSchema>
): Promise<StudentDto> {
  const data = studentCreateSchema.parse(input);

  let teacherId: string | null;
  let ratePerLesson: number;

  if (actor.role === "TEACHER") {
    // Nauczyciel dodaje uczniów wyłącznie do siebie i nie dotyka rozliczeń.
    if (data.ratePerLesson !== undefined) throw new ForbiddenError(RATE_ONLY_ADMIN);
    if (data.billingMode !== undefined) throw new ForbiddenError(BILLING_ONLY_ADMIN);
    if (data.teacherId && data.teacherId !== actor.teacherProfileId) {
      throw new ForbiddenError("Możesz dodawać uczniów tylko do siebie.");
    }
    teacherId = actor.teacherProfileId;
    ratePerLesson = 0; // stawkę uzupełni admin
  } else {
    teacherId = data.teacherId ?? null;
    if (teacherId) await assertTeacherExists(teacherId);
    ratePerLesson = data.ratePerLesson ?? 0;
  }

  const created = await prisma.student.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,
      parentName: data.parentName,
      parentPhone: data.parentPhone,
      parentEmail: data.parentEmail,
      languageLevel: data.languageLevel,
      subject: data.subject,
      status: data.status,
      teacherId,
      ratePerLesson: new Prisma.Decimal(ratePerLesson.toFixed(2)),
      ...(actor.role === "ADMIN" && data.billingMode
        ? { billingMode: data.billingMode }
        : {}),
    },
    select: selectFor(actor),
  });
  const flags = await getPaymentFlags(actor, [created.id]);
  return mapStudent(created as StudentRow, actor, flags.get(created.id) ?? null);
}

export async function updateStudent(
  actor: Actor,
  id: string,
  input: z.input<typeof studentUpdateSchema>
): Promise<StudentDto> {
  const data = studentUpdateSchema.parse(input);

  const existing = await prisma.student.findFirst({
    where: { id, ...studentScope(actor) },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Nie znaleziono ucznia.");

  const update: Prisma.StudentUpdateInput = {};
  if (data.firstName !== undefined) update.firstName = data.firstName;
  if (data.lastName !== undefined) update.lastName = data.lastName;
  if (data.contactEmail !== undefined) update.contactEmail = data.contactEmail;
  if (data.contactPhone !== undefined) update.contactPhone = data.contactPhone;
  if (data.parentName !== undefined) update.parentName = data.parentName;
  if (data.parentPhone !== undefined) update.parentPhone = data.parentPhone;
  if (data.parentEmail !== undefined) update.parentEmail = data.parentEmail;
  if (data.languageLevel !== undefined) update.languageLevel = data.languageLevel;
  if (data.subject !== undefined) update.subject = data.subject;
  if (data.status !== undefined) update.status = data.status;

  if (actor.role === "TEACHER") {
    if (data.ratePerLesson !== undefined) throw new ForbiddenError(RATE_ONLY_ADMIN);
    if (data.billingMode !== undefined) throw new ForbiddenError(BILLING_ONLY_ADMIN);
    if (data.teacherId !== undefined && data.teacherId !== actor.teacherProfileId) {
      throw new ForbiddenError("Nie możesz przepisać ucznia do innego nauczyciela.");
    }
  } else {
    if (data.ratePerLesson !== undefined) {
      update.ratePerLesson = new Prisma.Decimal(data.ratePerLesson.toFixed(2));
    }
    if (data.billingMode !== undefined) update.billingMode = data.billingMode;
    if (data.teacherId !== undefined) {
      if (data.teacherId) {
        await assertTeacherExists(data.teacherId);
        update.teacher = { connect: { id: data.teacherId } };
      } else {
        update.teacher = { disconnect: true };
      }
    }
  }

  const updated = await prisma.student.update({
    where: { id },
    data: update,
    select: selectFor(actor),
  });
  const flags = await getPaymentFlags(actor, [updated.id]);
  return mapStudent(updated as StudentRow, actor, flags.get(updated.id) ?? null);
}

/** Twarde usunięcie zostawiamy adminowi i tylko dla ucznia bez historii lekcji. */
export async function deleteStudent(actor: Actor, id: string): Promise<void> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Usuwać uczniów może tylko administrator.");
  }
  const lessons = await prisma.lesson.count({ where: { studentId: id } });
  if (lessons > 0) {
    throw new ValidationError(
      "Uczeń ma historię lekcji — zamiast usuwać, zmień status na „Zakończony”."
    );
  }
  const result = await prisma.student.deleteMany({ where: { id } });
  if (result.count === 0) throw new NotFoundError("Nie znaleziono ucznia.");
}

/** Lekka lista do selectów w formularzach lekcji. */
export async function listStudentOptions(
  actor: Actor,
  teacherId?: string | null
): Promise<Array<{ id: string; fullName: string; teacherId: string | null }>> {
  const where: Prisma.StudentWhereInput = {
    ...studentScope(actor),
    status: { not: "ENDED" },
  };
  if (actor.role === "ADMIN" && teacherId) where.teacherId = teacherId;

  const rows = await prisma.student.findMany({
    where,
    select: { id: true, firstName: true, lastName: true, teacherId: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    fullName: `${r.firstName} ${r.lastName}`,
    teacherId: r.teacherId,
  }));
}
