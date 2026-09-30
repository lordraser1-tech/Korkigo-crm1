/** Limit zapytań — okno przesuwne w pamięci procesu. */
import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, clientKey, resetRateLimits } from "@/lib/rate-limit";

const RULE = { limit: 3, windowMs: 60_000 };

describe("limit zapytań", () => {
  beforeEach(() => resetRateLimits());

  it("przepuszcza do wyczerpania limitu", () => {
    for (let i = 0; i < RULE.limit; i += 1) {
      expect(checkRateLimit("a", RULE).ok).toBe(true);
    }
    expect(checkRateLimit("a", RULE).ok).toBe(false);
  });

  it("podaje, za ile sekund spróbować ponownie", () => {
    const now = 1_000_000;
    for (let i = 0; i < RULE.limit; i += 1) checkRateLimit("a", RULE, now);

    const blocked = checkRateLimit("a", RULE, now + 10_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      // Zostało 50 s z minutowego okna.
      expect(blocked.retryAfterSeconds).toBe(50);
    }
  });

  it("okno się przesuwa — po jego upływie znów wolno", () => {
    const now = 1_000_000;
    for (let i = 0; i < RULE.limit; i += 1) checkRateLimit("a", RULE, now);
    expect(checkRateLimit("a", RULE, now).ok).toBe(false);
    expect(checkRateLimit("a", RULE, now + RULE.windowMs + 1).ok).toBe(true);
  });

  it("liczniki są osobne dla każdego klucza", () => {
    for (let i = 0; i < RULE.limit; i += 1) checkRateLimit("a", RULE);
    expect(checkRateLimit("a", RULE).ok).toBe(false);
    // Inny adres nie może oberwać za cudze zapytania.
    expect(checkRateLimit("b", RULE).ok).toBe(true);
  });

  it("adres klienta bierzemy z pierwszego wpisu x-forwarded-for", () => {
    // Kolejne wpisy dopisują pośrednicy — klient jest pierwszy.
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2",
    });
    expect(clientKey(headers)).toBe("203.0.113.7");
  });

  it("bez nagłówków wszyscy trafiają do wspólnego kubełka", () => {
    // Lepiej ograniczyć wszystkich niż nikogo.
    expect(clientKey(new Headers())).toBe("nieznany");
  });
});
