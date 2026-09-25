import { describe } from "vitest";
import {
  Prisma,
  PrismaClient,
  type BillingMode,
  type LessonStatus,
} from "@prisma/client";
import type { AdminActor, TeacherActor } from "@/lib/auth";

export const prisma = new PrismaClient();

/** Bez bazy testy integracyjne są pomijane zamiast wysypywać cały przebieg. */
export const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Domyślny przedmiot/poziom zakładany przy każdym czyszczeniu bazy. Testy,
 * które nie sprawdzają samych przedmiotów, mogą go używać niejawnie.
 */
let defaultLevelId = "";

export function getDefaultLevelId(): string {
  if (!defaultLevelId) {
    throw new Error("Najpierw wywołaj resetDatabase().");
  }
  return defaultLevelId;
}

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "message_recipients", "messages",
     "ndg_monthly_limits", "ndg_settings",
     "payments", "invoice_items", "invoices", "billing_settings",
     "speaking_club_uses", "lesson_notes", "knowledge_base_entries",
     "reminder_logs", "lessons", "payouts", "telegram_link_tokens",
     "student_rates", "teacher_rates", "subject_levels", "subjects",
     "availability_slots", "students", "teacher_profiles", "users"
     RESTART IDENTITY CASCADE`
  );

  const subject = await prisma.subject.create({ data: { name: "Polski" } });
  const level = await prisma.subjectLevel.create({
    data: { subjectId: subject.id, name: "Ogólny" },
  });
  defaultLevelId = level.id;
}

/** Dodatkowy poziom — do testów stawek różnych dla różnych przedmiotów. */
export async function createLevel(
  subjectName: string,
  levelName: string
): Promise<string> {
  const subject = await prisma.subject.upsert({
    where: { name: subjectName },
    update: {},
    create: { name: subjectName },
  });
  const level = await prisma.subjectLevel.create({
    data: { subjectId: subject.id, name: levelName },
  });
  return level.id;
}

export async function createAdmin(email = "admin@test.pl"): Promise<AdminActor> {
  const user = await prisma.user.create({
    data: { email, passwordHash: "x", role: "ADMIN" },
  });
  return {
    userId: user.id,
    email: user.email,
    role: "ADMIN",
    teacherProfileId: null,
  };
}

/** Nauczyciel ze stawką na domyślnym poziomie (albo na wskazanym). */
export async function createTeacher(
  email: string,
  rate = 60,
  firstName = "Nauczyciel",
  subjectLevelId = defaultLevelId
): Promise<TeacherActor> {
  const profile = await prisma.teacherProfile.create({
    data: {
      firstName,
      lastName: "Testowy",
      user: { create: { email, passwordHash: "x", role: "TEACHER" } },
      rates: {
        create: [
          { subjectLevelId, amount: new Prisma.Decimal(rate.toFixed(2)) },
        ],
      },
    },
  });
  return {
    userId: profile.userId,
    email,
    role: "TEACHER",
    teacherProfileId: profile.id,
  };
}

/** Uczeń z ceną na domyślnym poziomie; `rate = 0` oznacza brak ceny. */
export async function createStudent(
  teacherId: string | null,
  rate = 100,
  firstName = "Uczeń",
  billingMode: BillingMode = "POSTPAID",
  subjectLevelId = defaultLevelId
): Promise<string> {
  const student = await prisma.student.create({
    data: {
      firstName,
      lastName: "Testowy",
      teacherId,
      billingMode,
      ...(rate > 0
        ? {
            rates: {
              create: [
                { subjectLevelId, amount: new Prisma.Decimal(rate.toFixed(2)) },
              ],
            },
          }
        : {}),
    },
  });
  return student.id;
}

export async function setTeacherRate(
  teacherId: string,
  subjectLevelId: string,
  amount: number
): Promise<void> {
  await prisma.teacherRate.upsert({
    where: { teacherId_subjectLevelId: { teacherId, subjectLevelId } },
    update: { amount: new Prisma.Decimal(amount.toFixed(2)) },
    create: {
      teacherId,
      subjectLevelId,
      amount: new Prisma.Decimal(amount.toFixed(2)),
    },
  });
}

export async function setStudentRate(
  studentId: string,
  subjectLevelId: string,
  amount: number
): Promise<void> {
  await prisma.studentRate.upsert({
    where: { studentId_subjectLevelId: { studentId, subjectLevelId } },
    update: { amount: new Prisma.Decimal(amount.toFixed(2)) },
    create: {
      studentId,
      subjectLevelId,
      amount: new Prisma.Decimal(amount.toFixed(2)),
    },
  });
}

export async function createLesson(options: {
  studentId: string;
  teacherId: string;
  scheduledAt: Date;
  status?: LessonStatus;
  subjectLevelId?: string;
}): Promise<string> {
  const lesson = await prisma.lesson.create({
    data: {
      studentId: options.studentId,
      teacherId: options.teacherId,
      subjectLevelId: options.subjectLevelId ?? defaultLevelId,
      scheduledAt: options.scheduledAt,
      durationMinutes: 60,
      type: "ONE_OFF",
      status: options.status ?? "SCHEDULED",
    },
  });
  return lesson.id;
}
