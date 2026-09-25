/**
 * Odwoływanie lekcji i zakres edycji serii.
 *
 * Reguły naliczenia siedzą w `src/lib/policy.ts` — tutaj sprawdzamy, że serwis
 * ich używa, zapisuje moment ZGŁOSZENIA i pilnuje, kto może korygować kwotę.
 */
import { afterAll, beforeEach, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import {
  cancelLesson,
  createLessons,
  listLessons,
  previewCancellation,
  setLessonStatus,
  updateLesson,
} from "@/lib/services/lessons";
import { createLessonInvoice } from "@/lib/services/billing";
import {
  createAdmin,
  createLesson,
  createStudent,
  createTeacher,
  describeDb,
  getDefaultLevelId,
  prisma,
  resetDatabase,
} from "./helpers/db";

// Poniedziałek 21 września 2026, 16:00 czasu warszawskiego.
const LESSON_AT = new Date("2026-09-21T14:00:00Z");
const WALL_CLOCK = "2026-09-21T16:00";

function reportedHoursBefore(hours: number): string {
  const date = new Date(LESSON_AT.getTime() - hours * 60 * 60 * 1000);
  // Wrzesień: czas warszawski to UTC+2.
  return new Date(date.getTime() + 2 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}

describeDb("odwoływanie lekcji", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let studentId: string;
  let lessonId: string;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    studentId = await createStudent(anna.teacherProfileId, 100, "Olena");
    lessonId = await createLesson({
      studentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: LESSON_AT,
    });
  });

  it("odwołanie z wyprzedzeniem jest bezpłatne", async () => {
    const lesson = await cancelLesson(anna, lessonId, {
      reportedAt: reportedHoursBefore(48),
    });
    expect(lesson.status).toBe("CANCELLED");
    expect(lesson.cancellationAmount).toBe(0);
    expect(lesson.cancellationAutoAmount).toBe(0);
  });

  it("odwołanie na ostatnią chwilę kosztuje pełną cenę ucznia", async () => {
    const lesson = await cancelLesson(anna, lessonId, {
      reportedAt: reportedHoursBefore(3),
    });
    expect(lesson.cancellationAmount).toBe(100);
  });

  it("liczy się moment zgłoszenia, nie moment wpisania do systemu", async () => {
    // Wpisujemy odwołanie godzinę przed lekcją, ale uczeń zgłosił je 3 dni wcześniej.
    const lesson = await cancelLesson(
      anna,
      lessonId,
      { reportedAt: reportedHoursBefore(72) },
      new Date(LESSON_AT.getTime() - 60 * 60 * 1000)
    );
    expect(lesson.cancellationAmount).toBe(0);
    expect(lesson.cancelledReportedAt).not.toBeNull();
  });

  it("bez podanego zgłoszenia liczymy „teraz”", async () => {
    const lesson = await cancelLesson(
      anna,
      lessonId,
      {},
      new Date(LESSON_AT.getTime() - 60 * 60 * 1000)
    );
    expect(lesson.cancellationAmount).toBe(100);
  });

  it("podgląd naliczenia zgadza się z zapisem", async () => {
    const preview = await previewCancellation(
      admin,
      lessonId,
      reportedHoursBefore(20)
    );
    expect(preview).toEqual({ price: 100, percent: 50, amount: 50 });

    const lesson = await cancelLesson(admin, lessonId, {
      reportedAt: reportedHoursBefore(20),
    });
    expect(lesson.cancellationAmount).toBe(preview.amount);
  });

  it("nauczyciel nie skoryguje naliczonej kwoty", async () => {
    await expect(
      cancelLesson(anna, lessonId, {
        reportedAt: reportedHoursBefore(3),
        amount: "0",
        note: "uczeń chory",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admin koryguje kwotę, ale musi podać powód", async () => {
    await expect(
      cancelLesson(admin, lessonId, {
        reportedAt: reportedHoursBefore(3),
        amount: "0",
      })
    ).rejects.toBeInstanceOf(ValidationError);

    const lesson = await cancelLesson(admin, lessonId, {
      reportedAt: reportedHoursBefore(3),
      amount: "0",
      note: "zwolnienie lekarskie",
    });
    expect(lesson.cancellationAmount).toBe(0);
    // Kwota z regulaminu zostaje obok, żeby korekta była widoczna.
    expect(lesson.cancellationAutoAmount).toBe(100);
    expect(lesson.cancellationNote).toBe("zwolnienie lekarskie");
  });

  it("kwota zgodna z regulaminem nie wymaga powodu", async () => {
    const lesson = await cancelLesson(admin, lessonId, {
      reportedAt: reportedHoursBefore(3),
      amount: "100",
    });
    expect(lesson.cancellationAmount).toBe(100);
    expect(lesson.cancellationNote).toBeNull();
  });

  it("przycisk „Odwołana” przechodzi tą samą ścieżką co formularz", async () => {
    const lesson = await setLessonStatus(anna, lessonId, "CANCELLED");
    expect(lesson.status).toBe("CANCELLED");
    expect(lesson.cancellationAmount).not.toBeNull();
  });

  it("lekcji z nieanulowanego rachunku nie da się odwołać", async () => {
    await setLessonStatus(anna, lessonId, "COMPLETED");
    await createLessonInvoice(admin, { lessonId });
    await expect(cancelLesson(admin, lessonId, {})).rejects.toBeInstanceOf(
      ValidationError
    );
  });
});

describeDb("zakres edycji lekcji cyklicznej", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let studentId: string;

  async function series(): Promise<string[]> {
    const lessons = await createLessons(admin, {
      studentId,
      teacherId: anna.teacherProfileId,
      subjectLevelId: getDefaultLevelId(),
      scheduledAt: WALL_CLOCK,
      type: "RECURRING",
      repeatWeeks: 4,
    });
    return lessons.map((lesson) => lesson.id);
  }

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    studentId = await createStudent(anna.teacherProfileId, 100, "Olena");
  });

  it("„tylko ta” przesuwa jedną lekcję i odczepia ją od serii", async () => {
    const [first, second] = await series();
    const before = (await listLessons(admin, {})).find((l) => l.id === second)!;

    const updated = await updateLesson(
      admin,
      first,
      { scheduledAt: "2026-09-21T18:00" },
      "ONE"
    );
    expect(updated.detachedFromSeries).toBe(true);

    const after = (await listLessons(admin, {})).find((l) => l.id === second)!;
    expect(after.scheduledAt).toBe(before.scheduledAt);
  });

  it("„ta i kolejne” przesuwa następne lekcje o tę samą różnicę", async () => {
    const [first, second, third] = await series();

    await updateLesson(admin, first, { scheduledAt: "2026-09-21T18:00" }, "FUTURE");

    const lessons = await listLessons(admin, {});
    const byId = new Map(lessons.map((lesson) => [lesson.id, lesson]));
    // +2 h na każdej kolejnej lekcji, termin tygodniowy zostaje zachowany.
    expect(byId.get(second)!.scheduledAt).toBe(
      new Date("2026-09-28T16:00:00Z").toISOString()
    );
    expect(byId.get(third)!.scheduledAt).toBe(
      new Date("2026-10-05T16:00:00Z").toISOString()
    );
  });

  it("„ta i kolejne” nie rusza lekcji wcześniejszych", async () => {
    const [first, second, third] = await series();

    await updateLesson(admin, second, { scheduledAt: "2026-09-28T18:00" }, "FUTURE");

    const byId = new Map(
      (await listLessons(admin, {})).map((lesson) => [lesson.id, lesson])
    );
    expect(byId.get(first)!.scheduledAt).toBe(LESSON_AT.toISOString());
    expect(byId.get(third)!.scheduledAt).toBe(
      new Date("2026-10-05T16:00:00Z").toISOString()
    );
  });

  it("lekcja odczepiona zostaje poza zbiorczą zmianą", async () => {
    const [first, second, third] = await series();

    await updateLesson(admin, second, { durationMinutes: 45 }, "ONE");
    await updateLesson(admin, first, { durationMinutes: 90 }, "FUTURE");

    const byId = new Map(
      (await listLessons(admin, {})).map((lesson) => [lesson.id, lesson])
    );
    expect(byId.get(second)!.durationMinutes).toBe(45);
    expect(byId.get(third)!.durationMinutes).toBe(90);
  });

  it("lekcja z rachunku nie idzie za zbiorczą zmianą", async () => {
    const [first, second] = await series();
    await setLessonStatus(admin, second, "COMPLETED");
    await createLessonInvoice(admin, { lessonId: second });

    await updateLesson(admin, first, { scheduledAt: "2026-09-21T18:00" }, "FUTURE");

    const byId = new Map(
      (await listLessons(admin, {})).map((lesson) => [lesson.id, lesson])
    );
    expect(byId.get(second)!.scheduledAt).toBe(
      new Date("2026-09-28T14:00:00Z").toISOString()
    );
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
