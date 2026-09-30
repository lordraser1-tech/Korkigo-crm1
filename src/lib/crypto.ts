/**
 * Szyfrowanie sekretów trzymanych w bazie (dziś: tokeny Google).
 *
 * Wyciek samej bazy nie może dawać dostępu do cudzych kalendarzy, więc token
 * odświeżania leży zaszyfrowany, a klucz siedzi wyłącznie w środowisku.
 * AES-256-GCM, bo daje też wykrycie manipulacji, nie tylko poufność.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const PREFIX = "v1";
const IV_BYTES = 12;

/**
 * Klucz bierzemy z `ENCRYPTION_KEY`, a gdy go nie ma — wyprowadzamy z
 * `AUTH_SECRET`, żeby wdrożenie nie wymagało dwóch zmiennych na starcie.
 * Zmiana któregokolwiek z nich unieważnia zaszyfrowane wartości: podłączenie
 * kalendarza trzeba wtedy powtórzyć (i tak o tym mówimy w README).
 */
function key(): Buffer {
  const material = process.env.ENCRYPTION_KEY ?? process.env.AUTH_SECRET;
  if (!material || material.length < 32) {
    throw new Error(
      "Do szyfrowania potrzebny jest ENCRYPTION_KEY albo AUTH_SECRET (min. 32 znaki)."
    );
  }
  return createHash("sha256").update(material).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Odszyfrowanie. Wartość bez prefiksu traktujemy jako zapisaną jeszcze
 * otwartym tekstem — dzięki temu wdrożenie tej zmiany nie zrywa istniejących
 * połączeń, a każdy kolejny zapis odkłada już postać zaszyfrowaną.
 */
export function decryptSecret(value: string): string {
  if (!value.startsWith(`${PREFIX}:`)) return value;

  const [, ivPart, tagPart, dataPart] = value.split(":");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Uszkodzona wartość zaszyfrowana.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivPart, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
