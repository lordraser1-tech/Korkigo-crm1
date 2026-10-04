/**
 * Obsługa żądań RODO: eksport danych ucznia i anonimizacja.
 *
 * Dwie rzeczy, które trzeba tu rozumieć:
 *
 * 1. NIE kasujemy rekordów finansowych. Rachunek jest dokumentem księgowym
 *    z własnym okresem przechowywania — usunięcie go na żądanie byłoby
 *    złamaniem innych przepisów. Zamiast tego NADPISUJEMY dane osobowe, więc
 *    dokument zostaje, ale nie wskazuje już na konkretną osobę.
 * 2. `Invoice.buyerSnapshot` to zamrożony tekst z imieniem, e-mailem
 *    i telefonem. Anonimizacja, która go pomija, zostawia dane osobowe
 *    w rachunkach — dlatego nadpisujemy go razem z kartoteką.
 *
 * To narzędzie pomocnicze. O tym, czy w konkretnym przypadku wolno usunąć
 * dane i jaki okres przechowywania obowiązuje, decyduje administrator danych
 * — aplikacja tego nie rozstrzyga.
 */
import type { Actor } from "@/lib/auth";
import { assertAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { toAmount } from "@/lib/money";
import { recordSecurityEvent } from "@/lib/services/security-log";

const ADMIN_ONLY = "Dane osobowe wydaje i anonimizuje wyłącznie administrator.";

/** Po ilu miesiącach od zakończenia nauki proponujemy anonimizację. */
export const RETENTION_REVIEW_MONTHS = 36;

// ---------- EKSPORT (art. 15 i 20 RODO) ----------

export type StudentExport = {
  wygenerowano: string;
  uczen: Record<string, unknown>;
  opiekun: Record<string, unknown>;
  lekcje: Array<Record<string, unknown>>;
  rachunki: Array<Record<string, unknown>>;
  wplaty: Array<Record<string, unknown>>;
  speakingClub: Array<Record<string, unknown>>;
  /**
   * Zastrzeżenie w treści pliku — plik trafia do osoby, która go żądała,
   * i ma się sam objaśniać.
   */
  uwagi: string[];
};

/**
 * Komplet danych jednego ucznia w czytelnej formie.
 *
 * Nie zawiera stawek nauczyciela ani marży — to dane firmy, nie osoby, której
 * dotyczy żądanie.
 */
export async function exportStudentData(
  actor: Actor,
  studentId: string
): Promise<StudentExport> {
  assertAdmin(actor, ADMIN_ONLY);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      teacher: { select: { firstName: true, lastName: true } },
      lessons: {
        orderBy: { scheduledAt: "asc" },
        include: {
          subjectLevel: { select: { name: true, subject: { select: { name: true } } } },
        },
      },
      invoices: { orderBy: { issuedAt: "asc" }, include: { items: true } },
      payments: { orderBy: { paidAt: "asc" } },
      speakingClubs: { orderBy: { usedAt: "asc" } },
      rates: { include: { subjectLevel: { select: { name: true } } } },
    },
  });
  if (!student) throw new NotFoundError("Nie znaleziono ucznia.");

  await recordSecurityEvent({
    type: "STUDENT_EXPORTED",
    userId: actor.userId,
    email: actor.email,
    detail: `uczeń ${student.id}`,
  });

  return {
    wygenerowano: new Date().toISOString(),
    uczen: {
      imie: student.firstName,
      nazwisko: student.lastName,
      email: student.contactEmail,
      telefon: student.contactPhone,
      instagram: student.contactInstagram,
      telegram: student.contactTelegram,
      telegramPolaczony: student.telegramChatId !== null,
      linkDoPokoju: student.meetingLink,
      poziomJezykowy: student.languageLevel,
      status: student.status,
      kanalPrzypomnien: student.reminderChannel,
      nauczyciel: student.teacher
        ? `${student.teacher.firstName} ${student.teacher.lastName}`
        : null,
      dodanyDo: student.createdAt.toISOString(),
      zanonimizowano: student.anonymizedAt?.toISOString() ?? null,
    },
    opiekun: {
      imieNazwisko: student.parentName,
      telefon: student.parentPhone,
      email: student.parentEmail,
    },
    lekcje: student.lessons.map((lesson) => ({
      termin: lesson.scheduledAt.toISOString(),
      czasTrwaniaMinuty: lesson.durationMinutes,
      przedmiot: `${lesson.subjectLevel.subject.name} · ${lesson.subjectLevel.name}`,
      status: lesson.status,
      temat: lesson.topic,
      odwolanieZgloszono: lesson.cancelledReportedAt?.toISOString() ?? null,
      naliczonoZaOdwolanie:
        lesson.cancellationAmount === null
          ? null
          : toAmount(lesson.cancellationAmount),
    })),
    rachunki: student.invoices.map((invoice) => ({
      numer: invoice.number,
      wystawiono: invoice.issuedAt.toISOString(),
      termin: invoice.dueAt.toISOString(),
      status: invoice.status,
      kwota: toAmount(invoice.totalAmount),
      pozycje: invoice.items.map((item) => ({
        opis: item.description,
        ilosc: item.quantity,
        cenaJednostkowa: toAmount(item.unitPrice),
        kwota: toAmount(item.amount),
      })),
    })),
    wplaty: student.payments.map((payment) => ({
      data: payment.paidAt.toISOString(),
      kwota: toAmount(payment.amount),
      metoda: payment.method,
      uwagi: payment.note,
    })),
    speakingClub: student.speakingClubs.map((use) => ({
      data: use.usedAt.toISOString(),
      uwagi: use.note,
    })),
    uwagi: [
      "Plik zawiera dane przetwarzane w systemie KorkiGO CRM dla wskazanego ucznia.",
      "Nie zawiera stawek nauczycieli ani wyliczeń marży — to dane firmy, nie osoby.",
      "Kwoty podano w złotych.",
    ],
  };
}

