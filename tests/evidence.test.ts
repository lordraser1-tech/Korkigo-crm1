/**
 * Ewidencja przychodu (podkład pod PIT-36).
 *
 * Najważniejszy test w tym pliku to ten, który pilnuje, że w wyniku NIE MA
 * żadnej stawki podatkowej ani wyliczonego podatku — aplikacja podaje tylko
 * kwoty z dokumentów, resztę rozstrzyga księgowy.
 */
import { afterAll, beforeEach, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import { evidenceToCsv, getEvidenceReport } from "@/lib/services/evidence";
import {
  cancelInvoice,
  createLessonInvoice,
  recordPayment,
  updateBillingSettings,
} from "@/lib/services/billing";
import { updateNdgSettings } from "@/lib/services/ndg";
import { setLessonStatus } from "@/lib/services/lessons";
import {
  createAdmin,
  createLesson,
  createStudent,
  createTeacher,
  describeDb,
  prisma,
  resetDatabase,
} from "./helpers/db";

describeDb("ewidencja przychodu", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let studentId: string;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    studentId = await createStudent(anna.teacherProfileId, 100, "Olena");
  });

  /** Zrealizowana lekcja + rachunek wystawiony w podanym dniu. */
  async function invoice(lessonAt: string, issuedAt: string) {
    const id = await createLesson({
      studentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date(lessonAt),
    });
    await setLessonStatus(admin, id, "COMPLETED");
    return createLessonInvoice(admin, { lessonId: id, issuedAt });
  }

  it("podstawa należna: wiersze z rachunków, numeracja i suma narastająca przez cały rok", async () => {
    await invoice("2026-02-03T10:00:00Z", "2026-02-05");
    await invoice("2026-02-10T10:00:00Z", "2026-02-12");
    await invoice("2026-05-04T10:00:00Z", "2026-05-06");

    const report = await getEvidenceReport(admin, 2026);

    expect(report.basis).toBe("INVOICED");
    expect(report.rowCount).toBe(3);
    expect(report.total).toBe(300);

    const luty = report.months.find((m) => m.monthKey === "2026-02")!;
    const maj = report.months.find((m) => m.monthKey === "2026-05")!;
    expect(luty.rows.map((r) => r.index)).toEqual([1, 2]);
    expect(luty.rows.map((r) => r.cumulative)).toEqual([100, 200]);
    expect(luty.total).toBe(200);
    // Numeracja nie resetuje się w nowym miesiącu.
    expect(maj.rows[0].index).toBe(3);
    expect(maj.rows[0].cumulative).toBe(300);
    expect(maj.cumulative).toBe(300);
  });

  it("raport ma wszystkie dwanaście miesięcy, także puste", async () => {
    await invoice("2026-02-03T10:00:00Z", "2026-02-05");
    const report = await getEvidenceReport(admin, 2026);
    expect(report.months).toHaveLength(12);
    expect(report.months.filter((m) => m.rows.length === 0)).toHaveLength(11);
  });

  it("anulowany rachunek wypada z ewidencji", async () => {
    const first = await invoice("2026-03-03T10:00:00Z", "2026-03-05");
    await invoice("2026-03-10T10:00:00Z", "2026-03-12");
    await cancelInvoice(admin, first.id);

    const report = await getEvidenceReport(admin, 2026);
    expect(report.rowCount).toBe(1);
    expect(report.total).toBe(100);
    // Po anulowaniu numeracja ewidencji zaczyna się od jedynki.
    expect(report.months.find((m) => m.monthKey === "2026-03")!.rows[0].index).toBe(1);
  });

  it("podstawa kasowa liczy wpłaty, nie rachunki", async () => {
    const inv = await invoice("2026-04-03T10:00:00Z", "2026-04-05");
    await recordPayment(admin, {
      studentId,
      invoiceId: inv.id,
      amount: "60",
      paidAt: "2026-04-20",
    });
    await updateNdgSettings(admin, {
      enabled: true,
      mode: "QUARTERLY",
      revenueBasis: "PAID",
      warnThresholdPercent: 90,
    });

    const report = await getEvidenceReport(admin, 2026);
    expect(report.basis).toBe("PAID");
    expect(report.total).toBe(60);
    const kwiecien = report.months.find((m) => m.monthKey === "2026-04")!;
    expect(kwiecien.rows[0].date).toBe("2026-04-20");
    expect(kwiecien.rows[0].document).toContain(inv.number);
  });

  it("rok obok nie miesza się do ewidencji", async () => {
    await invoice("2025-12-03T10:00:00Z", "2025-12-05");
    await invoice("2026-01-03T10:00:00Z", "2026-01-07");

    expect((await getEvidenceReport(admin, 2026)).rowCount).toBe(1);
    expect((await getEvidenceReport(admin, 2025)).rowCount).toBe(1);
  });

  it("pusty rok jest pusty, nie błędny", async () => {
    const report = await getEvidenceReport(admin, 2026);
    expect(report.rowCount).toBe(0);
    expect(report.total).toBe(0);
    expect(report.months).toHaveLength(12);
  });

  it("ewidencji nie zobaczy nauczyciel", async () => {
    await expect(getEvidenceReport(anna, 2026)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("nie podaje żadnej stawki podatkowej ani wyliczonego podatku", async () => {
    await invoice("2026-02-03T10:00:00Z", "2026-02-05");
    const report = await getEvidenceReport(admin, 2026);
    const payload = JSON.stringify(report);

    for (const zakazane of ["podatek", "stawka", "PIT", "12%", "17%", "32%", "kwotaWolna"]) {
      expect(payload).not.toContain(zakazane);
    }
    // Raport podaje wyłącznie przychód.
    expect(report.total).toBe(100);
  });

  // ---------- CSV ----------

  it("CSV jest czytelny dla polskiego Excela", async () => {
    await updateBillingSettings(admin, {
      sellerName: "KorkiGO Mateusz",
      sellerAddress: "ul. Przykładowa 1",
      sellerContact: "kontakt@korkigo.pl",
      sellerTaxNote: "Sprzedaż nieewidencjonowana",
      bankAccount: "PL00 0000 0000",
      paymentTermDays: 7,
      invoiceFooter: "",
    });
    await invoice("2026-02-03T10:00:00Z", "2026-02-05");

    const csv = evidenceToCsv(await getEvidenceReport(admin, 2026));

    expect(csv.startsWith("﻿")).toBe(true); // BOM — inaczej Excel psuje polskie znaki
    expect(csv).toContain('"Lp.";"Data";"Dokument";"Uczeń";"Kwota";"Narastająco"');
    expect(csv).toContain('"100,00"'); // przecinek dziesiętny
    expect(csv).toContain("KorkiGO Mateusz");
    expect(csv).toContain("nie stanowi doradztwa podatkowego");
  });

  it("CSV chroni średnik i cudzysłów w danych", async () => {
    await prisma.student.update({
      where: { id: studentId },
      data: { lastName: 'Test"; DROP' },
    });
    await invoice("2026-02-03T10:00:00Z", "2026-02-05");

    const csv = evidenceToCsv(await getEvidenceReport(admin, 2026));
    // Cudzysłów podwojony, całość w cudzysłowach — kolumny się nie rozjeżdżają.
    expect(csv).toContain('"Olena Test""; DROP"');
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
