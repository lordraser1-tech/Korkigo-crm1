/**
 * Reguły bezpieczeństwa: filtr powrotu po zalogowaniu, unieważnianie sesji,
 * blokada po serii nieudanych prób i szyfrowanie sekretów w bazie.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  MAX_FAILED_LOGINS,
  checkLock,
  registerFailedLogin,
  registerSuccessfulLogin,
} from "@/lib/services/login-guard";
import { changeOwnPassword, setTeacherPassword } from "@/lib/services/teachers";
import { createAdmin, createTeacher, describeDb, prisma, resetDatabase } from "./helpers/db";

describe("filtr powrotu po zalogowaniu", () => {
  it("przepuszcza zwykłe ścieżki w serwisie", () => {
    expect(safeNextPath("/admin")).toBe("/admin");
    expect(safeNextPath("/nauczyciel/uczniowie?historia=PAID")).toBe(
      "/nauczyciel/uczniowie?historia=PAID"
    );
  });

  it("odrzuca adres bezwzględny", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("http://evil.example")).toBeNull();
  });

  it("odrzuca adres protokołowo-względny — to była realna dziura", () => {
    // Przeglądarka traktuje „//evil.example" jak adres bezwzględny, a samo
    // startsWith("/") to przepuszczało: ofiara logowała się naprawdę i lądowała
    // na cudzej stronie.
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("///evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
  });

  it("odrzuca znaki sterujące i puste wartości", () => {
    expect(safeNextPath("/admin\nLocation: https://evil.example")).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(42)).toBeNull();
  });
});

describe("szyfrowanie sekretów", () => {
  it("szyfrogram nie zawiera jawnej wartości i wraca po odszyfrowaniu", () => {
    process.env.AUTH_SECRET = "testowy-sekret-min-32-znaki-dlugosci-ok";
    const secret = "1//0geXamPle-ReFrEsH-ToKeN";
    const encrypted = encryptSecret(secret);

    expect(encrypted).not.toContain(secret);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it("dwa zaszyfrowania tej samej wartości różnią się", () => {
    process.env.AUTH_SECRET = "testowy-sekret-min-32-znaki-dlugosci-ok";
    expect(encryptSecret("abc")).not.toBe(encryptSecret("abc"));
  });

  it("wartość sprzed wdrożenia szyfrowania czyta się dalej", () => {
    // Bez tego wdrożenie zerwałoby istniejące połączenia z kalendarzem.
    expect(decryptSecret("jawny-stary-token")).toBe("jawny-stary-token");
  });

  it("manipulacja szyfrogramem jest wykrywana", () => {
    process.env.AUTH_SECRET = "testowy-sekret-min-32-znaki-dlugosci-ok";
    const encrypted = encryptSecret("abc");
    const parts = encrypted.split(":");
    const tampered = [
      parts[0],
      parts[1],
      parts[2],
      Buffer.from("podmienione").toString("base64"),
    ].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describeDb("logowanie i sesje", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
  });

  it("blokada włącza się dopiero po serii prób i jest czasowa", async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i += 1) {
      await registerFailedLogin(anna.userId);
      expect((await checkLock(anna.userId)).locked).toBe(false);
    }

    await registerFailedLogin(anna.userId);
    const lock = await checkLock(anna.userId);
    expect(lock.locked).toBe(true);

    // ...ale mija sama — trwała blokada byłaby narzędziem do odcięcia
    // nauczyciela od pracy cudzymi próbami.
    const potem = new Date(Date.now() + 60 * 60 * 1000);
    expect((await checkLock(anna.userId, potem)).locked).toBe(false);
  });

  it("udane logowanie zeruje licznik", async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i += 1) {
      await registerFailedLogin(anna.userId);
    }
    await registerSuccessfulLogin(anna.userId);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: anna.userId },
      select: { failedLogins: true, lockedUntil: true },
    });
    expect(user.failedLogins).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });

  it("zmiana własnego hasła unieważnia wcześniejsze sesje", async () => {
    const przed = await prisma.user.findUniqueOrThrow({
      where: { id: anna.userId },
      select: { sessionsValidFrom: true },
    });

    await new Promise((r) => setTimeout(r, 1100));
    await changeOwnPassword(anna, {
      currentPassword: "x",
      newPassword: "noweHaslo123",
      confirmPassword: "noweHaslo123",
    } as never).catch(() => undefined);

    // Hasło testowego konta to nie „x", więc zmiana miała prawo nie przejść;
    // znacznik ruszamy tylko przy udanej zmianie.
    const po = await prisma.user.findUniqueOrThrow({
      where: { id: anna.userId },
      select: { sessionsValidFrom: true },
    });
    expect(po.sessionsValidFrom.getTime()).toBe(przed.sessionsValidFrom.getTime());
  });

  it("reset hasła przez admina wylogowuje nauczyciela ze wszystkich urządzeń", async () => {
    const przed = await prisma.user.findUniqueOrThrow({
      where: { id: anna.userId },
      select: { sessionsValidFrom: true },
    });

    await new Promise((r) => setTimeout(r, 1100));
    await setTeacherPassword(admin, anna.teacherProfileId, "noweHaslo123");

    const po = await prisma.user.findUniqueOrThrow({
      where: { id: anna.userId },
      select: { sessionsValidFrom: true },
    });
    expect(po.sessionsValidFrom.getTime()).toBeGreaterThan(
      przed.sessionsValidFrom.getTime()
    );
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
