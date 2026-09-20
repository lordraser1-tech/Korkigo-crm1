import { describe, expect, it } from "vitest";
import {
  addWeeksToWallClock,
  currentMonthKey,
  monthRange,
  shiftMonth,
  toWallClockInput,
  wallClockToUtc,
} from "@/lib/datetime";

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
