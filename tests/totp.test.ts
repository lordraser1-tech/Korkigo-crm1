/**
 * TOTP — zgodność z RFC 6238 i tolerancja przesuniętego zegara.
 * Bez bazy: to czysta arytmetyka na HMAC.
 */
import { describe, expect, it } from "vitest";
import {
  formatSecretForDisplay,
  generateTotpSecret,
  totpCode,
  totpUri,
  verifyTotp,
} from "@/lib/totp";

/** Sekret z RFC 6238 ("12345678901234567890") w base32. */
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const at = (epochSeconds: number) => new Date(epochSeconds * 1000);

describe("TOTP", () => {
  it("zgadza się z wektorami testowymi RFC 6238", () => {
    const vectors: Array<[number, string]> = [
      [59, "287082"],
      [1111111109, "081804"],
      [1111111111, "050471"],
      [1234567890, "005924"],
      [2000000000, "279037"],
    ];
    for (const [epoch, expected] of vectors) {
      expect(totpCode(RFC_SECRET, at(epoch))).toBe(expected);
    }
  });

  it("przyjmuje kod z poprzedniego i następnego okna", () => {
    const now = at(1111111109);
    // Zegar telefonu bywa przesunięty — bez tolerancji logowanie byłoby loterią.
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, at(1111111109 - 30)), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, at(1111111109 + 30)), now)).toBe(true);
  });

  it("odrzuca kod spoza okna tolerancji", () => {
    const now = at(1111111109);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, at(1111111109 - 120)), now)).toBe(false);
  });

  it("odrzuca kod o złej długości i śmieci", () => {
    expect(verifyTotp(RFC_SECRET, "12345")).toBe(false);
    expect(verifyTotp(RFC_SECRET, "1234567")).toBe(false);
    expect(verifyTotp(RFC_SECRET, "")).toBe(false);
    expect(verifyTotp(RFC_SECRET, "abcdef")).toBe(false);
  });

  it("generuje sekret o długości zalecanej dla HMAC-SHA1", () => {
    const secret = generateTotpSecret();
    // 20 bajtów -> 32 znaki base32.
    expect(secret).toHaveLength(32);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    // Dwa wywołania nie mogą dać tego samego sekretu.
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it("adres otpauth zawiera wydawcę i konto", () => {
    const uri = totpUri("ABCDEFGHIJKLMNOP", "admin@korkigo.pl");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=ABCDEFGHIJKLMNOP");
    expect(decodeURIComponent(uri)).toContain("KorkiGO CRM:admin@korkigo.pl");
  });

  it("sekret do przepisania jest pogrupowany", () => {
    expect(formatSecretForDisplay("ABCDEFGH")).toBe("ABCD EFGH");
  });
});
