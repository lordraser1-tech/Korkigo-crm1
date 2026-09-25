/**
 * Przedmioty, poziomy i stawki per przedmiot/poziom.
 *
 * Granica ról: nauczyciel widzi własne stawki, ale nigdy cen uczniów ani
 * stawek kolegów; ustala je wyłącznie admin.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  createSubject,
  createSubjectLevel,
  deleteSubjectLevel,
  getStudentRateMatrix,
  getStudentRates,
  getTeacherRateMatrix,
  getTeacherRates,
  listSubjects,
  resolveLessonRates,
  setTeacherRate,
} from "@/lib/services/subjects";
import { createLessons, listLessons } from "@/lib/services/lessons";
import { getTeacherEarnings } from "@/lib/services/finance";
import {
  createAdmin,
  createLesson,
  createLevel,
  createStudent,
  createTeacher,
  describeDb,
  getDefaultLevelId,
  prisma,
  resetDatabase,
  setStudentRate as seedStudentRate,
  setTeacherRate as seedTeacherRate,
} from "./helpers/db";

describeDb("przedmioty i stawki", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let piotr: Awaited<ReturnType<typeof createTeacher>>;
  let studentId: string;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    piotr = await createTeacher("piotr@test.pl", 55, "Piotr");
    studentId = await createStudent(anna.teacherProfileId, 100, "Olena");
  });

  // ---------- STRUKTURA ----------

  describe("przedmioty i poziomy", () => {
    it("admin tworzy przedmiot z dowolną liczbą poziomów", async () => {
      const subject = await createSubject(admin, { name: "Matematyka" });
      await createSubjectLevel(admin, {
        subjectId: subject.id,
        name: "Podstawowy",
      });
      await createSubjectLevel(admin, {
        subjectId: subject.id,
        name: "Rozszerzony",
      });

      const subjects = await listSubjects(admin);
      const matematyka = subjects.find((item) => item.name === "Matematyka")!;
      expect(matematyka.levels.map((level) => level.name).sort()).toEqual([
        "Podstawowy",
        "Rozszerzony",
      ]);
    });

    it("nauczyciel widzi listę przedmiotów, ale jej nie zmienia", async () => {
      expect((await listSubjects(anna)).length).toBeGreaterThan(0);
      await expect(
        createSubject(anna, { name: "Fizyka" })
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("nie ma dwóch takich samych poziomów w jednym przedmiocie", async () => {
      const subject = await createSubject(admin, { name: "Fizyka" });
      await createSubjectLevel(admin, { subjectId: subject.id, name: "Ogólny" });
      await expect(
        createSubjectLevel(admin, { subjectId: subject.id, name: "Ogólny" })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("poziomu z historią lekcji nie da się usunąć", async () => {
      await createLesson({
        studentId,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-09-21T14:00:00Z"),
      });
      await expect(
        deleteSubjectLevel(admin, getDefaultLevelId())
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  // ---------- STAWKI ----------

  describe("stawki", () => {
    it("jeden nauczyciel ma różne stawki dla różnych poziomów", async () => {
      const maturalny = await createLevel("Polski", "Maturalny");
      await setTeacherRate(admin, {
        teacherId: anna.teacherProfileId,
        subjectLevelId: maturalny,
        amount: "80",
      });

      const rates = await getTeacherRates(admin, anna.teacherProfileId);
      const byLabel = new Map(rates.rates.map((r) => [r.label, r.amount]));
      expect(byLabel.get("Polski · Ogólny")).toBe(60);
      expect(byLabel.get("Polski · Maturalny")).toBe(80);
    });

    it("cena ucznia jest indywidualna, nie wspólna dla poziomu", async () => {
      const drugiUczen = await createStudent(anna.teacherProfileId, 130, "Sofia");
      const ceny = await Promise.all([
        getStudentRates(admin, studentId),
        getStudentRates(admin, drugiUczen),
      ]);
      expect(ceny[0].rates.find((r) => r.amount !== null)?.amount).toBe(100);
      expect(ceny[1].rates.find((r) => r.amount !== null)?.amount).toBe(130);
    });

    it("puste pole kasuje stawkę", async () => {
      await setTeacherRate(admin, {
        teacherId: anna.teacherProfileId,
        subjectLevelId: getDefaultLevelId(),
        amount: "",
      });
      const rates = await getTeacherRates(admin, anna.teacherProfileId);
      expect(rates.rates.every((rate) => rate.amount === null)).toBe(true);
    });

    it("nauczyciel nie dotknie cudzych stawek ani cen uczniów", async () => {
      await expect(
        setTeacherRate(anna, {
          teacherId: anna.teacherProfileId,
          subjectLevelId: getDefaultLevelId(),
          amount: "999",
        })
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        getTeacherRates(anna, piotr.teacherProfileId)
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        getStudentRates(anna, studentId)
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getStudentRateMatrix(anna)).rejects.toBeInstanceOf(
        ForbiddenError
      );
      await expect(getTeacherRateMatrix(anna)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it("macierz admina pokazuje wszystkich i puste komórki", async () => {
      const matrix = await getTeacherRateMatrix(admin);
      expect(matrix.rows).toHaveLength(2);
      expect(matrix.levels).toHaveLength(1);

      const maturalny = await createLevel("Polski", "Maturalny");
      const zNowym = await getTeacherRateMatrix(admin);
      expect(zNowym.levels).toHaveLength(2);
      const annaRow = zNowym.rows.find(
        (row) => row.teacherId === anna.teacherProfileId
      )!;
      expect(
        annaRow.rates.find((rate) => rate.subjectLevelId === maturalny)?.amount
      ).toBeNull();
    });
  });

  // ---------- BLOKADA ZAPISU LEKCJI ----------

  describe("walidacja przy zapisie lekcji", () => {
    it("brak stawki nauczyciela blokuje zapis", async () => {
      const maturalny = await createLevel("Polski", "Maturalny");
      await seedStudentRate(studentId, maturalny, 120);

      await expect(
        createLessons(anna, {
          studentId,
          subjectLevelId: maturalny,
          scheduledAt: "2026-09-21T16:00",
        })
      ).rejects.toThrow(/stawki nauczyciela/);
    });

    it("brak ceny ucznia blokuje zapis", async () => {
      const maturalny = await createLevel("Polski", "Maturalny");
      await seedTeacherRate(anna.teacherProfileId, maturalny, 80);

      await expect(
        createLessons(anna, {
          studentId,
          subjectLevelId: maturalny,
          scheduledAt: "2026-09-21T16:00",
        })
      ).rejects.toThrow(/ceny dla ucznia/);
    });

    it("komplet stawek przepuszcza zapis i zapamiętuje przedmiot", async () => {
      const maturalny = await createLevel("Polski", "Maturalny");
      await seedTeacherRate(anna.teacherProfileId, maturalny, 80);
      await seedStudentRate(studentId, maturalny, 120);

      const [lesson] = await createLessons(anna, {
        studentId,
        subjectLevelId: maturalny,
        scheduledAt: "2026-09-21T16:00",
      });
      expect(lesson.subjectLevelId).toBe(maturalny);
      expect(lesson.subjectLabel).toBe("Polski · Maturalny");
    });

    it("resolveLessonRates podaje obie kwoty", async () => {
      const pricing = await resolveLessonRates({
        teacherId: anna.teacherProfileId,
        studentId,
        subjectLevelId: getDefaultLevelId(),
      });
      expect(pricing.teacherAmount).toBe(60);
      expect(pricing.studentAmount).toBe(100);
    });
  });

  // ---------- WPŁYW NA ZAROBKI ----------

  it("zarobki liczą stawkę właściwą dla przedmiotu każdej lekcji", async () => {
    const maturalny = await createLevel("Polski", "Maturalny");
    await seedTeacherRate(anna.teacherProfileId, maturalny, 80);
    await seedStudentRate(studentId, maturalny, 120);

    // Jedna lekcja po 60 zł (ogólny) i jedna po 80 zł (maturalny).
    await createLesson({
      studentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date("2026-09-07T14:00:00Z"),
      status: "COMPLETED",
    });
    await createLesson({
      studentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date("2026-09-14T14:00:00Z"),
      status: "COMPLETED",
      subjectLevelId: maturalny,
    });

    const earnings = await getTeacherEarnings(
      anna,
      anna.teacherProfileId,
      "2026-09"
    );
    expect(earnings.completedLessons).toBe(2);
    expect(earnings.total).toBe(140);
    expect(earnings.bySubject).toHaveLength(2);
    expect(
      earnings.bySubject.find((row) => row.label === "Polski · Maturalny")?.amount
    ).toBe(80);
  });

  it("przedmiot lekcji widać w listach", async () => {
    await createLesson({
      studentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date("2026-09-21T14:00:00Z"),
    });
    const [lesson] = await listLessons(anna);
    expect(lesson.subjectLabel).toBe("Polski · Ogólny");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
