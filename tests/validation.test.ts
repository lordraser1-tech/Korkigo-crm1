/**
 * Schematy wejścia — czyste sprawdzenia, bez bazy.
 *
 * Sedno tego pliku: data musi być prawdziwym dniem w kalendarzu, a nie samym
 * układem cyfr. `2026-13-45` przechodziło przez wyrażenie regularne, a
 * `Date.UTC(2026, 12, 45)` po cichu przewijało to na 2027-02-14 — operacja
 * trafiała wtedy w zupełnie inny dzień, niż prosił użytkownik.
 */
import { describe, expect, it } from "vitest";
import {
  amountSchema,
  availabilityDaySchema,
  availabilitySlotSchema,
  copyAvailabilitySchema,
  isoDate,
  lessonCreateSchema,
  monthKeySchema,
  monthlyInvoiceSchema,
  ndgSettingsSchema,
  packageInvoiceSchema,
  outstandingInvoiceSchema,
  subjectLevelUpdateSchema,
  timeOfDay,
  wallClock,
} from "@/lib/validation";

describe("daty i godziny", () => {
  it("przyjmuje prawdziwy dzień", () => {
    expect(isoDate.parse(" 2026-09-20 ")).toBe("2026-09-20");
  });

  it("odrzuca dzień, którego nie ma w kalendarzu", () => {
    for (const value of ["2026-13-45", "2026-02-30", "2026-00-10", "2026-04-31"]) {
      expect(isoDate.safeParse(value).success, value).toBe(false);
    }
  });

  it("zna lata przestępne", () => {
    expect(isoDate.safeParse("2024-02-29").success).toBe(true);
    expect(isoDate.safeParse("2026-02-29").success).toBe(false);
  });

  it("odrzuca godzinę spoza doby", () => {
    expect(timeOfDay.safeParse("16:00").success).toBe(true);
    expect(timeOfDay.safeParse("99:99").success).toBe(false);
    expect(timeOfDay.safeParse("24:00").success).toBe(false);
  });

  it("czas ścienny sprawdza obie części", () => {
    expect(wallClock.safeParse("2026-09-20T16:00").success).toBe(true);
    expect(wallClock.safeParse("2026-13-45T16:00").success).toBe(false);
    expect(wallClock.safeParse("2026-09-20T25:00").success).toBe(false);
  });

  it("miesiąc rozliczeniowy musi być z zakresu 01-12", () => {
    expect(monthKeySchema.safeParse("2026-09").success).toBe(true);
    expect(monthKeySchema.safeParse("2026-13").success).toBe(false);
    expect(monthKeySchema.safeParse("2026-00").success).toBe(false);
  });

  it("zła data nie przechodzi też przez schematy, które jej używają", () => {
    expect(availabilitySlotSchema.safeParse({
      date: "2026-13-45", startTime: "16:00", endTime: "18:00",
    }).success).toBe(false);
    expect(copyAvailabilitySchema.safeParse({
      sourceWeek: "2026-09-14", targetWeek: "2026-02-30",
    }).success).toBe(false);
    expect(lessonCreateSchema.safeParse({
      studentId: "s", subjectLevelId: "l", scheduledAt: "2026-02-30T16:00",
    }).success).toBe(false);
  });
});

