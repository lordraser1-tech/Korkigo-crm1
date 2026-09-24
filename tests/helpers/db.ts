import { describe } from "vitest";
import { Prisma, PrismaClient, type BillingMode } from "@prisma/client";
import type { AdminActor, TeacherActor } from "@/lib/auth";

export const prisma = new PrismaClient();

/** Bez bazy testy integracyjne są pomijane zamiast wysypywać cały przebieg. */
export const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "payments", "invoice_items", "invoices", "billing_settings",
     "lesson_notes", "knowledge_base_entries", "lessons",
     "availabilities", "students", "teacher_profiles", "users"
     RESTART IDENTITY CASCADE`
  );
}

export async function createAdmin(
  email = "admin@test.pl"
): Promise<AdminActor> {
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

export async function createTeacher(
  email: string,
  rate = 60,
  firstName = "Nauczyciel"
): Promise<TeacherActor> {
  const profile = await prisma.teacherProfile.create({
    data: {
      firstName,
      lastName: "Testowy",
      ratePerLesson: new Prisma.Decimal(rate.toFixed(2)),
      user: { create: { email, passwordHash: "x", role: "TEACHER" } },
    },
  });
  return {
    userId: profile.userId,
    email,
    role: "TEACHER",
    teacherProfileId: profile.id,
  };
}

export async function createStudent(
  teacherId: string | null,
  rate = 100,
  firstName = "Uczeń",
  billingMode: BillingMode = "POSTPAID"
): Promise<string> {
  const student = await prisma.student.create({
    data: {
      firstName,
      lastName: "Testowy",
      ratePerLesson: new Prisma.Decimal(rate.toFixed(2)),
      teacherId,
      billingMode,
    },
  });
  return student.id;
}

export async function createLesson(options: {
  studentId: string;
  teacherId: string;
  scheduledAt: Date;
  status?: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
}): Promise<string> {
  const lesson = await prisma.lesson.create({
    data: {
      studentId: options.studentId,
      teacherId: options.teacherId,
      scheduledAt: options.scheduledAt,
      durationMinutes: 60,
      type: "ONE_OFF",
      status: options.status ?? "SCHEDULED",
    },
  });
  return lesson.id;
}
