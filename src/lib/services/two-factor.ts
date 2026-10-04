/**
 * Drugi składnik logowania (TOTP) + kody zapasowe.
 *
 * Sekret TOTP leży w bazie ZASZYFROWANY (`src/lib/crypto.ts`) — wyciek samej
 * bazy nie może dać komuś generatora kodów. Kody zapasowe trzymamy jako hasze,
 * więc nie da się ich odtworzyć; użytkownik widzi je raz, przy generowaniu.
 *
 * Kody zapasowe haszujemy SHA-256, nie bcryptem. Bcrypt jest wolny z rozmysłem,
 * bo chroni hasła wymyślone przez ludzi — a te kody mają 50 bitów entropii
 * z generatora, więc zgadywanie i tak jest nierealne. Bcrypt kosztem 12 przy
 * ośmiu kodach to ~2,5 s CPU na jedną próbę logowania: wolne dla użytkownika
 * i tani sposób na obciążenie serwera.
 *
 * Konfiguracja jest DWUETAPOWA: sekret powstaje przy „Rozpocznij", ale drugi
 * składnik włącza się dopiero po przepisaniu poprawnego kodu. Inaczej dałoby
 * się zamknąć sobie dostęp sekretem, którego aplikacja nigdy nie dostała.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { verifyPassword } from "@/lib/password";
import {
  formatSecretForDisplay,
  generateTotpSecret,
  totpUri,
  verifyTotp,
} from "@/lib/totp";
import { recordSecurityEvent } from "@/lib/services/security-log";

const RECOVERY_CODE_COUNT = 8;

export type TwoFactorStatus = {
  enabled: boolean;
  enabledAt: string | null;
  /** Czy sekret już jest, ale czeka na potwierdzenie kodem. */
  pendingSetup: boolean;
  unusedRecoveryCodes: number;
};

export type TwoFactorSetup = {
  /** Sekret w grupach po 4 znaki — do przepisania ręcznie. */
  secretForDisplay: string;
  /** Adres `otpauth://` dla aplikacji uwierzytelniającej. */
  uri: string;
};

export async function getTwoFactorStatus(actor: Actor): Promise<TwoFactorStatus> {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (!user) throw new NotFoundError("Nie znaleziono konta.");

  const unused = await prisma.twoFactorRecoveryCode.count({
    where: { userId: actor.userId, usedAt: null },
  });

  return {
    enabled: user.totpEnabledAt !== null,
    enabledAt: user.totpEnabledAt?.toISOString() ?? null,
    pendingSetup: user.totpSecret !== null && user.totpEnabledAt === null,
    unusedRecoveryCodes: unused,
  };
}

/** Krok 1: generuje sekret i zwraca go do przepisania. Jeszcze nie włącza. */
export async function startTwoFactorSetup(actor: Actor): Promise<TwoFactorSetup> {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { email: true, totpEnabledAt: true },
  });
  if (!user) throw new NotFoundError("Nie znaleziono konta.");
  if (user.totpEnabledAt) {
    throw new ValidationError("Drugi składnik jest już włączony.");
  }

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: actor.userId },
    data: { totpSecret: encryptSecret(secret) },
  });

  return {
    secretForDisplay: formatSecretForDisplay(secret),
    uri: totpUri(secret, user.email),
  };
}

/** Krok 2: potwierdzenie kodem. Dopiero to włącza drugi składnik. */
export async function confirmTwoFactorSetup(
  actor: Actor,
  code: string
): Promise<{ recoveryCodes: string[] }> {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (!user?.totpSecret) {
    throw new ValidationError("Najpierw rozpocznij konfigurację.");
  }
  if (user.totpEnabledAt) {
    throw new ValidationError("Drugi składnik jest już włączony.");
  }
  if (!verifyTotp(decryptSecret(user.totpSecret), code)) {
    throw new ValidationError(
      "Kod się nie zgadza. Sprawdź, czy przepisałeś sekret w całości."
    );
  }

  const codes = await replaceRecoveryCodes(actor.userId);
  await prisma.user.update({
    where: { id: actor.userId },
    data: { totpEnabledAt: new Date() },
  });
  await recordSecurityEvent({
    type: "TOTP_ENABLED",
    userId: actor.userId,
    email: actor.email,
  });

  return { recoveryCodes: codes };
}