describe("schematy dopisane do funkcji serwisowych", () => {
  it("rachunek na zaległe lekcje wymaga ucznia i pilnuje terminu", () => {
    expect(outstandingInvoiceSchema.safeParse({ studentId: "" }).success).toBe(false);
    expect(outstandingInvoiceSchema.safeParse({
      studentId: "s1", issuedAt: "2026-13-45",
    }).success).toBe(false);
    expect(outstandingInvoiceSchema.safeParse({
      studentId: "s1", dueDays: 999,
    }).success).toBe(false);

    const ok = outstandingInvoiceSchema.parse({ studentId: "s1", note: "" });
    expect(ok.note).toBeNull();
  });

  it("edycja poziomu odrzuca pustą nazwę", () => {
    expect(subjectLevelUpdateSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(subjectLevelUpdateSchema.parse({ name: " A1 " }).name).toBe("A1");
    // Sama zmiana widoczności, bez nazwy, jest poprawna.
    expect(subjectLevelUpdateSchema.parse({ active: false }).active).toBe(false);
  });

  it("czyszczenie dnia wymaga prawdziwej daty", () => {
    expect(availabilityDaySchema.safeParse({ date: "2026-13-45" }).success).toBe(false);
    expect(availabilityDaySchema.parse({ date: "2026-09-20" }).date).toBe("2026-09-20");
  });
});

/**
 * Znaleziska z audytu zewnętrznego (F15–F17). Każde było odtworzone na
 * działającym kodzie, więc każde dostaje test, który padnie przy nawrocie.
 */
describe("kwoty (F15)", () => {
  it("przyjmuje najwyżej dwa miejsca po przecinku", () => {
    expect(amountSchema.parse("12,34")).toBe(12.34);
    expect(amountSchema.parse("12.34")).toBe(12.34);
    expect(amountSchema.parse("100")).toBe(100);
    expect(amountSchema.parse(".5")).toBe(0.5);
  });

  /**
   * Poprzedni warunek porównywał `Math.round(v * 100)` z `(v * 100).toFixed(0)`
   * i dla 1,005 oba dawały 100 — trzy miejsca wchodziły do bazy mimo
   * komunikatu, że nie wolno.
   */
  it("odrzuca trzecie miejsce po przecinku — także podane jako liczba", () => {
    for (const v of ["1.005", "1,005", "0.001", "2.9999", "0.555"]) {
      expect(amountSchema.safeParse(v).success, v).toBe(false);
    }
    expect(amountSchema.safeParse(1.005).success).toBe(false);
    expect(amountSchema.safeParse(12.34).success).toBe(true);
  });

  it("odrzuca notację wykładniczą, tekst i wartości ujemne", () => {
    for (const v of ["1e2", "abc", "-5", "", " ", "1.2.3", "Infinity", "NaN"]) {
      expect(amountSchema.safeParse(v).success, JSON.stringify(v)).toBe(false);
    }
  });

  it("pilnuje górnej granicy", () => {
    expect(amountSchema.safeParse("100000").success).toBe(true);
    expect(amountSchema.safeParse("100000.01").success).toBe(false);
  });
});

describe("puste pola liczbowe (F16)", () => {
  /**
   * `.optional()` reaguje na `undefined`, a formularz przysyła pusty tekst,
   * który `Number("")` zamieniał na 0. Pusty termin stawał się płatnością
   * na dziś, a pusta cena pakietu zerem zamiast ceny ucznia.
   */
  it("pusty termin płatności to brak, nie zero", () => {
    const pusty = monthlyInvoiceSchema.parse({
      studentId: "s1",
      month: "2026-09",
      dueDays: "",
    });
    expect(pusty.dueDays).toBeUndefined();

    const podany = monthlyInvoiceSchema.parse({
      studentId: "s1",
      month: "2026-09",
      dueDays: "14",
    });
    expect(podany.dueDays).toBe(14);
  });

  it("pusta cena pakietu to brak, nie zero", () => {
    const pusta = packageInvoiceSchema.parse({
      studentId: "s1",
      quantity: "4",
      unitPrice: "",
    });
    expect(pusta.unitPrice).toBeUndefined();

    const podana = packageInvoiceSchema.parse({
      studentId: "s1",
      quantity: "4",
      unitPrice: "80,50",
    });
    expect(podana.unitPrice).toBe(80.5);
  });

  it("jawne zero nadal znaczy zero", () => {
    const zero = monthlyInvoiceSchema.parse({
      studentId: "s1",
      month: "2026-09",
      dueDays: "0",
    });
    expect(zero.dueDays).toBe(0);
  });
});

describe("pola tak/nie", () => {
  /**
   * `z.coerce.boolean()` zamienia tekst "false" na `true`, więc przełącznik
   * działałby tylko w jedną stronę. Stąd osobny budulec.
   */
  it('tekstowe "false" znaczy fałsz', () => {
    expect(subjectLevelUpdateSchema.parse({ active: "false" }).active).toBe(false);
    expect(subjectLevelUpdateSchema.parse({ active: "true" }).active).toBe(true);
    expect(ndgSettingsSchema.parse({
      enabled: "false", warnThresholdPercent: 90,
    }).enabled).toBe(false);
  });
});
