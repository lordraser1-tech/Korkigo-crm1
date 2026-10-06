/**
 * Niezmiennik, którego brakowało: **kwota raz naliczona zostaje niezmienna**.
 *
 * Lekcja nie utrwalała ceny ucznia ani stawki nauczyciela, więc rozliczenia,
 * zarobki i statystyki czytały cennik BIEŻĄCY. Zmiana stawki przepisywała
 * zamknięty miesiąc, a stara niezafakturowana lekcja dostawała nową cenę.
 * Odtworzone w audycie zewnętrznym jako próba P01 (ustalenie F07).
 *
 * Te testy są odwróceniem tamtej próby: po podwyżce historia ma stać.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createLessons, setLessonStatus } from "@/lib/services/lessons";
import { getTeacherEarnings, getAdminFinanceSummary } from "@/lib/services/finance";
import {
  createInvoiceForOutstandingLessons,
  getStudentBalance,
} from "@/lib/services/billing";
import { setStudentRate as setStudentRateService, setTeacherRate as setTeacherRateService } from "@/lib/services/subjects";
import { getPayoutDue } from "@/lib/services/payouts";
import {
  createAdmin,
  createStudent,
  createTeacher,
  describeDb,
  getDefaultLevelId,
  prisma,
  resetDatabase,
  setStudentRate,
  setTeacherRate,
} from "./helpers/db";

describeDb("historia pieniędzy jest niezmienna (F07)", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let uczen: string;
  let poziom: string;
  let lekcja: string;

  /** Stawki z groszami — okrągłe liczby wpadają w inne pola jako przypadek. */
  const STAWKA_STARA = 60.33;
  const CENA_STARA = 100.77;
  const STAWKA_NOWA = 90.11;
  const CENA_NOWA = 150.55;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", STAWKA_STARA, "Anna");
    uczen = await createStudent(anna.teacherProfileId, CENA_STARA, "Olena");
    poziom = getDefaultLevelId();

    await setTeacherRate(anna.teacherProfileId, poziom, STAWKA_STARA);
    await setStudentRate(uczen, poziom, CENA_STARA);

    // Lekcja przez prawdziwą ścieżkę zapisu — to ona utrwala stawki.
    const [utworzona] = await createLessons(admin, {
      studentId: uczen,
      teacherId: anna.teacherProfileId,
      subjectLevelId: poziom,
      scheduledAt: "2026-09-07T16:00",
    });
    lekcja = utworzona.id;
    await setLessonStatus(admin, lekcja, "COMPLETED");
  });

  /** Podwyżka na przyszłość nie może ruszyć tego, co już się odbyło. */
  async function podnies() {
    await setTeacherRateService(admin, {
      teacherId: anna.teacherProfileId,
      subjectLevelId: poziom,
      amount: String(STAWKA_NOWA),
    });
    await setStudentRateService(admin, {
      studentId: uczen,
      subjectLevelId: poziom,
      amount: String(CENA_NOWA),
    });
  }

  it("zapis lekcji utrwala obie stawki", async () => {
    const row = await prisma.lesson.findUniqueOrThrow({
      where: { id: lekcja },
      select: { studentPrice: true, teacherRate: true },
    });
    expect(Number(row.teacherRate)).toBe(STAWKA_STARA);
    expect(Number(row.studentPrice)).toBe(CENA_STARA);
  });

  it("zarobek za zamknięty miesiąc nie zmienia się po podwyżce", async () => {
    const przed = await getTeacherEarnings(anna, anna.teacherProfileId, "2026-09");
    expect(przed.total).toBe(STAWKA_STARA);

    await podnies();

    const po = await getTeacherEarnings(anna, anna.teacherProfileId, "2026-09");
    expect(po.total).toBe(STAWKA_STARA);
  });

  it("stara lekcja idzie na rachunek po STAREJ cenie", async () => {
    await podnies();

    const rachunek = await createInvoiceForOutstandingLessons(admin, {
      studentId: uczen,
    });
    expect(rachunek.totalAmount).toBe(CENA_STARA);
    expect(rachunek.items[0].unitPrice).toBe(CENA_STARA);
  });

  it("saldo ucznia liczy się ceną z dnia lekcji", async () => {
    await podnies();
    const saldo = await getStudentBalance(admin, uczen);
    expect(saldo.charged).toBe(CENA_STARA);
  });

  it("wypłata obejmuje stawkę z dnia lekcji", async () => {
    await podnies();
    const wyliczenie = await getPayoutDue(admin, anna.teacherProfileId);
    expect(wyliczenie.amount).toBe(STAWKA_STARA);
  });

  it("marża admina liczy obie strony historycznie", async () => {
    await podnies();
    const podsumowanie = await getAdminFinanceSummary(admin, "2026-09");
    expect(podsumowanie.revenue).toBe(CENA_STARA);
    expect(podsumowanie.cost).toBe(STAWKA_STARA);
  });

  /** Nowa lekcja po podwyżce ma już nowe stawki — podwyżka działa na przyszłość. */
  it("lekcja zapisana po podwyżce bierze nowe stawki", async () => {
    await podnies();
    const [nowa] = await createLessons(admin, {
      studentId: uczen,
      teacherId: anna.teacherProfileId,
      subjectLevelId: poziom,
      scheduledAt: "2026-10-05T16:00",
    });
    await setLessonStatus(admin, nowa.id, "COMPLETED");

    const pazdziernik = await getTeacherEarnings(
      anna,
      anna.teacherProfileId,
      "2026-10"
    );
    expect(pazdziernik.total).toBe(STAWKA_NOWA);
  });
});

describeDb("lekcje sprzed snapshotu (ścieżka awaryjna)", () => {
  it("bez utrwalonych stawek wracamy do cennika bieżącego", async () => {
    await resetDatabase();
    const admin = await createAdmin();
    const anna = await createTeacher("anna@test.pl", 60, "Anna");
    const uczen = await createStudent(anna.teacherProfileId, 100, "Olena");
    const poziom = getDefaultLevelId();
    await setTeacherRate(anna.teacherProfileId, poziom, 60);
    await setStudentRate(uczen, poziom, 100);

    const { createLesson } = await import("./helpers/db");
    const stara = await createLesson({
      studentId: uczen,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date("2026-09-07T14:00:00Z"),
      status: "COMPLETED",
      bezSnapshotuStawek: true,
    });

    const row = await prisma.lesson.findUniqueOrThrow({
      where: { id: stara },
      select: { teacherRate: true },
    });
    expect(row.teacherRate).toBeNull();

    // Nie ma czego odtworzyć, więc liczymy cennikiem bieżącym — tak jak dotąd.
    const zarobek = await getTeacherEarnings(anna, anna.teacherProfileId, "2026-09");
    expect(zarobek.total).toBe(60);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
