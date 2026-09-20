/**
 * Testy reguł dostępu z CLAUDE.md: nauczyciel widzi wyłącznie swoje dane i
 * nigdy nie dostaje stawki ucznia. Egzekwowanie sprawdzamy na warstwie
 * serwisowej — tej samej, z której korzystają API i panele.
 */
import { afterAll, beforeEach, expect, it } from "vitest";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  createStudent as createStudentService,
  getStudent,
  listStudents,
  updateStudent,
} from "@/lib/services/students";
import {
  getTeacher,
  listTeachers,
  updateTeacher,
  listAvailability,
  createAvailability,
} from "@/lib/services/teachers";
import {
  createLessons,
  listLessons,
  setLessonStatus,
  upcomingLessons,
} from "@/lib/services/lessons";
import {
  getAdminFinanceSummary,
  getTeacherEarnings,
} from "@/lib/services/finance";
import {
  createAdmin,
  createLesson,
  createStudent,
  createTeacher,
  describeDb,
  prisma,
  resetDatabase,
} from "./helpers/db";

describeDb("uprawnienia ról", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let piotr: Awaited<ReturnType<typeof createTeacher>>;
  let annaStudentId: string;
  let piotrStudentId: string;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    piotr = await createTeacher("piotr@test.pl", 55, "Piotr");
    annaStudentId = await createStudent(anna.teacherProfileId, 120, "Olena");
    piotrStudentId = await createStudent(piotr.teacherProfileId, 150, "Dzmitry");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------- UCZNIOWIE ----------

  it("nauczyciel widzi tylko swoich uczniów", async () => {
    const students = await listStudents(anna);
    expect(students).toHaveLength(1);
    expect(students[0].id).toBe(annaStudentId);
  });

  it("nauczyciel nigdy nie dostaje stawki ucznia", async () => {
    const [student] = await listStudents(anna);
    expect(student.ratePerLesson).toBeNull();

    const single = await getStudent(anna, annaStudentId);
    expect(single.ratePerLesson).toBeNull();
  });

  it("admin widzi wszystkich uczniów ze stawkami", async () => {
    const students = await listStudents(admin);
    expect(students).toHaveLength(2);
    expect(students.map((s) => s.ratePerLesson).sort()).toEqual([120, 150]);
  });

  it("cudzy uczeń jest dla nauczyciela nieodnajdywalny", async () => {
    await expect(getStudent(anna, piotrStudentId)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("filtr po nauczycielu nie pozwala podejrzeć cudzych uczniów", async () => {
    const students = await listStudents(anna, {
      teacherId: piotr.teacherProfileId,
    });
    expect(students.every((s) => s.teacherId === anna.teacherProfileId)).toBe(true);
  });

  it("nauczyciel dodaje ucznia do siebie, ze stawką 0 do ustalenia przez admina", async () => {
    const created = await createStudentService(anna, {
      firstName: "Nowy",
      lastName: "Uczeń",
    });
    expect(created.teacherId).toBe(anna.teacherProfileId);
    expect(created.ratePerLesson).toBeNull();

    const fromDb = await prisma.student.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(fromDb.ratePerLesson.toNumber()).toBe(0);
  });

  it("nauczyciel nie ustawi stawki ucznia przy dodawaniu", async () => {
    await expect(
      createStudentService(anna, {
        firstName: "Nowy",
        lastName: "Uczeń",
        ratePerLesson: "200",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nauczyciel nie przypisze ucznia innemu nauczycielowi", async () => {
    await expect(
      createStudentService(anna, {
        firstName: "Nowy",
        lastName: "Uczeń",
        teacherId: piotr.teacherProfileId,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nauczyciel nie zmieni stawki istniejącego ucznia", async () => {
    await expect(
      updateStudent(anna, annaStudentId, { ratePerLesson: "1" })
    ).rejects.toBeInstanceOf(ForbiddenError);

    const fromDb = await prisma.student.findUniqueOrThrow({
      where: { id: annaStudentId },
    });
    expect(fromDb.ratePerLesson.toNumber()).toBe(120);
  });

  it("nauczyciel nie edytuje cudzego ucznia", async () => {
    await expect(
      updateStudent(anna, piotrStudentId, { firstName: "Zmiana" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("admin ustawia stawkę ucznia", async () => {
    const updated = await updateStudent(admin, annaStudentId, {
      ratePerLesson: "135,50",
    });
    expect(updated.ratePerLesson).toBe(135.5);
  });

  // ---------- NAUCZYCIELE ----------

  it("nauczyciel nie zobaczy listy nauczycieli", async () => {
    await expect(listTeachers(anna)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nauczyciel nie zobaczy danych innego nauczyciela", async () => {
    await expect(
      getTeacher(anna, piotr.teacherProfileId)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("nauczyciel widzi własny profil razem ze swoją stawką", async () => {
    const profile = await getTeacher(anna, anna.teacherProfileId);
    expect(profile.ratePerLesson).toBe(60);
  });

  it("nauczyciel nie zmieni własnej stawki ani statusu konta", async () => {
    await expect(
      updateTeacher(anna, anna.teacherProfileId, { ratePerLesson: "999" })
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateTeacher(anna, anna.teacherProfileId, { active: false })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nauczyciel może poprawić własne dane kontaktowe", async () => {
    const updated = await updateTeacher(anna, anna.teacherProfileId, {
      phone: "+48 600 100 200",
    });
    expect(updated.phone).toBe("+48 600 100 200");
  });

  it("admin zmienia stawkę nauczyciela", async () => {
    const updated = await updateTeacher(admin, anna.teacherProfileId, {
      ratePerLesson: "70",
    });
    expect(updated.ratePerLesson).toBe(70);
  });

  it("nauczyciel nie dopisze dyspozycyjności innemu nauczycielowi", async () => {
    await expect(
      createAvailability(anna, {
        teacherId: piotr.teacherProfileId,
        dayOfWeek: 1,
        startTime: "16:00",
        endTime: "20:00",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);

    await createAvailability(anna, {
      dayOfWeek: 1,
      startTime: "16:00",
      endTime: "20:00",
    });
    const own = await listAvailability(anna);
    expect(own).toHaveLength(1);
    expect(own[0].teacherId).toBe(anna.teacherProfileId);
  });

  // ---------- LEKCJE ----------

  it("nauczyciel widzi tylko swoje lekcje", async () => {
    await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date("2026-09-21T14:00:00Z"),
    });
    const piotrLessonId = await createLesson({
      studentId: piotrStudentId,
      teacherId: piotr.teacherProfileId,
      scheduledAt: new Date("2026-09-21T15:00:00Z"),
    });

    const lessons = await listLessons(anna);
    expect(lessons).toHaveLength(1);
    expect(lessons[0].teacherId).toBe(anna.teacherProfileId);

    const all = await listLessons(admin);
    expect(all).toHaveLength(2);

    await expect(
      setLessonStatus(anna, piotrLessonId, "COMPLETED")
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("nauczyciel nie zaplanuje lekcji cudzemu uczniowi", async () => {
    await expect(
      createLessons(anna, {
        studentId: piotrStudentId,
        scheduledAt: "2026-09-21T16:00",
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lekcja cykliczna tworzy serię w tych samych godzinach lokalnych", async () => {
    const created = await createLessons(anna, {
      studentId: annaStudentId,
      scheduledAt: "2026-10-21T16:00",
      type: "RECURRING",
      repeatWeeks: 3,
    });

    expect(created).toHaveLength(3);
    expect(new Set(created.map((l) => l.seriesId)).size).toBe(1);
    expect(created.map((l) => l.scheduledAt)).toEqual([
      "2026-10-21T14:00:00.000Z", // czas letni (UTC+2)
      "2026-10-28T15:00:00.000Z", // po zmianie czasu (UTC+1), nadal 16:00 lokalnie
      "2026-11-04T15:00:00.000Z",
    ]);
  });

  it("nauczyciel odznacza status własnej lekcji", async () => {
    const lessonId = await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date("2026-09-21T14:00:00Z"),
    });
    const updated = await setLessonStatus(anna, lessonId, "COMPLETED");
    expect(updated.status).toBe("COMPLETED");
  });

  // ---------- FINANSE ----------

  it("zarobki nauczyciela to lekcje zrealizowane × jego stawka", async () => {
    for (const status of ["COMPLETED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const) {
      await createLesson({
        studentId: annaStudentId,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-09-21T14:00:00Z"),
        status,
      });
    }

    const earnings = await getTeacherEarnings(anna, anna.teacherProfileId, "2026-09");
    expect(earnings.completedLessons).toBe(2);
    expect(earnings.total).toBe(120); // 2 × 60 zł
    expect(earnings.byStudent).toHaveLength(1);
    expect(earnings.byStudent[0].amount).toBe(120);
  });

  it("nauczyciel nie podejrzy zarobków innego nauczyciela", async () => {
    await expect(
      getTeacherEarnings(anna, piotr.teacherProfileId, "2026-09")
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("zestawienia finansowego nie zobaczy nauczyciel", async () => {
    await expect(
      getAdminFinanceSummary(anna, "2026-09")
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admin widzi przychód, koszt i marżę", async () => {
    await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date("2026-09-21T14:00:00Z"),
      status: "COMPLETED",
    });
    await createLesson({
      studentId: piotrStudentId,
      teacherId: piotr.teacherProfileId,
      scheduledAt: new Date("2026-09-22T14:00:00Z"),
      status: "COMPLETED",
    });

    const summary = await getAdminFinanceSummary(admin, "2026-09");
    expect(summary.revenue).toBe(270); // 120 + 150
    expect(summary.cost).toBe(115); // 60 + 55
    expect(summary.margin).toBe(155);
    expect(summary.perTeacher).toHaveLength(2);
  });

  // ---------- SZCZELNOŚĆ ----------

  it("żadna odpowiedź dla nauczyciela nie zawiera stawki ucznia", async () => {
    const studentId = await createStudent(anna.teacherProfileId, 333.77, "Sofia");
    await createLesson({
      studentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date("2026-09-21T14:00:00Z"),
      status: "COMPLETED",
    });

    const payloads = JSON.stringify([
      await listStudents(anna),
      await getStudent(anna, studentId),
      await listLessons(anna),
      await upcomingLessons(anna, 10, new Date("2026-01-01T00:00:00Z")),
      await getTeacherEarnings(anna, anna.teacherProfileId, "2026-09"),
      await getTeacher(anna, anna.teacherProfileId),
    ]);

    expect(payloads).not.toContain("333.77");
    expect(payloads).not.toContain("333,77");
  });
});
