import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { monthRange } from "@/lib/datetime";
import { loadRateLookup } from "@/lib/services/subjects";

export type EarningsRow = {
  studentId: string;
  studentName: string;
  completedLessons: number;
  amount: number;
};

export type SubjectEarningsRow = {
  subjectLevelId: string;
  label: string;
  completedLessons: number;
  amount: number;
};

export type TeacherEarnings = {
  teacherId: string;
  teacherName: string;
  monthKey: string;
  completedLessons: number;
  cancelledLessons: number;
  noShowLessons: number;
  scheduledLessons: number;
  total: number;
  byStudent: EarningsRow[];
  /** Rozbicie na przedmioty/poziomy — stawka bywa inna dla każdego z nich. */
  bySubject: SubjectEarningsRow[];
};

/**
 * Zarobki nauczyciela: suma jego stawek za lekcje ZREALIZOWANE. Stawka bywa
 * inna dla każdego przedmiotu/poziomu, więc liczymy lekcja po lekcji.
 * Cen ucznia ta funkcja nie dotyka w ogóle — także dla admina.
 */
export async function getTeacherEarnings(
  actor: Actor,
  teacherId: string,
  monthKey: string
): Promise<TeacherEarnings> {
  if (actor.role === "TEACHER" && actor.teacherProfileId !== teacherId) {
    throw new NotFoundError("Nie znaleziono nauczyciela.");
  }

  const teacher = await prisma.teacherProfile.findUnique({
    where: { id: teacherId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!teacher) throw new NotFoundError("Nie znaleziono nauczyciela.");

  const { from, to } = monthRange(monthKey);
  const lessons = await prisma.lesson.findMany({
    where: { teacherId, scheduledAt: { gte: from, lt: to } },
    select: {
      status: true,
      studentId: true,
      subjectLevelId: true,
      subjectLevel: {
        select: { name: true, subject: { select: { name: true } } },
      },
      student: { select: { firstName: true, lastName: true } },
    },
  });

  const rates = await loadRateLookup({ teacherIds: [teacherId] });
  const byStudent = new Map<string, EarningsRow>();
  const bySubject = new Map<string, SubjectEarningsRow>();
  let total = 0;
  let completed = 0;
  let cancelled = 0;
  let noShow = 0;
  let scheduled = 0;

  for (const lesson of lessons) {
    if (lesson.status === "CANCELLED") cancelled += 1;
    if (lesson.status === "NO_SHOW") noShow += 1;
    if (lesson.status === "SCHEDULED") scheduled += 1;
    if (lesson.status !== "COMPLETED") continue;

    completed += 1;
    // Brak stawki (np. skasowanej po fakcie) liczymy jako zero, żeby widok
    // się nie wysypał — admin i tak zobaczy zaniżoną kwotę i ją uzupełni.
    const amount = rates.teacher(teacherId, lesson.subjectLevelId) ?? 0;
    total += amount;

    const name = `${lesson.student.firstName} ${lesson.student.lastName}`;
    const row = byStudent.get(lesson.studentId) ?? {
      studentId: lesson.studentId,
      studentName: name,
      completedLessons: 0,
      amount: 0,
    };
    row.completedLessons += 1;
    row.amount = Number((row.amount + amount).toFixed(2));
    byStudent.set(lesson.studentId, row);

    const label = `${lesson.subjectLevel.subject.name} · ${lesson.subjectLevel.name}`;
    const subjectRow = bySubject.get(lesson.subjectLevelId) ?? {
      subjectLevelId: lesson.subjectLevelId,
      label,
      completedLessons: 0,
      amount: 0,
    };
    subjectRow.completedLessons += 1;
    subjectRow.amount = Number((subjectRow.amount + amount).toFixed(2));
    bySubject.set(lesson.subjectLevelId, subjectRow);
  }

  return {
    teacherId: teacher.id,
    teacherName: `${teacher.firstName} ${teacher.lastName}`,
    monthKey,
    completedLessons: completed,
    cancelledLessons: cancelled,
    noShowLessons: noShow,
    scheduledLessons: scheduled,
    total: Number(total.toFixed(2)),
    byStudent: [...byStudent.values()].sort((a, b) =>
      a.studentName.localeCompare(b.studentName, "pl")
    ),
    bySubject: [...bySubject.values()].sort((a, b) =>
      a.label.localeCompare(b.label, "pl")
    ),
  };
}

export type AdminTeacherRow = {
  teacherId: string;
  teacherName: string;
  completedLessons: number;
  revenue: number;
  cost: number;
  margin: number;
};

export type AdminFinanceSummary = {
  monthKey: string;
  completedLessons: number;
  revenue: number;
  cost: number;
  margin: number;
  perTeacher: AdminTeacherRow[];
};

/**
 * Zestawienie dla admina: przychód (stawki uczniów) minus koszt (stawki
 * nauczycieli) za lekcje zrealizowane w danym miesiącu.
 *
 * Liczymy po AKTUALNYCH stawkach z `TeacherRate` i `StudentRate`. Kwoty na
 * wystawionych rachunkach są już utrwalone w pozycjach, więc zmiana cennika
 * nie rusza dokumentów wydanych uczniom.
 */
export async function getAdminFinanceSummary(
  actor: Actor,
  monthKey: string
): Promise<AdminFinanceSummary> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Zestawienie finansowe widzi tylko administrator.");
  }

  const { from, to } = monthRange(monthKey);
  const lessons = await prisma.lesson.findMany({
    where: { status: "COMPLETED", scheduledAt: { gte: from, lt: to } },
    select: {
      teacherId: true,
      studentId: true,
      subjectLevelId: true,
      teacher: { select: { firstName: true, lastName: true } },
    },
  });

  const rates = await loadRateLookup();

  const perTeacher = new Map<string, AdminTeacherRow>();
  let revenue = 0;
  let cost = 0;

  for (const lesson of lessons) {
    const studentRate =
      rates.student(lesson.studentId, lesson.subjectLevelId) ?? 0;
    const teacherRate =
      rates.teacher(lesson.teacherId, lesson.subjectLevelId) ?? 0;
    revenue += studentRate;
    cost += teacherRate;

    const row = perTeacher.get(lesson.teacherId) ?? {
      teacherId: lesson.teacherId,
      teacherName: `${lesson.teacher.firstName} ${lesson.teacher.lastName}`,
      completedLessons: 0,
      revenue: 0,
      cost: 0,
      margin: 0,
    };
    row.completedLessons += 1;
    row.revenue = Number((row.revenue + studentRate).toFixed(2));
    row.cost = Number((row.cost + teacherRate).toFixed(2));
    row.margin = Number((row.revenue - row.cost).toFixed(2));
    perTeacher.set(lesson.teacherId, row);
  }

  return {
    monthKey,
    completedLessons: lessons.length,
    revenue: Number(revenue.toFixed(2)),
    cost: Number(cost.toFixed(2)),
    margin: Number((revenue - cost).toFixed(2)),
    perTeacher: [...perTeacher.values()].sort((a, b) => b.margin - a.margin),
  };
}
