/**
 * Moduł NDG: limit, prognoza i statystyki finansowe.
 *
 * Kwoty limitu są danymi wprowadzanymi przez admina, nie stałą w kodzie —
 * testy sprawdzają mechanikę (sumowanie, progi, prognozę), nie przepisy.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import {
  createNdgLimit,
  deleteNdgLimit,
  getFinancialStats,
  getNdgOverview,
  getNdgSettings,
  listNdgLimits,
  quarterMonths,
  updateNdgSettings,
} from "@/lib/services/ndg";
import {
  createPackageInvoice,
  recordPayment,
  cancelInvoice,
} from "@/lib/services/billing";
import {
  createAdmin,
  createLesson,
  createStudent,
  createTeacher,
  describeDb,
  prisma,
  resetDatabase,
} from "./helpers/db";

describeDb("moduł NDG", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let prepaidId: string;

  /** Rachunek na zadaną kwotę, wystawiony w konkretnym dniu. */
  async function invoice(amount: number, issuedAt: string, quantity = 1) {
    return createPackageInvoice(admin, {
      studentId: prepaidId,
      quantity,
      unitPrice: String(amount / quantity),
      issuedAt,
      dueDays: 7,
    });
  }

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    prepaidId = await createStudent(anna.teacherProfileId, 100, "Olena", "PREPAID");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------- DOSTĘP ----------

  it("nauczyciel nie ma dostępu do modułu NDG", async () => {
    await expect(getNdgSettings(anna)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getNdgOverview(anna)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listNdgLimits(anna)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createNdgLimit(anna, { validFrom: "2026-01", amount: "3000" })
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      getFinancialStats(anna, { scope: "YEAR", year: 2026 })
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      updateNdgSettings(anna, { enabled: false, warnThresholdPercent: 90 })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  // ---------- LIMITY ----------

  describe("limit okresu", () => {
    it("limit kwartału to suma limitów jego miesięcy", async () => {
      await createNdgLimit(admin, { validFrom: "2026-01", amount: "3000" });
      const overview = await getNdgOverview(
        admin,
        { year: 2026, periodKey: "2026-Q1" },
        new Date("2026-02-15T12:00:00Z")
      );
      expect(overview.selected.limit).toBe(9000);
      expect(overview.selected.months).toHaveLength(3);
    });

    it("zmiana kwoty w trakcie roku liczy się od swojego miesiąca", async () => {
      await createNdgLimit(admin, { validFrom: "2026-01", amount: "3000" });
      await createNdgLimit(admin, { validFrom: "2026-08", amount: "3500" });

      const overview = await getNdgOverview(admin, { year: 2026 }, new Date("2026-08-10"));
      const q3 = overview.periods.find((p) => p.periodKey === "2026-Q3")!;
      // lipiec po staremu, sierpień i wrzesień po nowemu
      expect(q3.months.map((m) => m.limit)).toEqual([3000, 3500, 3500]);
      expect(q3.limit).toBe(10000);
    });

    it("brak kwoty dla któregokolwiek miesiąca daje status UNKNOWN", async () => {
      await createNdgLimit(admin, { validFrom: "2026-02", amount: "3000" });
      const overview = await getNdgOverview(admin, { year: 2026 }, new Date("2026-02-10"));
      const q1 = overview.periods.find((p) => p.periodKey === "2026-Q1")!;
      expect(q1.limit).toBeNull();
      expect(q1.status).toBe("UNKNOWN");
    });

    it("nie pozwala zdublować limitu na ten sam miesiąc", async () => {
      await createNdgLimit(admin, { validFrom: "2026-01", amount: "3000" });
      await expect(
        createNdgLimit(admin, { validFrom: "2026-01", amount: "3100" })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("limit da się usunąć", async () => {
      const limit = await createNdgLimit(admin, {
        validFrom: "2026-01",
        amount: "3000",
      });
      await deleteNdgLimit(admin, limit.id);
      expect(await listNdgLimits(admin)).toHaveLength(0);
    });

    it("kwartał ma trzy właściwe miesiące", () => {
      expect(quarterMonths(2026, 3)).toEqual(["2026-07", "2026-08", "2026-09"]);
    });
  });

  // ---------- PROGI ----------

  describe("progi ostrzeżeń", () => {
    beforeEach(async () => {
      await createNdgLimit(admin, { validFrom: "2026-01", amount: "1000" });
    });

    async function statusFor(amount: number) {
      await invoice(amount, "2026-07-10");
      const overview = await getNdgOverview(
        admin,
        { year: 2026, periodKey: "2026-Q3" },
        new Date("2026-07-20T12:00:00Z")
      );
      return overview.selected;
    }

    it("poniżej progu obserwacji jest OK", async () => {
      const period = await statusFor(500); // 500 z 3000
      expect(period.percent).toBeCloseTo(16.67, 1);
      expect(period.status).toBe("OK");
    });

    it("od 70% limitu status to WATCH", async () => {
      const period = await statusFor(2200); // 73%
      expect(period.status).toBe("WATCH");
    });

    it("od progu ostrzeżenia (domyślnie 90%) status to WARNING", async () => {
      const period = await statusFor(2700); // dokładnie 90%
      expect(period.percent).toBe(90);
      expect(period.status).toBe("WARNING");
      expect(period.remaining).toBe(300);
    });

    it("po przekroczeniu limitu status to EXCEEDED", async () => {
      const period = await statusFor(3200);
      expect(period.status).toBe("EXCEEDED");
      expect(period.remaining).toBe(-200);
    });

    it("próg ostrzeżenia jest ustawieniem", async () => {
      await updateNdgSettings(admin, {
        enabled: true,
        mode: "QUARTERLY",
        revenueBasis: "INVOICED",
        warnThresholdPercent: 75,
      });
      const period = await statusFor(2400); // 80%
      expect(period.status).toBe("WARNING");
    });
  });

  // ---------- PRZYCHÓD ----------

  describe("liczenie przychodu", () => {
    beforeEach(async () => {
      await createNdgLimit(admin, { validFrom: "2026-01", amount: "1000" });
    });

    it("domyślnie liczy przychód należny z rachunków", async () => {
      await invoice(900, "2026-07-10");
      const overview = await getNdgOverview(
        admin,
        { year: 2026, periodKey: "2026-Q3" },
        new Date("2026-07-20")
      );
      expect(overview.selected.revenue).toBe(900);
    });

    it("anulowany rachunek nie wchodzi do limitu", async () => {
      const anulowany = await invoice(900, "2026-07-10");
      await cancelInvoice(admin, anulowany.id);
      const overview = await getNdgOverview(
        admin,
        { year: 2026, periodKey: "2026-Q3" },
        new Date("2026-07-20")
      );
      expect(overview.selected.revenue).toBe(0);
    });

    it("w ujęciu kasowym liczą się wpłaty, nie rachunki", async () => {
      const wystawiony = await invoice(900, "2026-07-10");
      await recordPayment(admin, {
        studentId: prepaidId,
        invoiceId: wystawiony.id,
        amount: "400",
        paidAt: "2026-08-02",
      });

      await updateNdgSettings(admin, {
        enabled: true,
        mode: "QUARTERLY",
        revenueBasis: "PAID",
        warnThresholdPercent: 90,
      });

      const overview = await getNdgOverview(
        admin,
        { year: 2026, periodKey: "2026-Q3" },
        new Date("2026-08-20")
      );
      expect(overview.selected.revenue).toBe(400);
      expect(overview.selected.months.map((m) => m.revenue)).toEqual([0, 400, 0]);
    });

    it("rachunek z innego kwartału nie miesza się do bieżącego", async () => {
      await invoice(500, "2026-04-10");
      await invoice(700, "2026-07-10");
      const overview = await getNdgOverview(admin, { year: 2026 }, new Date("2026-07-20"));
      expect(overview.periods.find((p) => p.periodKey === "2026-Q2")!.revenue).toBe(500);
      expect(overview.periods.find((p) => p.periodKey === "2026-Q3")!.revenue).toBe(700);
    });

    it("tryb miesięczny rozlicza limit co miesiąc", async () => {
      await updateNdgSettings(admin, {
        enabled: true,
        mode: "MONTHLY",
        revenueBasis: "INVOICED",
        warnThresholdPercent: 90,
      });
      await invoice(950, "2026-07-10");
      const overview = await getNdgOverview(
        admin,
        { year: 2026, periodKey: "2026-07" },
        new Date("2026-07-20")
      );
      expect(overview.periods).toHaveLength(12);
      expect(overview.selected.limit).toBe(1000);
      expect(overview.selected.status).toBe("WARNING");
    });
  });

  // ---------- PROGNOZA ----------

  describe("prognoza", () => {
    it("liczy tempo i datę wyczerpania limitu w bieżącym kwartale", async () => {
      await createNdgLimit(admin, { validFrom: "2026-01", amount: "1000" });
      await invoice(1500, "2026-07-10");

      // 46. dzień kwartału (1 lipca + 45 dni)
      const overview = await getNdgOverview(
        admin,
        { year: 2026, periodKey: "2026-Q3" },
        new Date("2026-08-15T12:00:00Z")
      );
      const projection = overview.selected.projection!;

      expect(projection.isCurrent).toBe(true);
      expect(projection.totalDays).toBe(92);
      expect(projection.dailyAverage).toBeGreaterThan(0);
      expect(projection.projectedRevenue).toBeGreaterThan(overview.selected.revenue);
      expect(projection.exhaustionDate).not.toBeNull();
    });

    it("okres zamknięty nie ma prognozy", async () => {
      await createNdgLimit(admin, { validFrom: "2026-01", amount: "1000" });
      const overview = await getNdgOverview(admin, { year: 2026 }, new Date("2026-08-15"));
      const q1 = overview.periods.find((p) => p.periodKey === "2026-Q1")!;
      expect(q1.projection).toBeNull();
    });
  });

  // ---------- WYŁĄCZENIE MODUŁU ----------

  describe("po przejściu na działalność rejestrowaną", () => {
    beforeEach(async () => {
      await createNdgLimit(admin, { validFrom: "2026-01", amount: "1000" });
      await invoice(5000, "2026-07-10");
      await updateNdgSettings(admin, {
        enabled: false,
        mode: "QUARTERLY",
        revenueBasis: "INVOICED",
        warnThresholdPercent: 90,
        businessStartedAt: "2026-07-01",
      });
    });

    it("przegląd zgłasza, że pilnowanie limitu jest wyłączone", async () => {
      // Pas ostrzegawczy i metr chowają się właśnie po tej fladze.
      const overview = await getNdgOverview(admin, { year: 2026 });
      expect(overview.settings.enabled).toBe(false);
    });

    it("ustawienia pamiętają datę założenia firmy", async () => {
      const settings = await getNdgSettings(admin);
      expect(settings.enabled).toBe(false);
      expect(settings.businessStartedAt).toBe("2026-07-01");
    });

    it("statystyki finansowe działają dalej", async () => {
      const stats = await getFinancialStats(admin, {
        scope: "QUARTER",
        year: 2026,
        quarter: 3,
      });
      expect(stats.revenueInvoiced).toBe(5000);
    });
  });

  // ---------- STATYSTYKI ----------

  describe("statystyki finansowe", () => {
    beforeEach(async () => {
      // 2 lekcje zrealizowane u Anny (stawka 60) w lipcu 2026
      await createLesson({
        studentId: prepaidId,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-07-06T14:00:00Z"),
        status: "COMPLETED",
      });
      await createLesson({
        studentId: prepaidId,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-07-13T14:00:00Z"),
        status: "COMPLETED",
      });
      await invoice(800, "2026-07-10", 8);
      await recordPayment(admin, {
        studentId: prepaidId,
        amount: "300",
        paidAt: "2026-07-12",
      });
    });

    it("miesiąc: przychód należny, kasowy, koszt i marża", async () => {
      const stats = await getFinancialStats(admin, {
        scope: "MONTH",
        year: 2026,
        month: "2026-07",
      });
      expect(stats.revenueInvoiced).toBe(800);
      expect(stats.revenuePaid).toBe(300);
      expect(stats.cost).toBe(120); // 2 × 60 zł
      expect(stats.margin).toBe(680);
      expect(stats.lessons).toBe(2);
    });

    it("kwartał i rok sumują te same dane", async () => {
      const kwartal = await getFinancialStats(admin, {
        scope: "QUARTER",
        year: 2026,
        quarter: 3,
      });
      const rok = await getFinancialStats(admin, { scope: "YEAR", year: 2026 });
      expect(kwartal.revenueInvoiced).toBe(800);
      expect(rok.revenueInvoiced).toBe(800);
      expect(rok.label).toBe("Rok 2026");
    });

    it("rozbija wynik na nauczycieli", async () => {
      const stats = await getFinancialStats(admin, {
        scope: "MONTH",
        year: 2026,
        month: "2026-07",
      });
      expect(stats.perTeacher).toHaveLength(1);
      const [row] = stats.perTeacher;
      expect(row.teacherName).toBe("Anna Testowy");
      expect(row.lessons).toBe(2);
      expect(row.revenue).toBe(800); // pakiet trafia do nauczyciela ucznia
      expect(row.cost).toBe(120);
      expect(row.margin).toBe(680);
    });

    it("okres bez zdarzeń jest pusty, nie błędny", async () => {
      const stats = await getFinancialStats(admin, {
        scope: "QUARTER",
        year: 2026,
        quarter: 1,
      });
      expect(stats.revenueInvoiced).toBe(0);
      expect(stats.cost).toBe(0);
      expect(stats.perTeacher).toEqual([]);
    });
  });
});
