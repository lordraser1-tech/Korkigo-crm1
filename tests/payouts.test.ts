/**
 * Rejestr wypłat dla nauczycieli.
 *
 * Reguła „za co płacimy” mieszka w `src/lib/policy.ts`; tutaj pilnujemy, że
 * lekcja trafia do wypłaty dokładnie raz i że nauczyciel nie zobaczy cudzych
 * rozliczeń ani tego, kto wypłatę oznaczył.
 */
import { afterAll, beforeEach, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  deletePayout,
  getPayoutDue,
  listPayouts,
  listPayoutsDue,
  recordPayout,
} from "@/lib/services/payouts";
import { cancelLesson, setLessonStatus } from "@/lib/services/lessons";
import {
  createAdmin,
  createLesson,
  createLevel,
  createStudent,
  createTeacher,
  describeDb,
  prisma,
  resetDatabase,
  setTeacherRate,
} from "./helpers/db";

const WEEK_1 = new Date("2026-09-21T14:00:00Z");
const WEEK_2 = new Date("2026-09-28T14:00:00Z");

describeDb("wypłaty nauczycieli", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let piotr: Awaited<ReturnType<typeof createTeacher>>;
  let annaStudentId: string;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    piotr = await createTeacher("piotr@test.pl", 55, "Piotr");
    annaStudentId = await createStudent(anna.teacherProfileId, 100, "Olena");
  });

  async function completed(scheduledAt: Date): Promise<string> {
    const id = await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt,
    });
    await setLessonStatus(admin, id, "COMPLETED");
    return id;
  }

  it("do wypłaty wchodzą lekcje zrealizowane i nieobecności", async () => {
    await completed(WEEK_1);
    const noShow = await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: WEEK_2,
    });
    await setLessonStatus(admin, noShow, "NO_SHOW");

    const due = await getPayoutDue(admin, anna.teacherProfileId);
    expect(due.lessons).toBe(2);
    expect(due.amount).toBe(120);
  });

  it("odwołana lekcja nie należy się nauczycielowi, nawet gdy uczeń zapłacił", async () => {
    const id = await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: WEEK_1,
    });
    // Odwołanie na ostatnią chwilę: uczeń płaci 100 zł kary.
    const lesson = await cancelLesson(
      admin,
      id,
      {},
      new Date(WEEK_1.getTime() - 60 * 60 * 1000)
    );
    expect(lesson.cancellationAmount).toBe(100);

    const due = await getPayoutDue(admin, anna.teacherProfileId);
    expect(due.lessons).toBe(0);
    expect(due.amount).toBe(0);
  });

  it("stawka liczy się osobno dla każdego przedmiotu", async () => {
    const maturalny = await createLevel("Polski", "Maturalny");
    await setTeacherRate(anna.teacherProfileId, maturalny, 90);

    await completed(WEEK_1);
    const drugi = await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: WEEK_2,
      subjectLevelId: maturalny,
    });
    await setLessonStatus(admin, drugi, "COMPLETED");

    expect((await getPayoutDue(admin, anna.teacherProfileId)).amount).toBe(150);
  });

  it("oznaczona wypłata zdejmuje lekcje z listy do rozliczenia", async () => {
    await completed(WEEK_1);
    await completed(WEEK_2);

    const payout = await recordPayout(admin, {
      teacherId: anna.teacherProfileId,
      amount: "120",
      paidAt: "2026-09-30",
    });
    expect(payout.lessonCount).toBe(2);
    expect(payout.amount).toBe(120);

    expect((await getPayoutDue(admin, anna.teacherProfileId)).lessons).toBe(0);
  });

  it("nowe lekcje po wypłacie znów czekają na rozliczenie", async () => {
    await completed(WEEK_1);
    await recordPayout(admin, { teacherId: anna.teacherProfileId, amount: "60" });

    await completed(WEEK_2);
    expect((await getPayoutDue(admin, anna.teacherProfileId)).lessons).toBe(1);
  });

  it("wypłata wstecz datowana wraca jako ta właśnie zapisana", async () => {
    await completed(WEEK_1);
    await recordPayout(admin, {
      teacherId: anna.teacherProfileId,
      amount: "60",
      paidAt: "2026-10-05",
    });

    await completed(WEEK_2);
    const older = await recordPayout(admin, {
      teacherId: anna.teacherProfileId,
      amount: "60",
      paidAt: "2026-09-01",
      note: "zaliczka",
    });
    expect(older.note).toBe("zaliczka");
    expect(older.lessonCount).toBe(1);
  });

  it("cofnięcie wypłaty zwraca lekcje do nierozliczonych", async () => {
    await completed(WEEK_1);
    const payout = await recordPayout(admin, {
      teacherId: anna.teacherProfileId,
      amount: "60",
    });

    await deletePayout(admin, payout.id);
    expect((await getPayoutDue(admin, anna.teacherProfileId)).lessons).toBe(1);
    expect(await listPayouts(admin, anna.teacherProfileId)).toHaveLength(0);
  });

  it("bez lekcji nie da się oznaczyć wypłaty", async () => {
    await expect(
      recordPayout(admin, { teacherId: anna.teacherProfileId, amount: "60" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  // ---------- GRANICE RÓL ----------

  it("nauczyciel nie oznaczy ani nie cofnie wypłaty", async () => {
    await completed(WEEK_1);
    await expect(
      recordPayout(anna, { teacherId: anna.teacherProfileId, amount: "60" })
    ).rejects.toBeInstanceOf(ForbiddenError);

    const payout = await recordPayout(admin, {
      teacherId: anna.teacherProfileId,
      amount: "60",
    });
    await expect(deletePayout(anna, payout.id)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("nauczyciel nie zobaczy rozliczenia innego nauczyciela", async () => {
    await expect(
      getPayoutDue(anna, piotr.teacherProfileId)
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      listPayouts(anna, piotr.teacherProfileId)
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(listPayoutsDue(anna)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nauczyciel dostaje wyłącznie własne wypłaty, bez tego kto je oznaczył", async () => {
    await completed(WEEK_1);
    await recordPayout(admin, { teacherId: anna.teacherProfileId, amount: "60" });

    const own = await listPayouts(anna);
    expect(own).toHaveLength(1);
    expect(own[0].teacherId).toBe(anna.teacherProfileId);
    expect(own[0].paidByEmail).toBeNull();

    const forAdmin = await listPayouts(admin, anna.teacherProfileId);
    expect(forAdmin[0].paidByEmail).toBe(admin.email);
  });

  it("zestawienie admina obejmuje wszystkich aktywnych nauczycieli", async () => {
    await completed(WEEK_1);
    const rows = await listPayoutsDue(admin);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.teacherId === piotr.teacherProfileId)?.lessons).toBe(0);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
