/**
 * Speaking Club: 1 darmowy udział za każde 10 lekcji zrealizowanych.
 * Licznik zlicza lekcje niezależnie od przedmiotu.
 */
import { afterAll, beforeEach, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  LESSONS_PER_SPEAKING_CLUB,
  getSpeakingClub,
  redeemSpeakingClub,
  undoSpeakingClub,
} from "@/lib/services/speaking-club";
import {
  createAdmin,
  createLesson,
  createLevel,
  createStudent,
  createTeacher,
  describeDb,
  prisma,
  resetDatabase,
  setStudentRate,
  setTeacherRate,
} from "./helpers/db";

describeDb("speaking club", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let piotr: Awaited<ReturnType<typeof createTeacher>>;
  let studentId: string;

  /** Tworzy N lekcji zrealizowanych, tydzień po tygodniu. */
  async function completed(count: number, subjectLevelId?: string) {
    for (let index = 0; index < count; index += 1) {
      await createLesson({
        studentId,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date(2026, 0, 5 + index * 7, 15),
        status: "COMPLETED",
        subjectLevelId,
      });
    }
  }

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    piotr = await createTeacher("piotr@test.pl", 55, "Piotr");
    studentId = await createStudent(anna.teacherProfileId, 100, "Olena");
  });

  it("licznik rośnie co dziesięć zrealizowanych lekcji", async () => {
    await completed(9);
    let club = await getSpeakingClub(anna, studentId);
    expect(club.earned).toBe(0);
    expect(club.available).toBe(0);
    expect(club.lessonsToNext).toBe(1);

    await completed(1);
    club = await getSpeakingClub(anna, studentId);
    expect(club.completedLessons).toBe(LESSONS_PER_SPEAKING_CLUB);
    expect(club.earned).toBe(1);
    expect(club.available).toBe(1);
    expect(club.lessonsToNext).toBe(LESSONS_PER_SPEAKING_CLUB);
  });

  it("lekcje liczą się niezależnie od przedmiotu", async () => {
    const maturalny = await createLevel("Polski", "Maturalny");
    await setTeacherRate(anna.teacherProfileId, maturalny, 80);
    await setStudentRate(studentId, maturalny, 120);

    await completed(5);
    await completed(5, maturalny);

    const club = await getSpeakingClub(anna, studentId);
    expect(club.available).toBe(1);
  });

  it("lekcje odwołane nie liczą się do licznika", async () => {
    await completed(9);
    await createLesson({
      studentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date("2026-03-02T14:00:00Z"),
      status: "CANCELLED",
    });
    const club = await getSpeakingClub(anna, studentId);
    expect(club.available).toBe(0);
  });

  it("odznaczenie zmniejsza licznik i zapisuje, kto odznaczył", async () => {
    await completed(20);
    const club = await redeemSpeakingClub(anna, {
      studentId,
      note: "Konwersacje czwartkowe",
    });

    expect(club.earned).toBe(2);
    expect(club.used).toBe(1);
    expect(club.available).toBe(1);
    expect(club.history[0].markedByEmail).toBe(anna.email);
    expect(club.history[0].note).toBe("Konwersacje czwartkowe");
  });

  it("nie da się odznaczyć bez dostępnego udziału", async () => {
    await completed(5);
    await expect(
      redeemSpeakingClub(anna, { studentId })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("nauczyciel nie odznaczy cudzego ucznia", async () => {
    const obcyId = await createStudent(piotr.teacherProfileId, 150, "Dzmitry");
    await createLesson({
      studentId: obcyId,
      teacherId: piotr.teacherProfileId,
      scheduledAt: new Date("2026-01-05T14:00:00Z"),
      status: "COMPLETED",
    });

    await expect(getSpeakingClub(anna, obcyId)).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(
      redeemSpeakingClub(anna, { studentId: obcyId })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("admin odznacza każdemu uczniowi", async () => {
    await completed(10);
    const club = await redeemSpeakingClub(admin, { studentId });
    expect(club.used).toBe(1);
    expect(club.history[0].markedByEmail).toBe(admin.email);
  });

  it("pomyłkowe odznaczenie da się cofnąć", async () => {
    await completed(10);
    const club = await redeemSpeakingClub(admin, { studentId });
    await undoSpeakingClub(admin, club.history[0].id);

    const after = await getSpeakingClub(admin, studentId);
    expect(after.used).toBe(0);
    expect(after.available).toBe(1);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
