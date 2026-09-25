/**
 * Faza 2: rachunki i płatności.
 *
 * Reguły, których pilnujemy: rozliczenia widzi wyłącznie admin (nauczyciel
 * dostaje co najwyżej flagę bez kwot), numeracja jest ciągła i resetuje się
 * co miesiąc, a jedna lekcja nie może trafić na dwa rachunki.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  cancelInvoice,
  createLessonInvoice,
  createMonthlyInvoice,
  createPackageInvoice,
  deletePayment,
  getBillingSettings,
  getPaymentFlags,
  getStudentBalance,
  getStudentBilling,
  listInvoices,
  listPayments,
  listReceivables,
  listUnbilledLessons,
  recordPayment,
  updateBillingSettings,
} from "@/lib/services/billing";
import { deleteLesson, setLessonStatus } from "@/lib/services/lessons";
import { listStudents, updateStudent } from "@/lib/services/students";
import {
  createAdmin,
  createLesson,
  createStudent,
  createTeacher,
  describeDb,
  prisma,
  resetDatabase,
} from "./helpers/db";

describeDb("rachunki i płatności", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let studentId: string;

  /** Lekcja zrealizowana w danym dniu (godzina 16:00 czasu warszawskiego). */
  async function completedLesson(day: string, student = studentId) {
    return createLesson({
      studentId: student,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date(`${day}T14:00:00Z`),
      status: "COMPLETED",
    });
  }

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    studentId = await createStudent(anna.teacherProfileId, 100, "Olena");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------- DOSTĘP ----------

  describe("dostęp", () => {
    it("nauczyciel nie dotknie żadnej funkcji rozliczeniowej", async () => {
      await expect(listInvoices(anna)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listPayments(anna)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listReceivables(anna)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listUnbilledLessons(anna)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getBillingSettings(anna)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getStudentBilling(anna, studentId)).rejects.toBeInstanceOf(
        ForbiddenError
      );
      await expect(getStudentBalance(anna, studentId)).rejects.toBeInstanceOf(
        ForbiddenError
      );
      await expect(
        updateBillingSettings(anna, { paymentTermDays: 14 })
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        createMonthlyInvoice(anna, { studentId, month: "2026-09" })
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        recordPayment(anna, { studentId, amount: "100" })
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(cancelInvoice(anna, "dowolny")).rejects.toBeInstanceOf(
        ForbiddenError
      );
      await expect(deletePayment(anna, "dowolna")).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it("nauczyciel nie zmieni trybu rozliczeń ucznia", async () => {
      await expect(
        updateStudent(anna, studentId, { billingMode: "PREPAID" })
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("nauczyciel dostaje flagę tylko dla swoich uczniów", async () => {
      const piotr = await createTeacher("piotr@test.pl", 55, "Piotr");
      const obcyId = await createStudent(piotr.teacherProfileId, 150, "Dzmitry");

      const flags = await getPaymentFlags(anna, [studentId, obcyId]);
      expect(flags.has(studentId)).toBe(true);
      expect(flags.has(obcyId)).toBe(false);
    });

    it("flaga nauczyciela nie zawiera żadnej kwoty ani numeru rachunku", async () => {
      // Stawka z groszami: taki ciąg nie może przypadkiem wpaść w cuid,
      // w przeciwieństwie do okrągłej setki.
      const droższyId = await createStudent(
        anna.teacherProfileId,
        333.77,
        "Sofia"
      );
      await completedLesson("2026-01-12", droższyId);
      const invoice = await createMonthlyInvoice(admin, {
        studentId: droższyId,
        month: "2026-01",
        issuedAt: "2026-01-31",
        dueDays: 7,
      });

      const student = (await listStudents(anna)).find(
        (row) => row.id === droższyId
      )!;
      expect(student.paymentFlag).toBe("OVERDUE");
      expect(student.ratePerLesson).toBeNull();
      expect(student.billingMode).toBeNull();

      const payload = JSON.stringify(student);
      expect(payload).not.toContain("333.77");
      expect(payload).not.toContain("333,77");
      expect(payload).not.toContain(invoice.number);
    });

    it("uczeń bez zaległości ma flagę OK", async () => {
      const [student] = await listStudents(anna);
      expect(student.paymentFlag).toBe("OK");
    });
  });

  // ---------- NUMERACJA ----------

  describe("numeracja", () => {
    it("nadaje kolejne numery i resetuje je co miesiąc", async () => {
      await completedLesson("2026-09-01");
      await completedLesson("2026-09-08");
      const drugiUczenId = await createStudent(anna.teacherProfileId, 90, "Sofia");
      await completedLesson("2026-09-02", drugiUczenId);

      const pierwszy = await createMonthlyInvoice(admin, {
        studentId,
        month: "2026-09",
        issuedAt: "2026-09-30",
      });
      const drugi = await createMonthlyInvoice(admin, {
        studentId: drugiUczenId,
        month: "2026-09",
        issuedAt: "2026-09-30",
      });

      expect(pierwszy.number).toBe("1/09/2026");
      expect(drugi.number).toBe("2/09/2026");

      await completedLesson("2026-10-06");
      const pazdziernikowy = await createMonthlyInvoice(admin, {
        studentId,
        month: "2026-10",
        issuedAt: "2026-10-31",
      });
      expect(pazdziernikowy.number).toBe("1/10/2026");
    });

    it("anulowany rachunek nie zwalnia numeru", async () => {
      await completedLesson("2026-09-01");
      const pierwszy = await createMonthlyInvoice(admin, {
        studentId,
        month: "2026-09",
        issuedAt: "2026-09-30",
      });
      await cancelInvoice(admin, pierwszy.id);

      await completedLesson("2026-09-08");
      const drugi = await createMonthlyInvoice(admin, {
        studentId,
        month: "2026-09",
        issuedAt: "2026-09-30",
      });
      expect(drugi.number).toBe("2/09/2026");
    });
  });

  // ---------- WYSTAWIANIE ----------

  describe("wystawianie", () => {
    it("rachunek miesięczny zbiera tylko lekcje zrealizowane i nierozliczone", async () => {
      await completedLesson("2026-09-01");
      await completedLesson("2026-09-08");
      await createLesson({
        studentId,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-09-15T14:00:00Z"),
        status: "CANCELLED",
      });
      await createLesson({
        studentId,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-09-22T14:00:00Z"),
        status: "SCHEDULED",
      });
      await completedLesson("2026-08-25"); // inny miesiąc

      const invoice = await createMonthlyInvoice(admin, {
        studentId,
        month: "2026-09",
        issuedAt: "2026-09-30",
      });

      expect(invoice.items).toHaveLength(2);
      expect(invoice.totalAmount).toBe(200);
      expect(invoice.paymentState).toBe("UNPAID");
    });

    it("drugi rachunek za ten sam miesiąc nie ma czego ująć", async () => {
      await completedLesson("2026-09-01");
      await createMonthlyInvoice(admin, {
        studentId,
        month: "2026-09",
        issuedAt: "2026-09-30",
      });
      await expect(
        createMonthlyInvoice(admin, {
          studentId,
          month: "2026-09",
          issuedAt: "2026-09-30",
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("ta sama lekcja nie trafi na dwa rachunki", async () => {
      const lessonId = await completedLesson("2026-09-01");
      await createLessonInvoice(admin, { lessonId, issuedAt: "2026-09-01" });
      await expect(
        createLessonInvoice(admin, { lessonId, issuedAt: "2026-09-01" })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("rachunek za pojedynczą lekcję tylko dla lekcji zrealizowanej", async () => {
      const lessonId = await createLesson({
        studentId,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-09-22T14:00:00Z"),
        status: "SCHEDULED",
      });
      await expect(
        createLessonInvoice(admin, { lessonId })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("uczeń bez stawki blokuje wystawienie rachunku", async () => {
      const bezStawki = await createStudent(anna.teacherProfileId, 0, "Nowy");
      await completedLesson("2026-09-01", bezStawki);
      await expect(
        createMonthlyInvoice(admin, {
          studentId: bezStawki,
          month: "2026-09",
          issuedAt: "2026-09-30",
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("uczeń przedpłacony nie dostaje rachunku miesięcznego", async () => {
      const prepaidId = await createStudent(
        anna.teacherProfileId,
        100,
        "Alesia",
        "PREPAID"
      );
      await completedLesson("2026-09-01", prepaidId);
      await expect(
        createMonthlyInvoice(admin, {
          studentId: prepaidId,
          month: "2026-09",
          issuedAt: "2026-09-30",
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("rachunek kopiuje dane wystawcy z chwili wystawienia", async () => {
      await updateBillingSettings(admin, {
        sellerName: "Mateusz Przykładowy",
        paymentTermDays: 7,
      });
      await completedLesson("2026-09-01");
      const invoice = await createMonthlyInvoice(admin, {
        studentId,
        month: "2026-09",
        issuedAt: "2026-09-30",
      });
      expect(invoice.sellerSnapshot).toContain("Mateusz Przykładowy");

      await updateBillingSettings(admin, {
        sellerName: "Nowa nazwa",
        paymentTermDays: 7,
      });
      const { invoices } = await getStudentBilling(admin, studentId);
      expect(invoices[0].sellerSnapshot).toContain("Mateusz Przykładowy");
    });

    it("termin płatności bierze się z ustawień", async () => {
      await updateBillingSettings(admin, { paymentTermDays: 14 });
      await completedLesson("2026-09-01");
      const invoice = await createMonthlyInvoice(admin, {
        studentId,
        month: "2026-09",
        issuedAt: "2026-09-10",
      });
      const dni =
        (new Date(invoice.dueAt).getTime() -
          new Date(invoice.issuedAt).getTime()) /
        (24 * 60 * 60 * 1000);
      expect(dni).toBe(14);
    });
  });

  // ---------- LEKCJA NA RACHUNKU ----------

  describe("lekcja ujęta na rachunku", () => {
    it("jest zamrożona i odmraża się po anulowaniu rachunku", async () => {
      const lessonId = await completedLesson("2026-09-01");
      const invoice = await createLessonInvoice(admin, {
        lessonId,
        issuedAt: "2026-09-01",
      });

      await expect(
        setLessonStatus(anna, lessonId, "CANCELLED")
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(deleteLesson(admin, lessonId)).rejects.toBeInstanceOf(
        ValidationError
      );

      await cancelInvoice(admin, invoice.id);
      const updated = await setLessonStatus(anna, lessonId, "CANCELLED");
      expect(updated.status).toBe("CANCELLED");
    });

    it("po anulowaniu rachunku lekcja wraca do nierozliczonych", async () => {
      const lessonId = await completedLesson("2026-09-01");
      const invoice = await createLessonInvoice(admin, {
        lessonId,
        issuedAt: "2026-09-01",
      });
      expect(await listUnbilledLessons(admin)).toHaveLength(0);

      await cancelInvoice(admin, invoice.id);
      const unbilled = await listUnbilledLessons(admin);
      expect(unbilled.map((lesson) => lesson.lessonId)).toEqual([lessonId]);
    });
  });

  // ---------- WPŁATY ----------

  describe("wpłaty", () => {
    async function wystawRachunekNaDwieLekcje() {
      await completedLesson("2026-01-05");
      await completedLesson("2026-01-12");
      return createMonthlyInvoice(admin, {
        studentId,
        month: "2026-01",
        issuedAt: "2026-01-31",
        dueDays: 7,
      });
    }

    it("wpłata częściowa i pełna zmieniają status rachunku", async () => {
      const invoice = await wystawRachunekNaDwieLekcje();
      expect(invoice.totalAmount).toBe(200);
      expect(invoice.paymentState).toBe("OVERDUE"); // termin minął

      await recordPayment(admin, {
        studentId,
        invoiceId: invoice.id,
        amount: "120",
        paidAt: "2026-02-01",
      });
      const [poCzesciowej] = await listInvoices(admin, { month: "2026-01" });
      expect(poCzesciowej.paidAmount).toBe(120);
      expect(poCzesciowej.balance).toBe(80);
      expect(poCzesciowej.paymentState).toBe("OVERDUE");

      await recordPayment(admin, {
        studentId,
        invoiceId: invoice.id,
        amount: "80",
        paidAt: "2026-02-02",
      });
      const [poPelnej] = await listInvoices(admin, { month: "2026-01" });
      expect(poPelnej.balance).toBe(0);
      expect(poPelnej.paymentState).toBe("PAID");
    });

    it("nie dopisze wpłaty do rachunku innego ucznia", async () => {
      const invoice = await wystawRachunekNaDwieLekcje();
      const innyId = await createStudent(anna.teacherProfileId, 90, "Sofia");
      await expect(
        recordPayment(admin, {
          studentId: innyId,
          invoiceId: invoice.id,
          amount: "50",
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("nie anuluje rachunku, do którego są wpłaty", async () => {
      const invoice = await wystawRachunekNaDwieLekcje();
      await recordPayment(admin, {
        studentId,
        invoiceId: invoice.id,
        amount: "50",
      });
      await expect(cancelInvoice(admin, invoice.id)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it("nie przyjmuje wpłaty zerowej ani ujemnej", async () => {
      await expect(
        recordPayment(admin, { studentId, amount: "0" })
      ).rejects.toThrow();
      await expect(
        recordPayment(admin, { studentId, amount: "-10" })
      ).rejects.toThrow();
    });

    it("usunięcie wpłaty przywraca saldo", async () => {
      const invoice = await wystawRachunekNaDwieLekcje();
      const payment = await recordPayment(admin, {
        studentId,
        invoiceId: invoice.id,
        amount: "200",
      });
      expect((await getStudentBalance(admin, studentId)).balance).toBe(0);

      await deletePayment(admin, payment.id);
      expect((await getStudentBalance(admin, studentId)).balance).toBe(-200);
    });
  });

  // ---------- SALDA I ZALEGŁOŚCI ----------

  describe("salda i zaległości", () => {
    it("liczy zaległość po terminie i wskazuje najstarszy termin", async () => {
      await completedLesson("2026-01-05");
      const styczniowy = await createMonthlyInvoice(admin, {
        studentId,
        month: "2026-01",
        issuedAt: "2026-01-31",
        dueDays: 7,
      });
      await completedLesson("2026-02-05");
      await createMonthlyInvoice(admin, {
        studentId,
        month: "2026-02",
        issuedAt: "2026-02-28",
        dueDays: 7,
      });

      const [saldo] = await listReceivables(admin);
      expect(saldo.invoiced).toBe(200);
      expect(saldo.paid).toBe(0);
      expect(saldo.balance).toBe(-200);
      expect(saldo.overdueAmount).toBe(200);
      expect(saldo.oldestDueAt).toBe(new Date(styczniowy.dueAt).toISOString());
    });

    it("rachunek przed terminem nie jest zaległością", async () => {
      await completedLesson("2026-09-01");
      await createMonthlyInvoice(admin, {
        studentId,
        month: "2026-09",
        issuedAt: "2026-09-30",
        dueDays: 7,
      });
      const [saldo] = await listReceivables(
        admin,
        new Date("2026-10-01T00:00:00Z")
      );
      expect(saldo.overdueAmount).toBe(0);
      expect(saldo.balance).toBe(-100);
    });

    it("anulowany rachunek znika z salda", async () => {
      await completedLesson("2026-01-05");
      const invoice = await createMonthlyInvoice(admin, {
        studentId,
        month: "2026-01",
        issuedAt: "2026-01-31",
        dueDays: 7,
      });
      await cancelInvoice(admin, invoice.id);

      const [saldo] = await listReceivables(admin);
      expect(saldo.invoiced).toBe(0);
      expect(saldo.overdueAmount).toBe(0);
    });

    it("nadpłata daje dodatnie saldo", async () => {
      await recordPayment(admin, { studentId, amount: "300" });
      const saldo = await getStudentBalance(admin, studentId);
      expect(saldo.balance).toBe(300);
      expect(saldo.overdueAmount).toBe(0);
    });
  });

  // ---------- PAKIETY ----------

  describe("pakiety przedpłacone", () => {
    let prepaidId: string;

    beforeEach(async () => {
      prepaidId = await createStudent(
        anna.teacherProfileId,
        100,
        "Alesia",
        "PREPAID"
      );
    });

    it("pakiet liczy wartość i zdejmuje jednostki za zrealizowane lekcje", async () => {
      const invoice = await createPackageInvoice(admin, {
        studentId: prepaidId,
        quantity: 4,
        issuedAt: "2026-09-01",
      });
      expect(invoice.totalAmount).toBe(400);
      expect(invoice.items[0].quantity).toBe(4);

      await completedLesson("2026-09-02", prepaidId);
      await completedLesson("2026-09-09", prepaidId);

      const saldo = await getStudentBalance(admin, prepaidId);
      expect(saldo.prepaidRemaining).toBe(2);
    });

    it("przekroczony pakiet to zaległość — także we fladze nauczyciela", async () => {
      await createPackageInvoice(admin, {
        studentId: prepaidId,
        quantity: 1,
        issuedAt: "2026-09-01",
      });
      await completedLesson("2026-09-02", prepaidId);
      await completedLesson("2026-09-09", prepaidId);

      const saldo = await getStudentBalance(admin, prepaidId);
      expect(saldo.prepaidRemaining).toBe(-1);

      const flags = await getPaymentFlags(anna, [prepaidId]);
      expect(flags.get(prepaidId)).toBe("OVERDUE");
    });

    it("cena pakietu może być inna niż stawka ucznia", async () => {
      const invoice = await createPackageInvoice(admin, {
        studentId: prepaidId,
        quantity: 10,
        unitPrice: "85",
        issuedAt: "2026-09-01",
      });
      expect(invoice.totalAmount).toBe(850);
    });

    it("uczeń spoza bazy nie dostanie rachunku", async () => {
      await expect(
        createPackageInvoice(admin, { studentId: "nie-istnieje", quantity: 2 })
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
