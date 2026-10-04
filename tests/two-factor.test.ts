/**
 * Drugi składnik logowania: konfiguracja, kody zapasowe i granice dostępu.
 */
import { afterAll, beforeEach, expect, it } from "vitest";
import { ValidationError } from "@/lib/errors";
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  requiresSecondFactor,
  startTwoFactorSetup,
  verifySecondFactor,
} from "@/lib/services/two-factor";
import { listSecurityEvents } from "@/lib/services/security-log";
import { totpCode } from "@/lib/totp";
import {
  TEST_PASSWORD,
  createAdmin,
  createTeacher,
  describeDb,
  givePassword,
  prisma,
  resetDatabase,
} from "./helpers/db";

/** Sekret z konfiguracji wraca pogrupowany — do kodu trzeba go złożyć. */
function secretFrom(display: string): string {
  return display.replace(/\s/g, "");
}

describeDb("drugi składnik logowania", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;

  beforeEach(async () => {
    await resetDatabase();
    process.env.AUTH_SECRET = "testowy-sekret-min-32-znaki-dlugosci-ok";
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    // Wyłączenie drugiego składnika wymaga hasła, więc admin musi mieć prawdziwe.
    await givePassword(admin.userId);
  });

  /** Przechodzi pełną konfigurację i zwraca sekret oraz kody zapasowe. */
  async function enable(actor: typeof admin | typeof anna) {
    const setup = await startTwoFactorSetup(actor);
    const secret = secretFrom(setup.secretForDisplay);
    const { recoveryCodes } = await confirmTwoFactorSetup(actor, totpCode(secret));
    return { secret, recoveryCodes };
  }

  it("konfiguracja wymaga potwierdzenia kodem", async () => {
    expect((await getTwoFactorStatus(admin)).enabled).toBe(false);

    const setup = await startTwoFactorSetup(admin);
    // Sekret już jest, ale drugi składnik NIE jest włączony — inaczej dałoby
    // się zamknąć sobie dostęp sekretem, którego aplikacja nie dostała.
    const pending = await getTwoFactorStatus(admin);
    expect(pending.enabled).toBe(false);
    expect(pending.pendingSetup).toBe(true);
    expect(await requiresSecondFactor(admin.userId)).toBe(false);

    await expect(confirmTwoFactorSetup(admin, "000000")).rejects.toBeInstanceOf(
      ValidationError
    );

    const { recoveryCodes } = await confirmTwoFactorSetup(
      admin,
      totpCode(secretFrom(setup.secretForDisplay))
    );
    expect(recoveryCodes).toHaveLength(8);
    expect((await getTwoFactorStatus(admin)).enabled).toBe(true);
    expect(await requiresSecondFactor(admin.userId)).toBe(true);
  });

  it("sekret w bazie jest zaszyfrowany", async () => {
    const { secret } = await enable(admin);
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: admin.userId },
      select: { totpSecret: true },
    });
    // Wyciek bazy nie może dać komuś generatora kodów.
    expect(row.totpSecret).not.toContain(secret);
    expect(row.totpSecret!.startsWith("v1:")).toBe(true);
  });

  it("przyjmuje kod z aplikacji, odrzuca zły", async () => {
    const { secret } = await enable(admin);
    expect(await verifySecondFactor(admin.userId, totpCode(secret))).toEqual({
      ok: true,
      usedRecoveryCode: false,
    });
    expect(await verifySecondFactor(admin.userId, "000000")).toEqual({ ok: false });
  });

  it("kod zapasowy działa raz", async () => {
    const { recoveryCodes } = await enable(admin);
    const code = recoveryCodes[0];

    expect(await verifySecondFactor(admin.userId, code)).toEqual({
      ok: true,
      usedRecoveryCode: true,
    });
    // Drugie użycie tego samego kodu musi odpaść.
    expect(await verifySecondFactor(admin.userId, code)).toEqual({ ok: false });
    expect((await getTwoFactorStatus(admin)).unusedRecoveryCodes).toBe(7);
  });

  it("kody zapasowe są w bazie tylko jako hasze", async () => {
    const { recoveryCodes } = await enable(admin);
    const rows = await prisma.twoFactorRecoveryCode.findMany({
      select: { codeHash: true },
    });
    const all = rows.map((r) => r.codeHash).join(" ");
    for (const code of recoveryCodes) expect(all).not.toContain(code);
  });

  it("nowy zestaw kodów unieważnia poprzedni", async () => {
    const { recoveryCodes } = await enable(admin);
    const stary = recoveryCodes[0];

    const { recoveryCodes: nowe } = await regenerateRecoveryCodes(admin, TEST_PASSWORD);
    expect(nowe).toHaveLength(8);
    expect(nowe).not.toContain(stary);
    expect(await verifySecondFactor(admin.userId, stary)).toEqual({ ok: false });
    expect(await verifySecondFactor(admin.userId, nowe[0])).toEqual({
      ok: true,
      usedRecoveryCode: true,
    });
  });

  it("wyłączenie i nowe kody wymagają hasła", async () => {
    await enable(admin);
    // Złe hasło musi odpaść, zanim cokolwiek się zmieni.
    await expect(disableTwoFactor(admin, "zle-haslo")).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(
      regenerateRecoveryCodes(admin, "zle-haslo")
    ).rejects.toBeInstanceOf(ValidationError);

    await disableTwoFactor(admin, TEST_PASSWORD);
    expect((await getTwoFactorStatus(admin)).enabled).toBe(false);
    expect(await requiresSecondFactor(admin.userId)).toBe(false);
  });

  it("wyłączenie usuwa sekret i kody zapasowe", async () => {
    await enable(admin);
    await disableTwoFactor(admin, TEST_PASSWORD);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: admin.userId },
      select: { totpSecret: true, totpEnabledAt: true },
    });
    expect(row.totpSecret).toBeNull();
    expect(row.totpEnabledAt).toBeNull();
    expect(await prisma.twoFactorRecoveryCode.count()).toBe(0);
  });

  it("drugi składnik jest osobny dla każdego konta", async () => {
    await enable(admin);
    expect(await requiresSecondFactor(admin.userId)).toBe(true);
    // Włączenie u admina nie może wymuszać kodu u nauczycielki.
    expect(await requiresSecondFactor(anna.userId)).toBe(false);
    expect((await getTwoFactorStatus(anna)).enabled).toBe(false);

    const { secret } = await enable(anna);
    // ...i kod jednego konta nie otwiera drugiego.
    expect(await verifySecondFactor(admin.userId, totpCode(secret))).toEqual({
      ok: false,
    });
  });

  it("włączenie i wyłączenie zostawia ślad w dzienniku", async () => {
    await enable(admin);
    await disableTwoFactor(admin, TEST_PASSWORD);

    const types = (await listSecurityEvents(admin)).map((e) => e.type);
    expect(types).toContain("TOTP_ENABLED");
    expect(types).toContain("TOTP_DISABLED");
  });

  it("konta bez drugiego składnika nie da się zweryfikować kodem", async () => {
    expect(await verifySecondFactor(anna.userId, "123456")).toEqual({ ok: false });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