/**
 * Wyłączenie wymaga hasła. Bez tego ktoś z przejętą sesją zdjąłby drugi
 * składnik jednym kliknięciem i cała ochrona byłaby pozorna.
 */
export async function disableTwoFactor(
  actor: Actor,
  password: string
): Promise<void> {
  await assertPassword(actor.userId, password);

  await prisma.$transaction([
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId: actor.userId } }),
    prisma.user.update({
      where: { id: actor.userId },
      data: { totpSecret: null, totpEnabledAt: null },
    }),
  ]);
  await recordSecurityEvent({
    type: "TOTP_DISABLED",
    userId: actor.userId,
    email: actor.email,
  });
}

/** Nowy zestaw kodów zapasowych; stare przestają działać. Też za hasłem. */
export async function regenerateRecoveryCodes(
  actor: Actor,
  password: string
): Promise<{ recoveryCodes: string[] }> {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { totpEnabledAt: true },
  });
  if (!user?.totpEnabledAt) {
    throw new ValidationError("Drugi składnik nie jest włączony.");
  }
  await assertPassword(actor.userId, password);
  return { recoveryCodes: await replaceRecoveryCodes(actor.userId) };
}

async function assertPassword(userId: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw new NotFoundError("Nie znaleziono konta.");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new ValidationError("Hasło jest nieprawidłowe.");
  }
}

/** Kody czytelne przy przepisywaniu: bez znaków, które się mylą (0/O, 1/I). */
function generateRecoveryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let code = "";
  for (let i = 0; i < 10; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
    if (i === 4) code += "-";
  }
  return code;
}

/** Normalizacja przed haszowaniem — użytkownik przepisuje kod ręcznie. */
function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s/g, "");
}

function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);

  await prisma.$transaction([
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    prisma.twoFactorRecoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
    }),
  ]);
  return codes;
}

// ---------- SPRAWDZENIE PRZY LOGOWANIU ----------

export type SecondFactorResult =
  | { ok: true; usedRecoveryCode: boolean }
  | { ok: false };

/**
 * Sprawdza kod z aplikacji ALBO kod zapasowy. Wołane z logowania, więc bierze
 * `userId`, nie `Actor` — sesji jeszcze nie ma.
 */
export async function verifySecondFactor(
  userId: string,
  code: string
): Promise<SecondFactorResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (!user?.totpSecret || !user.totpEnabledAt) return { ok: false };

  if (verifyTotp(decryptSecret(user.totpSecret), code)) {
    return { ok: true, usedRecoveryCode: false };
  }

  // Kod zapasowy — jednorazowy, więc po trafieniu od razu go oznaczamy.
  // Porównujemy stałoczasowo, choć przy haszu SHA-256 i tak nie ma tu czego
  // wyciekać — kosztuje nic, a nie trzeba się nad tym zastanawiać.
  const expected = hashRecoveryCode(code);
  const candidates = await prisma.twoFactorRecoveryCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });
  for (const candidate of candidates) {
    const a = Buffer.from(candidate.codeHash);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      await prisma.twoFactorRecoveryCode.update({
        where: { id: candidate.id },
        data: { usedAt: new Date() },
      });
      return { ok: true, usedRecoveryCode: true };
    }
  }

  return { ok: false };
}

/** Czy konto wymaga drugiego składnika — pytane przy logowaniu. */
export async function requiresSecondFactor(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabledAt: true },
  });
  return Boolean(user?.totpEnabledAt);
}

/** Admin nie może zdjąć drugiego składnika nauczycielowi ani odwrotnie. */
export function assertOwnAccount(actor: Actor, userId: string): void {
  if (actor.userId !== userId) {
    throw new ForbiddenError("Drugim składnikiem zarządza właściciel konta.");
  }
}
