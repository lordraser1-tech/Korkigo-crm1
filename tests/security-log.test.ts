/**
 * Dziennik zdarzeń bezpieczeństwa: zakres dostępu, treść wpisów i to, że
 * zapis nigdy nie wywraca operacji, którą opisuje.
 */
import { afterAll, beforeEach, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import {
  SECURITY_LOG_DAYS,
  getSecuritySummary,
  listSecurityEvents,
  pruneSecurityLog,
  recordSecurityEvent,
} from "@/lib/services/security-log";
import {
  registerFailedLogin,
  registerSuccessfulLogin,
} from "@/lib/services/login-guard";
import { setTeacherPassword } from "@/lib/services/teachers";
import {
  createAdmin,
  createTeacher,
  describeDb,
  prisma,
  resetDatabase,
} from "./helpers/db";

describeDb("dziennik bezpieczeństwa", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
  });

  it("zapisuje zdarzenie z adresem i przeglądarką", async () => {
    await recordSecurityEvent({
      type: "LOGIN_FAILED",
      email: "kto@to.pl",
      ip: "203.0.113.7",
      userAgent: "curl/8",
    });

    const [event] = await listSecurityEvents(admin);
    expect(event.type).toBe("LOGIN_FAILED");
    expect(event.email).toBe("kto@to.pl");
    expect(event.ip).toBe("203.0.113.7");
  });

  it("nie przerywa operacji, gdy zapis się nie uda", async () => {
    // Nieistniejące konto łamie klucz obcy — a mimo to nie leci wyjątek,
    // bo nieudane logowanie ma zwrócić „złe hasło", nie 500.
    await expect(
      recordSecurityEvent({ type: "LOGIN_OK", userId: "nie-ma-takiego" })
    ).resolves.toBeUndefined();
  });

  it("przycina zbyt długie wartości od klienta", async () => {
    await recordSecurityEvent({
      type: "LOGIN_FAILED",
      userAgent: "x".repeat(5000),
    });
    const [event] = await listSecurityEvents(admin);
    expect(event.userAgent!.length).toBeLessThanOrEqual(300);
  });

  it("dziennika nie zobaczy nauczyciel", async () => {
    await expect(listSecurityEvents(anna)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getSecuritySummary(anna)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("filtr wyłuskuje same zdarzenia podejrzane", async () => {
    await recordSecurityEvent({ type: "LOGIN_OK", userId: anna.userId });
    await recordSecurityEvent({ type: "LOGIN_FAILED", email: "a@b.pl" });
    await recordSecurityEvent({ type: "ACCOUNT_LOCKED", userId: anna.userId });

    const podejrzane = await listSecurityEvents(admin, { onlyFailures: true });
    expect(podejrzane).toHaveLength(2);
    expect(podejrzane.map((e) => e.type).sort()).toEqual([
      "ACCOUNT_LOCKED",
      "LOGIN_FAILED",
    ]);
  });

  it("podsumowanie wskazuje adresy z największą liczbą prób", async () => {
    for (let i = 0; i < 5; i += 1) {
      await recordSecurityEvent({
        type: "LOGIN_FAILED",
        email: "a@b.pl",
        ip: "203.0.113.7",
      });
    }
    await recordSecurityEvent({
      type: "LOGIN_FAILED",
      email: "a@b.pl",
      ip: "198.51.100.2",
    });
    await recordSecurityEvent({ type: "LOGIN_OK", userId: anna.userId });

    const summary = await getSecuritySummary(admin);
    expect(summary.failedLast24h).toBe(6);
    expect(summary.successfulLast24h).toBe(1);
    expect(summary.topOffenders[0]).toEqual({ ip: "203.0.113.7", attempts: 5 });
  });

  it("podsumowanie pokazuje konta aktualnie zablokowane", async () => {
    for (let i = 0; i < 10; i += 1) await registerFailedLogin(anna.userId);

    const summary = await getSecuritySummary(admin);
    expect(summary.lockedAccounts).toHaveLength(1);
    expect(summary.lockedAccounts[0].email).toBe("anna@test.pl");

    await registerSuccessfulLogin(anna.userId);
    expect((await getSecuritySummary(admin)).lockedAccounts).toHaveLength(0);
  });

  it("reset hasła przez admina zostawia ślad i zdejmuje blokadę", async () => {
    for (let i = 0; i < 10; i += 1) await registerFailedLogin(anna.userId);

    await setTeacherPassword(admin, anna.teacherProfileId, "zielona-latarnia-4-kropki");

    const events = await listSecurityEvents(admin, { type: "PASSWORD_RESET" });
    expect(events).toHaveLength(1);
    expect(events[0].detail).toContain(admin.email);
    // Admin ustawiający hasło odblokowuje konto — inaczej nauczyciel dalej
    // nie mógłby wejść nowym hasłem.
    expect((await getSecuritySummary(admin)).lockedAccounts).toHaveLength(0);
  });

  it("stare wpisy kasują się, świeże zostają", async () => {
    await recordSecurityEvent({ type: "LOGIN_OK", userId: anna.userId });
    await prisma.securityEvent.create({
      data: {
        type: "LOGIN_FAILED",
        email: "stare@b.pl",
        createdAt: new Date(
          Date.now() - (SECURITY_LOG_DAYS + 1) * 24 * 60 * 60 * 1000
        ),
      },
    });

    expect(await pruneSecurityLog()).toBe(1);
    const left = await listSecurityEvents(admin);
    expect(left).toHaveLength(1);
    expect(left[0].type).toBe("LOGIN_OK");
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
