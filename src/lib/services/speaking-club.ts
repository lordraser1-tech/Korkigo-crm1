/**
 * Speaking Club: za każde 10 zrealizowanych lekcji uczeń dostaje jeden darmowy
 * udział. Licznik zlicza lekcje **niezależnie od przedmiotu** — tak brzmiało
 * założenie; jeśli ma być inaczej, zmienia się tylko `countEarned`.
 *
 * Odznaczać może admin (dla każdego ucznia) oraz nauczyciel (dla swoich).
 * Nie ma tu żadnych kwot, więc widok jest bezpieczny dla obu ról.
 */
import { z } from "zod";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { speakingClubUseSchema } from "@/lib/validation";

/** Ile lekcji zrealizowanych daje jeden darmowy Speaking Club. */
export const LESSONS_PER_SPEAKING_CLUB = 10;

export type SpeakingClubUseDto = {
  id: string;
  usedAt: string;
  markedByEmail: string;
  note: string | null;
};

export type SpeakingClubDto = {
  studentId: string;
  completedLessons: number;
  /** Ile udziałów uczeń wypracował. */
  earned: number;
  used: number;
  available: number;
  /** Ile lekcji brakuje do kolejnego darmowego udziału. */
  lessonsToNext: number;
  history: SpeakingClubUseDto[];
};

/** Nauczyciel operuje wyłącznie na swoich uczniach; admin na wszystkich. */
async function assertStudentInScope(
  actor: Actor,
  studentId: string
): Promise<void> {
  const student = await prisma.student.findFirst({
    where:
      actor.role === "ADMIN"
        ? { id: studentId }
        : { id: studentId, teacherId: actor.teacherProfileId },
    select: { id: true },
  });
  if (!student) throw new NotFoundError("Nie znaleziono ucznia.");
}

export async function getSpeakingClub(
  actor: Actor,
  studentId: string
): Promise<SpeakingClubDto> {
  await assertStudentInScope(actor, studentId);

  const [completedLessons, uses] = await Promise.all([
    prisma.lesson.count({ where: { studentId, status: "COMPLETED" } }),
    prisma.speakingClubUse.findMany({
      where: { studentId },
      select: {
        id: true,
        usedAt: true,
        note: true,
        markedBy: { select: { email: true } },
      },
      orderBy: { usedAt: "desc" },
    }),
  ]);

  const earned = Math.floor(completedLessons / LESSONS_PER_SPEAKING_CLUB);
  const used = uses.length;

  return {
    studentId,
    completedLessons,
    earned,
    used,
    available: Math.max(earned - used, 0),
    lessonsToNext:
      LESSONS_PER_SPEAKING_CLUB -
      (completedLessons % LESSONS_PER_SPEAKING_CLUB),
    history: uses.map((use) => ({
      id: use.id,
      usedAt: use.usedAt.toISOString(),
      markedByEmail: use.markedBy.email,
      note: use.note,
    })),
  };
}

/** Odznaczenie udziału — zmniejsza licznik i zapisuje, kto i kiedy odznaczył. */
export async function redeemSpeakingClub(
  actor: Actor,
  input: z.input<typeof speakingClubUseSchema>
): Promise<SpeakingClubDto> {
  const data = speakingClubUseSchema.parse(input);
  await assertStudentInScope(actor, data.studentId);

  const current = await getSpeakingClub(actor, data.studentId);
  if (current.available <= 0) {
    throw new ValidationError(
      `Uczeń nie ma dostępnego Speaking Clubu — brakuje jeszcze ${current.lessonsToNext} lekcji.`
    );
  }

  await prisma.speakingClubUse.create({
    data: {
      studentId: data.studentId,
      markedById: actor.userId,
      note: data.note,
    },
  });
  return getSpeakingClub(actor, data.studentId);
}

/** Cofnięcie pomyłkowego odznaczenia. */
export async function undoSpeakingClub(
  actor: Actor,
  useId: string
): Promise<void> {
  const use = await prisma.speakingClubUse.findUnique({
    where: { id: useId },
    select: { studentId: true },
  });
  if (!use) throw new NotFoundError("Nie znaleziono wpisu.");
  await assertStudentInScope(actor, use.studentId);
  await prisma.speakingClubUse.delete({ where: { id: useId } });
}
