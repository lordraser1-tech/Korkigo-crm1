/**
 * Żądania RODO: eksport danych i anonimizacja.
 *
 * Najważniejszy test w tym pliku pilnuje, że anonimizacja nadpisuje TAKŻE
 * snapshot nabywcy na rachunkach — bez tego dane osobowe zostają w dokumentach
 * i cała operacja jest pozorna.
 */
import { afterAll, beforeEach, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import {
  RETENTION_REVIEW_MONTHS,
  anonymizeStudent,
  exportStudentData,
  listRetentionCandidates,
  previewAnonymization,
} from "@/lib/services/privacy";
import { createLessonInvoice, recordPayment } from "@/lib/services/billing";
import { setLessonStatus } from "@/lib/services/lessons";
import { listSecurityEvents } from "@/lib/services/security-log";
import {
  createAdmin,
  createLesson,
  createStudent,
  createTeacher,
  describeDb,
  getDefaultLevelId,
  prisma,
  resetDatabase,
  setTeacherRate,
} from "./helpers/db";

describeDb("RODO: eksport i anonimizacja", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let studentId: string;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    studentId = await createStudent(anna.teacherProfileId, 100, "Olena");
    await prisma.student.update({
      where: { id: studentId },
      data: {
        contactEmail: "olena@example.com",
        contactPhone: "+48 700 100 200",
        contactInstagram: "@olena",
        parentName: "Maryna Tkachenko",
        parentPhone: "+48 700 100 999",
        parentEmail: "maryna@example.com",
        telegramChatId: "123456",
        meetingLink: "https://meet.example/olena",
      },
    });
  });

  async function lessonWithInvoice(): Promise<string> {
    const id = await createLesson({
      studentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date("2026-02-03T10:00:00Z"),
    });
    await setLessonStatus(admin, id, "COMPLETED");
    const invoice = await createLessonInvoice(admin, {
      lessonId: id,
      issuedAt: "2026-02-05",
    });
    await recordPayment(admin, {
      studentId,
      invoiceId: invoice.id,
      amount: "100",
      paidAt: "2026-02-10",
    });
    return invoice.id;
  }

  // ---------- EKSPORT ----------

  it("eksport zawiera dane ucznia, opiekuna, lekcje, rachunki i wpłaty", async () => {
    await lessonWithInvoice();
    const data = await exportStudentData(admin, studentId);

    expect(data.uczen.email).toBe("olena@example.com");
    expect(data.opiekun.imieNazwisko).toBe("Maryna Tkachenko");
    expect(data.lekcje).toHaveLength(1);
    expect(data.rachunki).toHaveLength(1);
    expect(data.wplaty[0].kwota).toBe(100);
    expect(data.uwagi.length).toBeGreaterThan(0);
  });

  it("eksport NIE zawiera stawki nauczyciela ani marży", async () => {
    // Charakterystyczna stawka z groszami — żeby szukać czegoś, co nie może
    // trafić się przypadkiem (samo „60" to np. czas trwania lekcji).
    await setTeacherRate(anna.teacherProfileId, getDefaultLevelId(), 63.77);
    await lessonWithInvoice();

    const payload = JSON.stringify(await exportStudentData(admin, studentId));
    // To dane firmy, nie osoby, której dotyczy żądanie.
    expect(payload).not.toContain("63.77");
    expect(payload).not.toContain("63,77");
    expect(payload).not.toMatch(/"(stawka|teacherRate|marza)"/i);
  });

  it("eksportu nie zrobi nauczyciel", async () => {
    await expect(exportStudentData(anna, studentId)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("eksport zostawia ślad w dzienniku", async () => {
    await exportStudentData(admin, studentId);
    const types = (await listSecurityEvents(admin)).map((e) => e.type);
    expect(types).toContain("STUDENT_EXPORTED");
  });

  // ---------- ANONIMIZACJA ----------

  it("nadpisuje dane osobowe, zachowując rekordy finansowe", async () => {
    const invoiceId = await lessonWithInvoice();

    await anonymizeStudent(admin, studentId, "żądanie opiekuna z 04.10.2026");

    const student = await prisma.student.findUniqueOrThrow({
      where: { id: studentId },
    });
    expect(student.contactEmail).toBeNull();
    expect(student.contactPhone).toBeNull();
    expect(student.contactInstagram).toBeNull();
    expect(student.parentName).toBeNull();
    expect(student.parentPhone).toBeNull();
    expect(student.parentEmail).toBeNull();
    expect(student.telegramChatId).toBeNull();
    expect(student.meetingLink).toBeNull();
    expect(student.reminderChannel).toBe("NONE");
    expect(student.status).toBe("ENDED");
    expect(student.anonymizedAt).not.toBeNull();
    expect(student.lastName).toContain("zanonimizowany");

    // Dokumenty zostają — mają własny okres przechowywania.
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice.totalAmount.toString()).toBe("100");
    expect(await prisma.lesson.count({ where: { studentId } })).toBe(1);
    expect(await prisma.payment.count({ where: { studentId } })).toBe(1);
  });

  it("nadpisuje też snapshot nabywcy na rachunku", async () => {
    const invoiceId = await lessonWithInvoice();
    const przed = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { buyerSnapshot: true },
    });
    expect(przed.buyerSnapshot).toContain("olena@example.com");

    await anonymizeStudent(admin, studentId, "żądanie");

    const po = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: { buyerSnapshot: true },
    });
    // Bez tego anonimizacja byłaby pozorna — dane zostawały w dokumentach.
    expect(po.buyerSnapshot).not.toContain("olena@example.com");
    expect(po.buyerSnapshot).not.toContain("Olena");
    expect(po.buyerSnapshot).toContain("zanonimizowany");
  });

  it("usuwa tokeny połączenia Telegrama", async () => {
    await prisma.telegramLinkToken.create({
      data: {
        token: "tok-1",
        studentId,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await anonymizeStudent(admin, studentId, "żądanie");
    expect(await prisma.telegramLinkToken.count({ where: { studentId } })).toBe(0);
  });

  it("wymaga powodu i nie da się powtórzyć", async () => {
    await expect(anonymizeStudent(admin, studentId, "   ")).rejects.toBeInstanceOf(
      ValidationError
    );

    await anonymizeStudent(admin, studentId, "żądanie");
    await expect(
      anonymizeStudent(admin, studentId, "znowu")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("anonimizacji nie zrobi nauczyciel", async () => {
    await expect(
      anonymizeStudent(anna, studentId, "próba")
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(previewAnonymization(anna, studentId)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("powód trafia do dziennika", async () => {
    await anonymizeStudent(admin, studentId, "żądanie opiekuna nr 7");
    const events = await listSecurityEvents(admin, { type: "STUDENT_ANONYMIZED" });
    expect(events).toHaveLength(1);
    expect(events[0].detail).toContain("żądanie opiekuna nr 7");
  });

  it("podgląd mówi, co zostanie", async () => {
    await lessonWithInvoice();
    const preview = await previewAnonymization(admin, studentId);
    expect(preview.lessons).toBe(1);
    expect(preview.invoices).toBe(1);
    expect(preview.payments).toBe(1);
    expect(preview.keepsFinancialRecords).toBe(true);
    expect(preview.anonymizedAt).toBeNull();
  });

  // ---------- PRZEGLĄD RETENCJI ----------

  it("do przeglądu trafia tylko uczeń zakończony i dawno nieaktywny", async () => {
    // Aktywny uczeń z bieżącą lekcją — nie powinien się pojawić.
    await createLesson({
      studentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date(),
    });
    expect(await listRetentionCandidates(admin)).toHaveLength(0);

    await prisma.student.update({
      where: { id: studentId },
      data: { status: "ENDED" },
    });
    // Zakończony, ale lekcja jest świeża — wciąż nie do przeglądu.
    expect(await listRetentionCandidates(admin)).toHaveLength(0);

    const dawno = new Date();
    dawno.setMonth(dawno.getMonth() - (RETENTION_REVIEW_MONTHS + 2));
    await prisma.lesson.updateMany({
      where: { studentId },
      data: { scheduledAt: dawno },
    });

    const candidates = await listRetentionCandidates(admin);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].studentId).toBe(studentId);
    expect(candidates[0].monthsSinceLastLesson).toBeGreaterThanOrEqual(
      RETENTION_REVIEW_MONTHS
    );
  });

  it("uczeń już zanonimizowany wypada z przeglądu", async () => {
    await prisma.student.update({
      where: { id: studentId },
      data: { status: "ENDED" },
    });
    expect(await listRetentionCandidates(admin)).toHaveLength(1);

    await anonymizeStudent(admin, studentId, "żądanie");
    expect(await listRetentionCandidates(admin)).toHaveLength(0);
  });

  it("przeglądu nie zobaczy nauczyciel", async () => {
    await expect(listRetentionCandidates(anna)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
