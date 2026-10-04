/**
 * TOTP (RFC 6238) — drugi składnik logowania.
 *
 * Implementacja własna, bo to kilkadziesiąt linii na `node:crypto`, a każda
 * dodatkowa zależność w ścieżce logowania to kolejna rzecz do pilnowania.
 * Zgodna z Google Authenticator, Aegis i 1Password: SHA-1, 6 cyfr, okno 30 s.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DIGITS = 6;
const PERIOD_SECONDS = 30;
/** Ile okien wstecz/wprzód akceptujemy — zegar telefonu bywa przesunięty. */
const DRIFT_WINDOWS = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(): string {
  // 20 bajtów = 160 bitów, tyle zaleca RFC 4226 dla HMAC-SHA1.
  return base32Encode(randomBytes(20));
}

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function codeForCounter(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  // Licznik jest 64-bitowy; zapisujemy go jako dwa 32-bitowe słowa.
  buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buffer.writeUInt32BE(counter % 2 ** 32, 4);

  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Kod dla podanej chwili — używane w testach i do podglądu. */
export function totpCode(secret: string, now = new Date()): string {
  return codeForCounter(secret, Math.floor(now.getTime() / 1000 / PERIOD_SECONDS));
}

/**
 * Sprawdzenie kodu. Porównanie stałoczasowe, żeby czas odpowiedzi nie
 * podpowiadał, ile cyfr się zgadza.
 */
export function verifyTotp(
  secret: string,
  code: string,
  now = new Date()
): boolean {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== DIGITS) return false;

  const counter = Math.floor(now.getTime() / 1000 / PERIOD_SECONDS);
  for (let drift = -DRIFT_WINDOWS; drift <= DRIFT_WINDOWS; drift += 1) {
    const expected = codeForCounter(secret, counter + drift);
    const a = Buffer.from(expected);
    const b = Buffer.from(clean);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/**
 * Adres `otpauth://` dla aplikacji uwierzytelniającej. Nazwa konta i wydawca
 * trafiają do adresu, więc użytkownik widzi w aplikacji, czego dotyczy kod.
 */
export function totpUri(
  secret: string,
  account: string,
  issuer = "KorkiGO CRM"
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Sekret w grupach po 4 znaki — do ręcznego przepisania do aplikacji. */
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export const TOTP_PERIOD_SECONDS = PERIOD_SECONDS;
export const TOTP_DIGITS = DIGITS;
