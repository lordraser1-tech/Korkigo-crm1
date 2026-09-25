/**
 * Regulamin odwołań — czyste wyliczenia z `src/lib/policy.ts`, bez bazy.
 * Testy celowo nie powtarzają liczb z regulaminu tam, gdzie da się ich nie
 * wpisywać, ale progi 24/12 h są wprost tym, co sprawdzamy.
 */
import { describe, expect, it } from "vitest";
import {
  CANCELLATION_TIERS,
  cancellationCharge,
  cancellationChargePercent,
  cancellationPolicyLabel,
  countsTowardsTeacherPayout,
  lessonChargeAmount,
} from "@/lib/policy";

const LESSON = new Date("2026-09-21T14:00:00Z");

function hoursBefore(hours: number): Date {
  return new Date(LESSON.getTime() - hours * 60 * 60 * 1000);
}

describe("regulamin odwołań", () => {
  it("zgłoszenie z dużym wyprzedzeniem jest bezpłatne", () => {
    expect(cancellationChargePercent(LESSON, hoursBefore(48))).toBe(0);
    expect(cancellationCharge(100, LESSON, hoursBefore(48))).toBe(0);
  });

  it("dokładnie 24 h przed lekcją to jeszcze próg bezpłatny", () => {
    expect(cancellationChargePercent(LESSON, hoursBefore(24))).toBe(0);
  });

  it("między 12 a 24 h naliczamy połowę ceny", () => {
    expect(cancellationChargePercent(LESSON, hoursBefore(20))).toBe(50);
    expect(cancellationCharge(120, LESSON, hoursBefore(20))).toBe(60);
  });

  it("poniżej 12 h naliczamy pełną cenę", () => {
    expect(cancellationChargePercent(LESSON, hoursBefore(2))).toBe(100);
    expect(cancellationCharge(133.33, LESSON, hoursBefore(2))).toBe(133.33);
  });

  it("zgłoszenie po terminie lekcji wpada w najostrzejszy próg", () => {
    const percent = cancellationChargePercent(LESSON, hoursBefore(-3));
    expect(percent).toBe(
      CANCELLATION_TIERS[CANCELLATION_TIERS.length - 1].chargePercent
    );
  });

  it("opis progu mówi, ile godzin przed lekcją zgłoszono", () => {
    expect(cancellationPolicyLabel(LESSON, hoursBefore(20))).toContain("20 h");
    expect(cancellationPolicyLabel(LESSON, hoursBefore(-1))).toContain(
      "po terminie"
    );
  });

  it("kwota nigdy nie wychodzi poza grosze", () => {
    const amount = cancellationCharge(99.99, LESSON, hoursBefore(20));
    expect(amount).toBe(Number(amount.toFixed(2)));
    expect(amount).toBeCloseTo(49.995, 1);
  });
});

describe("naliczenie za lekcję", () => {
  it("zaplanowana lekcja nic nie kosztuje", () => {
    expect(
      lessonChargeAmount({ status: "SCHEDULED", price: 100, cancellationAmount: null })
    ).toBe(0);
  });

  it("zrealizowana kosztuje pełną cenę", () => {
    expect(
      lessonChargeAmount({ status: "COMPLETED", price: 100, cancellationAmount: null })
    ).toBe(100);
  });

  it("nieobecność kosztuje pełną cenę, bez progów czasowych", () => {
    expect(
      lessonChargeAmount({ status: "NO_SHOW", price: 100, cancellationAmount: null })
    ).toBe(100);
  });

  it("odwołana bierze kwotę zapisaną przy lekcji, nie cenę", () => {
    expect(
      lessonChargeAmount({ status: "CANCELLED", price: 100, cancellationAmount: 50 })
    ).toBe(50);
    expect(
      lessonChargeAmount({ status: "CANCELLED", price: 100, cancellationAmount: null })
    ).toBe(0);
  });
});

describe("wypłata nauczyciela", () => {
  it("liczy lekcje zrealizowane i nieobecności, nie odwołania", () => {
    expect(countsTowardsTeacherPayout("COMPLETED")).toBe(true);
    expect(countsTowardsTeacherPayout("NO_SHOW")).toBe(true);
    expect(countsTowardsTeacherPayout("CANCELLED")).toBe(false);
    expect(countsTowardsTeacherPayout("SCHEDULED")).toBe(false);
  });
});
