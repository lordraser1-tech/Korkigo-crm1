import { describe, expect, it } from "vitest";
import {
  addWeeksToWallClock,
  currentMonthKey,
  monthRange,
  shiftMonth,
  toWallClockInput,
  wallClockToUtc,
} from "@/lib/datetime";
import { lessonCreateSchema } from "@/lib/validation";

describe("konwersja czasu warszawskiego", () => {
  it("zamienia czas letni (UTC+2) na UTC", () => {
    expect(wallClockToUtc("2026-07-15T16:00").toISOString()).toBe(
      "2026-07-15T14:00:00.000Z"
    );
  });

  it("zamienia czas zimowy (UTC+1) na UTC", () => {
    expect(wallClockToUtc("2026-01-15T16:00").toISOString()).toBe(
      "2026-01-15T15:00:00.000Z"
    );
  });

  it("wraca do tej samej godziny ściennej", () => {
    const utc = wallClockToUtc("2026-10-25T02:30");
    expect(toWallClockInput(utc)).toBe("2026-10-25T02:30");
  });

  it("utrzymuje godzinę lekcji mimo zmiany czasu", () => {
    // 2026-10-25 kończy się czas letni — lekcja ma zostać o 16:00 lokalnie.
    const before = "2026-10-21T16:00";
    const after = addWeeksToWallClock(before, 1);
    expect(after).toBe("2026-10-28T16:00");
    expect(toWallClockInput(wallClockToUtc(after))).toBe("2026-10-28T16:00");
    expect(wallClockToUtc(after).toISOString()).toBe("2026-10-28T15:00:00.000Z");
  });

  it("wyznacza granice miesiąca w czasie lokalnym", () => {
    const { from, to } = monthRange("2026-02");
    expect(from.toISOString()).toBe("2026-01-31T23:00:00.000Z");
    expect(to.toISOString()).toBe("2026-02-28T23:00:00.000Z");
  });

  it("przesuwa miesiąc przez granicę roku", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("zwraca bieżący miesiąc w formacie RRRR-MM", () => {
    expect(currentMonthKey(new Date("2026-03-10T12:00:00Z"))).toBe("2026-03");
  });
});

/**
 * Godzina z nocy przejścia na czas letni nie istnieje. Wcześniej taka wartość
 * przechodziła po cichu i zapisywała się o godzinę później — operacja kończyła
 * się sukcesem o innym terminie, niż podał użytkownik. Audyt zewnętrzny, F17.
 */
describe("zmiana czasu", () => {
  it("odrzuca godzinę, której w tym dniu nie ma", () => {
    // 29 marca 2026 zegar skacze z 02:00 na 03:00.
    expect(() => wallClockToUtc("2026-03-29T02:30")).toThrow(/nie istnieje/);
    expect(() => wallClockToUtc("2026-03-29T02:00")).toThrow(/nie istnieje/);
  });

  it("godziny tuż obok luki działają normalnie", () => {
    expect(toWallClockInput(wallClockToUtc("2026-03-29T01:30"))).toBe(
      "2026-03-29T01:30"
    );
    expect(toWallClockInput(wallClockToUtc("2026-03-29T03:30"))).toBe(
      "2026-03-29T03:30"
    );
  });

  /** Jesienią ta sama godzina wypada dwa razy — bierzemy pierwszą, zawsze tak samo. */
  it("godzina podwójna jest przyjmowana deterministycznie", () => {
    const a = wallClockToUtc("2026-10-25T02:30");
    const b = wallClockToUtc("2026-10-25T02:30");
    expect(a.toISOString()).toBe(b.toISOString());
    expect(toWallClockInput(a)).toBe("2026-10-25T02:30");
  });

  it("schemat lekcji zwraca błąd przy polu, nie wyjątek", () => {
    const wynik = lessonCreateSchema.safeParse({
      studentId: "s1",
      subjectLevelId: "l1",
      scheduledAt: "2026-03-29T02:30",
    });
    expect(wynik.success).toBe(false);
    if (!wynik.success) {
      expect(wynik.error.issues[0].message).toMatch(/zmienia się czas/);
    }
  });
});