// ---------- ANONIMIZACJA (art. 17 RODO) ----------

export type AnonymizationPreview = {
  studentId: string;
  studentName: string;
  anonymizedAt: string | null;
  lessons: number;
  invoices: number;
  payments: number;
  /** Czy zostaną dokumenty, których nie wolno usunąć. */
  keepsFinancialRecords: boolean;
};

export async function previewAnonymization(
  actor: Actor,
  studentId: string
): Promise<AnonymizationPreview> {
  assertAdmin(actor, ADMIN_ONLY);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      anonymizedAt: true,
      _count: { select: { lessons: true, invoices: true, payments: true } },
    },
  });
  if (!student) throw new NotFoundError("Nie znaleziono ucznia.");

  return {
    studentId: student.id,
    studentName: `${student.firstName} ${student.lastName}`,
    anonymizedAt: student.anonymizedAt?.toISOString() ?? null,
    lessons: student._count.lessons,
    invoices: student._count.invoices,
    payments: student._count.payments,
    keepsFinancialRecords: student._count.invoices > 0,
  };
}

/**
 * Nadpisuje dane osobowe ucznia. Lekcje, rachunki i wpłaty zostają — tracą
 * tylko powiązanie z tożsamością. Operacja jest NIEODWRACALNA.
 */
export async function anonymizeStudent(
  actor: Actor,
  studentId: string,
  reason: string
): Promise<void> {
  assertAdmin(actor, ADMIN_ONLY);

  if (!reason.trim()) {
    throw new ValidationError(
      "Podaj powód anonimizacji — to operacja nieodwracalna i musi zostać ślad."
    );
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, anonymizedAt: true },
  });
  if (!student) throw new NotFoundError("Nie znaleziono ucznia.");
  if (student.anonymizedAt) {
    throw new ValidationError("Dane tego ucznia są już zanonimizowane.");
  }

  // Krótki, stały zastępnik — po anonimizacji rekord ma być rozpoznawalny
  // jako „były uczeń", a nie wyglądać na uszkodzony.
  const label = `Uczeń ${student.id.slice(-6).toUpperCase()}`;

  await prisma.$transaction(async (tx) => {
    await tx.student.update({
      where: { id: student.id },
      data: {
        firstName: label,
        lastName: "(zanonimizowany)",
        contactEmail: null,
        contactPhone: null,
        contactInstagram: null,
        contactTelegram: null,
        telegramChatId: null,
        meetingLink: null,
        parentName: null,
        parentPhone: null,
        parentEmail: null,
        reminderChannel: "NONE",
        status: "ENDED",
        anonymizedAt: new Date(),
      },
    });

    // Snapshot nabywcy na rachunkach to osobna kopia danych osobowych —
    // bez tego anonimizacja byłaby pozorna.
    await tx.invoice.updateMany({
      where: { studentId: student.id },
      data: { buyerSnapshot: `${label} (zanonimizowany)` },
    });

    // Tokeny połączenia Telegrama nie mają już do czego służyć.
    await tx.telegramLinkToken.deleteMany({ where: { studentId: student.id } });
  });

  await recordSecurityEvent({
    type: "STUDENT_ANONYMIZED",
    userId: actor.userId,
    email: actor.email,
    detail: `uczeń ${student.id}: ${reason.trim().slice(0, 200)}`,
  });
}

// ---------- PRZEGLĄD RETENCJI ----------

export type RetentionCandidate = {
  studentId: string;
  studentName: string;
  status: string;
  lastLessonAt: string | null;
  monthsSinceLastLesson: number | null;
  invoices: number;
};

/**
 * Uczniowie, przy których warto rozważyć anonimizację: zakończeni, bez lekcji
 * od `RETENTION_REVIEW_MONTHS` miesięcy i jeszcze nieanonimizowani.
 *
 * ŚWIADOMIE nie kasujemy nic automatycznie. Okres przechowywania zależy od
 * podstawy prawnej i dokumentów księgowych, więc decyzję podejmuje człowiek —
 * aplikacja tylko podsuwa listę.
 */
export async function listRetentionCandidates(
  actor: Actor,
  now = new Date()
): Promise<RetentionCandidate[]> {
  assertAdmin(actor, ADMIN_ONLY);

  const students = await prisma.student.findMany({
    where: { anonymizedAt: null, status: "ENDED" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      lessons: { orderBy: { scheduledAt: "desc" }, take: 1, select: { scheduledAt: true } },
      _count: { select: { invoices: true } },
    },
  });

  const cutoffMs = RETENTION_REVIEW_MONTHS * 30 * 24 * 60 * 60 * 1000;

  return students
    .map((student) => {
      const last = student.lessons[0]?.scheduledAt ?? null;
      const ageMs = last ? now.getTime() - last.getTime() : null;
      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        status: student.status,
        lastLessonAt: last?.toISOString() ?? null,
        monthsSinceLastLesson:
          ageMs === null ? null : Math.floor(ageMs / (30 * 24 * 60 * 60 * 1000)),
        invoices: student._count.invoices,
        _ageMs: ageMs,
      };
    })
    // Uczeń bez ani jednej lekcji też kwalifikuje się do przeglądu.
    .filter((row) => row._ageMs === null || row._ageMs >= cutoffMs)
    .map(({ _ageMs, ...row }) => row);
}
