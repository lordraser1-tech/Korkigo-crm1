/**
 * Grafik i dyspozycja: zakres widoczności oraz powiązanie lekcji z płatnością.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import { getSchedule, listAllAvailability } from "@/lib/services/schedule";
import {
  createLessonInvoice,
  createMonthlyInvoice,
  createPackageInvoice,
  getLessonPaymentStates,
  recordPayment,
} from "@/lib/services/billing";
import { createAvailability } from "@/lib/services/teachers";
import { weekStartKey } from "@/lib/datetime";
import {
  createAdmin,
  createLesson,
  createStudent,
  createTeacher,
  describeDb,
  prisma,
  resetDatabase,
} from "./helpers/db";

describeDb("grafik i dyspozycja", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let piotr: Awaited<ReturnType<typeof createTeacher>>;
  let annaStudentId: string;
  let piotrStudentId: string;

  // Poniedziałek 21 września 2026, 16:00 czasu warszawskiego = 14:00 UTC.
  const WEEK = weekStartKey("2026-09-21");
  const MONDAY_16 = new Date("2026-09-21T14:00:00Z");

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    piotr = await createTeacher("piotr@test.pl", 55, "Piotr");
    annaStudentId = await createStudent(anna.teacherProfileId, 100, "Olena");
    piotrStudentId = await createStudent(piotr.teacherProfileId, 150, "Dzmitry");

    await createAvailability(anna, {
      dayOfWeek: 1,
      startTime: "16:00",
      endTime: "20:00",
    });
    await createAvailability(admin, {
      teacherId: piotr.teacherProfileId,
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "12:00",
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------- WIDOCZNOŚĆ ----------

  it("nauczyciel widzi w grafiku wyłącznie własną dyspozycyjność", async () => {
    const schedule = await getSchedule(anna, { weekKey: WEEK });
    const windows = schedule.days.flatMap((day) => day.windows);

    expect(windows).toHaveLength(1);
    expect(windows[0].teacherId).toBe(anna.teacherProfileId);
    expect(schedule.teacherId).toBe(anna.teacherProfileId);
  });

  it("nauczyciel nie podejrzy cudzego grafiku przez parametr teacherId", async () => {
    const schedule = await getSchedule(anna, {
      weekKey: WEEK,
      teacherId: piotr.teacherProfileId,
    });
    const windows = schedule.days.flatMap((day) => day.windows);

    expect(schedule.teacherId).toBe(anna.teacherProfileId);
    expect(windows.every((w) => w.teacherId === anna.teacherProfileId)).toBe(true);
  });

  it("admin widzi dyspozycyjność wszystkich i potrafi filtrować", async () => {
    const wszyscy = await getSchedule(admin, { weekKey: WEEK });
    const teacherIds = new Set(
      wszyscy.days.flatMap((day) => day.windows).map((w) => w.teacherId)
    );
    expect(teacherIds.size).toBe(2);

    const tylkoPiotr = await getSchedule(admin, {
      weekKey: WEEK,
      teacherId: piotr.teacherProfileId,
    });
    const okna = tylkoPiotr.days.flatMap((day) => day.windows);
    expect(okna).toHaveLength(1);
    expect(okna[0].teacherId).toBe(piotr.teacherProfileId);
  });

  it("nauczyciel nie dostanie zbiorczej listy dyspozycyjności", async () => {
    await expect(listAllAvailability(anna)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await listAllAvailability(admin)).toHaveLength(2);
  });

  it("w grafiku nauczyciela nie ma cudzych lekcji", async () => {
    await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: MONDAY_16,
    });
    await createLesson({
      studentId: piotrStudentId,
      teacherId: piotr.teacherProfileId,
      scheduledAt: new Date("2026-09-21T08:00:00Z"),
    });

    const schedule = await getSchedule(anna, { weekKey: WEEK });
    const lessons = schedule.days.flatMap((day) => day.lessons);
    expect(lessons).toHaveLength(1);
    expect(lessons[0].teacherId).toBe(anna.teacherProfileId);

    const adminSchedule = await getSchedule(admin, { weekKey: WEEK });
    expect(adminSchedule.days.flatMap((day) => day.lessons)).toHaveLength(2);
  });

  // ---------- WOLNE TERMINY ----------

  it("proponuje wolne godziny z okna i pomija zajęte", async () => {
    const pusty = await getSchedule(anna, { weekKey: WEEK });
    const poniedzialek = pusty.days.find((day) => day.dayOfWeek === 1)!;
    // Okno 16:00–20:00 to cztery sloty godzinne.
    expect(poniedzialek.freeSlots.map((slot) => slot.wallClock)).toEqual([
      "2026-09-21T16:00",
      "2026-09-21T17:00",
      "2026-09-21T18:00",
      "2026-09-21T19:00",
    ]);

    await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: MONDAY_16,
    });

    const zZajeta = await getSchedule(anna, { weekKey: WEEK });
    const dzien = zZajeta.days.find((day) => day.dayOfWeek === 1)!;
    expect(dzien.freeSlots.map((slot) => slot.wallClock)).toEqual([
      "2026-09-21T17:00",
      "2026-09-21T18:00",
      "2026-09-21T19:00",
    ]);
  });

  it("odwołana lekcja zwalnia termin", async () => {
    await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: MONDAY_16,
      status: "CANCELLED",
    });
    const schedule = await getSchedule(anna, { weekKey: WEEK });
    const dzien = schedule.days.find((day) => day.dayOfWeek === 1)!;
    expect(dzien.freeSlots).toHaveLength(4);
  });

  it("liczy godziny dyspozycyjności w tygodniu", async () => {
    const schedule = await getSchedule(anna, { weekKey: WEEK });
    expect(schedule.totals.availabilityHours).toBe(4);
  });

  // ---------- POWIĄZANIE Z PŁATNOŚCIAMI ----------

  describe("status płatności lekcji", () => {
    it("lekcja bez rachunku, z rachunkiem nieopłaconym i opłaconym", async () => {
      const lessonId = await createLesson({
        studentId: annaStudentId,
        teacherId: anna.teacherProfileId,
        scheduledAt: MONDAY_16,
        status: "COMPLETED",
      });

      let states = await getLessonPaymentStates(admin, [lessonId]);
      expect(states.get(lessonId)?.state).toBe("NOT_INVOICED");

      const invoice = await createLessonInvoice(admin, {
        lessonId,
        issuedAt: "2026-09-21",
        dueDays: 7,
      });
      states = await getLessonPaymentStates(admin, [lessonId], new Date("2026-09-22"));
      expect(states.get(lessonId)?.state).toBe("UNPAID");
      expect(states.get(lessonId)?.invoiceNumber).toBe(invoice.number);

      await recordPayment(admin, {
        studentId: annaStudentId,
        invoiceId: invoice.id,
        amount: "100",
      });
      states = await getLessonPaymentStates(admin, [lessonId]);
      expect(states.get(lessonId)?.state).toBe("PAID");
    });

    it("po terminie status zmienia się na OVERDUE", async () => {
      const lessonId = await createLesson({
        studentId: annaStudentId,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-01-12T15:00:00Z"),
        status: "COMPLETED",
      });
      await createLessonInvoice(admin, {
        lessonId,
        issuedAt: "2026-01-12",
        dueDays: 7,
      });
      const states = await getLessonPaymentStates(admin, [lessonId]);
      expect(states.get(lessonId)?.state).toBe("OVERDUE");
    });

    it("nauczyciel widzi status, ale nie numer rachunku", async () => {
      const lessonId = await createLesson({
        studentId: annaStudentId,
        teacherId: anna.teacherProfileId,
        scheduledAt: MONDAY_16,
        status: "COMPLETED",
      });
      await createMonthlyInvoice(admin, {
        studentId: annaStudentId,
        month: "2026-09",
        issuedAt: "2026-09-30",
        dueDays: 7,
      });

      // Stała data „teraz”, żeby wynik nie zależał od dnia uruchomienia testów.
      const states = await getLessonPaymentStates(
        anna,
        [lessonId],
        new Date("2026-10-08T00:00:00Z")
      );
      const info = states.get(lessonId)!;
      expect(info.state).toBe("OVERDUE");
      expect(info.invoiceNumber).toBeNull();
      expect(info.invoiceId).toBeNull();
      expect(JSON.stringify(info)).not.toContain("100");
    });

    it("nauczyciel nie pozna statusu cudzej lekcji", async () => {
      const obcaLekcja = await createLesson({
        studentId: piotrStudentId,
        teacherId: piotr.teacherProfileId,
        scheduledAt: MONDAY_16,
        status: "COMPLETED",
      });
      const states = await getLessonPaymentStates(anna, [obcaLekcja]);
      expect(states.size).toBe(0);
    });

    it("pakiet: opłacone jednostki pokrywają kolejne lekcje po kolei", async () => {
      const prepaidId = await createStudent(
        anna.teacherProfileId,
        100,
        "Sofia",
        "PREPAID"
      );
      const pierwsza = await createLesson({
        studentId: prepaidId,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-09-21T14:00:00Z"),
        status: "COMPLETED",
      });
      const druga = await createLesson({
        studentId: prepaidId,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-09-28T14:00:00Z"),
        status: "SCHEDULED",
      });
      const trzecia = await createLesson({
        studentId: prepaidId,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-10-05T14:00:00Z"),
        status: "SCHEDULED",
      });

      const pakiet = await createPackageInvoice(admin, {
        studentId: prepaidId,
        quantity: 2,
        issuedAt: "2026-09-01",
      });

      // Pakiet wystawiony, ale jeszcze nieopłacony.
      let states = await getLessonPaymentStates(
        admin,
        [pierwsza, druga, trzecia],
        new Date("2026-09-02")
      );
      expect(states.get(pierwsza)?.state).toBe("UNPAID");
      expect(states.get(pierwsza)?.fromPackage).toBe(true);
      expect(states.get(trzecia)?.state).toBe("NOT_INVOICED");
      expect(states.get(trzecia)?.fromPackage).toBe(false);

      await recordPayment(admin, {
        studentId: prepaidId,
        invoiceId: pakiet.id,
        amount: pakiet.totalAmount.toFixed(2),
      });

      states = await getLessonPaymentStates(admin, [pierwsza, druga, trzecia]);
      expect(states.get(pierwsza)?.state).toBe("PAID");
      expect(states.get(druga)?.state).toBe("PAID");
      expect(states.get(trzecia)?.state).toBe("NOT_INVOICED");
    });
  });

  it("grafik liczy lekcje bez opłaty", async () => {
    await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: MONDAY_16,
      status: "COMPLETED",
    });
    await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date("2026-09-22T14:00:00Z"),
      status: "CANCELLED",
    });

    const schedule = await getSchedule(anna, { weekKey: WEEK });
    expect(schedule.totals.lessons).toBe(1);
    expect(schedule.totals.unpaidLessons).toBe(1);
  });
});
