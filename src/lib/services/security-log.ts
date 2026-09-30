/**
 * Dziennik zdarzeń bezpieczeństwa.
 *
 * Blokada konta działa po cichu, więc bez tego dziennika nie da się zauważyć,
 * że ktoś systematycznie próbuje się dostać. Czyta go wyłącznie ADMIN.
 *
 * Zapis NIGDY nie przerywa operacji, której dotyczy: nieudane logowanie ma
 * zwrócić „złe hasło", a nie 500 dlatego, że nie udało się dopisać wpisu.
 */
import type { Prisma, SecurityEventType } from "@prisma/client";
import type { Actor } from "@/lib/auth";
import { assertAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ONLY = "Dziennik bezpieczeństwa widzi tylko administrator.";

/** Po ilu dniach kasujemy wpisy — IP to dane osobowe, nie trzymamy ich bez końca. */
export const SECURITY_LOG_DAYS = 90;

export type SecurityEventInput = {
  type: SecurityEventType;
  userId?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detail?: string | null;
};

/** Obcinamy, żeby nagłówek od klienta nie rozdął bazy. */
function trim(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.slice(0, max);
}

export async function recordSecurityEvent(
  input: SecurityEventInput
): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        type: input.type,
        userId: input.userId ?? null,
        email: trim(input.email, 200),
        ip: trim(input.ip, 60),
        userAgent: trim(input.userAgent, 300),
        detail: trim(input.detail, 300),
      },
    });
  } catch {
    // Dziennik nie może wywrócić operacji, którą opisuje.
  }
}

export type SecurityEventDto = {
  id: string;
  type: SecurityEventType;
  email: string | null;
  ip: string | null;
  userAgent: string | null;
  detail: string | null;
  createdAt: string;
};

export type SecurityLogFilters = {
  type?: SecurityEventType | null;
  /** Tylko zdarzenia podejrzane — do szybkiego rzutu oka. */
  onlyFailures?: boolean;
  limit?: number;
};

const FAILURE_TYPES: SecurityEventType[] = [
  "LOGIN_FAILED",
  "LOGIN_BLOCKED",
  "ACCOUNT_LOCKED",
];

export async function listSecurityEvents(
  actor: Actor,
  filters: SecurityLogFilters = {}
): Promise<SecurityEventDto[]> {
  assertAdmin(actor, ADMIN_ONLY);

  const where: Prisma.SecurityEventWhereInput = {};
  if (filters.type) where.type = filters.type;
  else if (filters.onlyFailures) where.type = { in: FAILURE_TYPES };

  const rows = await prisma.securityEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.limit ?? 100, 500),
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    email: row.email,
    ip: row.ip,
    userAgent: row.userAgent,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  }));
}

export type SecuritySummary = {
  failedLast24h: number;
  lockedLast24h: number;
  successfulLast24h: number;
  /** Adresy z największą liczbą nieudanych prób — tu widać atak. */
  topOffenders: Array<{ ip: string; attempts: number }>;
  lockedAccounts: Array<{ email: string; until: string }>;
};

export async function getSecuritySummary(
  actor: Actor,
  now = new Date()
): Promise<SecuritySummary> {
  assertAdmin(actor, ADMIN_ONLY);
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [failed, locked, ok, offenders, lockedUsers] = await Promise.all([
    prisma.securityEvent.count({
      where: { type: { in: ["LOGIN_FAILED", "LOGIN_BLOCKED"] }, createdAt: { gte: since } },
    }),
    prisma.securityEvent.count({
      where: { type: "ACCOUNT_LOCKED", createdAt: { gte: since } },
    }),
    prisma.securityEvent.count({
      where: { type: "LOGIN_OK", createdAt: { gte: since } },
    }),
    prisma.securityEvent.groupBy({
      by: ["ip"],
      where: {
        type: { in: ["LOGIN_FAILED", "LOGIN_BLOCKED"] },
        createdAt: { gte: since },
        ip: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
    prisma.user.findMany({
      where: { lockedUntil: { gt: now } },
      select: { email: true, lockedUntil: true },
    }),
  ]);

  return {
    failedLast24h: failed,
    lockedLast24h: locked,
    successfulLast24h: ok,
    topOffenders: offenders.map((row) => ({
      ip: row.ip ?? "nieznany",
      attempts: row._count._all,
    })),
    lockedAccounts: lockedUsers.map((user) => ({
      email: user.email,
      until: user.lockedUntil!.toISOString(),
    })),
  };
}

/** Czyszczenie starych wpisów — wołane z crona razem z resztą zadań. */
export async function pruneSecurityLog(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SECURITY_LOG_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.securityEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
