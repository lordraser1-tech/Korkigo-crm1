/**
 * Rejestr wypłat dla nauczycieli.
 *
 * „Ile się należy” liczy lekcje, które kwalifikują się do wypłaty (patrz
 * `src/lib/policy.ts`) i nie zostały jeszcze przypisane do żadnej wypłaty.
 * Oznaczenie wypłaty przypina te lekcje do rekordu `Payout`, więc kolejne
 * wyliczenie już ich nie policzy.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { toAmount } from "@/lib/money";
import { wallClockToUtc } from "@/lib/datetime";
import { countsTowardsTeacherPayout } from "@/lib/policy";
import { loadRateLookup } from "@/lib/services/subjects";
import { payoutSchema } from "@/lib/validation";

export type PayoutDto = {
  id: string;
  teacherId: string;
  teacherName: string;
  amount: number;
  paidAt: string;
  /** Kto oznaczył wypłatę — pokazujemy tylko adminowi. */
  paidByEmail: string | null;
  note: string | null;
  lessonCount: number;
};

export type PayoutDueDto = {
  teacherId: string;
  teacherName: string;
  /** Lekcje kwalifikujące się do wypłaty, jeszcze nierozliczone. */
  lessons: number;
  amount: number;
  oldestLessonAt: string | null;
};

/** Nauczyciel widzi wyłącznie własne wypłaty. */
function assertScope(actor: Actor, teacherId: string): void {
  if (actor.role === "TEACHER" && actor.teacherProfileId !== teacherId) {
    throw new NotFoundError("Nie znaleziono nauczyciela.");
  }
}

/** Lekcje do rozliczenia z nauczycielem, z kwotą wg jego stawek. */
async function unpaidLessons(teacherId: string): Promise<{
  ids: string[];
  amount: number;
  oldest: Date | null;
}> {
  const lessons = await prisma.lesson.findMany({
    where: {
      teacherId,
      teacherPayoutId: null,
      status: { in: ["COMPLETED", "NO_SHOW", "CANCELLED"] },
    },
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      subjectLevelId: true,
    },
    orderBy: { scheduledAt: "asc" },
  });

  const rates = await loadRateLookup({ teacherIds: [teacherId] });
  const qualifying = lessons.filter((lesson) =>
    countsTowardsTeacherPayout(lesson.status)
  );

  const amount = qualifying.reduce(
    (sum, lesson) => sum + (rates.teacher(teacherId, lesson.subjectLevelId) ?? 0),
    0
  );

  return {
    ids: qualifying.map((lesson) => lesson.id),
    amount: Number(amount.toFixed(2)),
    oldest: qualifying[0]?.scheduledAt ?? null,
  };
}

export async function getPayoutDue(
  actor: Actor,
  teacherId: string
): Promise<PayoutDueDto> {
  assertScope(actor, teacherId);
  const teacher = await prisma.teacherProfile.findUnique({
    where: { id: teacherId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!teacher) throw new NotFoundError("Nie znaleziono nauczyciela.");

  const { ids, amount, oldest } = await unpaidLessons(teacherId);
  return {
    teacherId: teacher.id,
    teacherName: `${teacher.firstName} ${teacher.lastName}`,
    lessons: ids.length,
    amount,
    oldestLessonAt: oldest?.toISOString() ?? null,
  };
}

/** Zestawienie „ile komu się należy” — tylko admin. */
export async function listPayoutsDue(actor: Actor): Promise<PayoutDueDto[]> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Zestawienie wypłat widzi tylko administrator.");
  }
  const teachers = await prisma.teacherProfile.findMany({
    where: { active: true },
    select: { id: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const rows: PayoutDueDto[] = [];
  for (const teacher of teachers) {
    rows.push(await getPayoutDue(actor, teacher.id));
  }
  return rows;
}

const PAYOUT_SELECT = {
  id: true,
  teacherId: true,
  amount: true,
  paidAt: true,
  note: true,
  teacher: { select: { firstName: true, lastName: true } },
  paidBy: { select: { email: true } },
  _count: { select: { lessons: true } },
} satisfies Prisma.PayoutSelect;

function mapPayout(
  row: Prisma.PayoutGetPayload<{ select: typeof PAYOUT_SELECT }>,
  actor: Actor
): PayoutDto {
  return {
    id: row.id,
    teacherId: row.teacherId,
    teacherName: `${row.teacher.firstName} ${row.teacher.lastName}`,
    amount: toAmount(row.amount),
    paidAt: row.paidAt.toISOString(),
    // Nauczycielowi nie jest potrzebne, kto kliknął — to sprawa admina.
    paidByEmail: actor.role === "ADMIN" ? row.paidBy.email : null,
    note: row.note,
    lessonCount: row._count.lessons,
  };
}

export async function listPayouts(
  actor: Actor,
  teacherId?: string | null
): Promise<PayoutDto[]> {
  if (actor.role === "TEACHER") {
    if (teacherId && teacherId !== actor.teacherProfileId) {
      throw new NotFoundError("Nie znaleziono nauczyciela.");
    }
    teacherId = actor.teacherProfileId;
  }

  const rows = await prisma.payout.findMany({
    where: teacherId ? { teacherId } : {},
    select: PAYOUT_SELECT,
    orderBy: { paidAt: "desc" },
  });

  return rows.map((row) => mapPayout(row, actor));
}

/**
 * Oznaczenie wypłaty. Kwota jest edytowalna (np. wypłata częściowa), ale
 * lekcje zawsze przypinamy wszystkie nierozliczone — inaczej nie dałoby się
 * potem powiedzieć, co jeszcze czeka na pieniądze.
 */
export async function recordPayout(
  actor: Actor,
  input: z.input<typeof payoutSchema>
): Promise<PayoutDto> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Wypłaty oznacza administrator.");
  }
  const data = payoutSchema.parse(input);

  const teacher = await prisma.teacherProfile.findUnique({
    where: { id: data.teacherId },
    select: { id: true },
  });
  if (!teacher) throw new NotFoundError("Nie znaleziono nauczyciela.");

  const { ids } = await unpaidLessons(data.teacherId);
  if (ids.length === 0) {
    throw new ValidationError("Ten nauczyciel nie ma lekcji do rozliczenia.");
  }

  const payout = await prisma.$transaction(async (tx) => {
    const created = await tx.payout.create({
      data: {
        teacherId: data.teacherId,
        amount: new Prisma.Decimal(data.amount.toFixed(2)),
        paidAt: data.paidAt ? wallClockToUtc(`${data.paidAt}T12:00`) : new Date(),
        paidById: actor.userId,
        note: data.note,
      },
      select: { id: true },
    });
    await tx.lesson.updateMany({
      where: { id: { in: ids } },
      data: { teacherPayoutId: created.id },
    });
    return created;
  });

  // Czytamy po identyfikatorze, nie „ostatnią z listy” — wypłata bywa wstecz
  // datowana i wtedy nie jest pierwsza w kolejności.
  const created = await prisma.payout.findUniqueOrThrow({
    where: { id: payout.id },
    select: PAYOUT_SELECT,
  });
  return mapPayout(created, actor);
}

/** Cofnięcie wypłaty — lekcje wracają do nierozliczonych. */
export async function deletePayout(actor: Actor, id: string): Promise<void> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Wypłaty cofa administrator.");
  }
  const payout = await prisma.payout.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!payout) throw new NotFoundError("Nie znaleziono wypłaty.");

  await prisma.$transaction([
    prisma.lesson.updateMany({
      where: { teacherPayoutId: id },
      data: { teacherPayoutId: null },
    }),
    prisma.payout.delete({ where: { id } }),
  ]);
}
