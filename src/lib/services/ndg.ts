/**
 * Moduł działalności nierejestrowanej (NDG): pilnowanie limitu przychodu oraz
 * statystyki finansowe — miesiąc, kwartał, rok i rozbicie na nauczycieli.
 *
 * ZASTRZEŻENIE: aplikacja nie zna przepisów podatkowych i nie jest doradcą.
 * Kwoty limitu wprowadza administrator (z historią obowiązywania), a sposób
 * liczenia przychodu (należny / kasowy) jest ustawieniem. Reguły potwierdź
 * z księgowym przed użyciem w rozliczeniach.
 *
 * Cały moduł jest dostępny wyłącznie dla roli ADMIN.
 */
import { Prisma, type NdgPeriodMode, type NdgRevenueBasis } from "@prisma/client";
import { z } from "zod";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  formatDate,
  formatMonthLabel,
  monthRange,
  toWallClockInput,
  wallClockToUtc,
} from "@/lib/datetime";
import { toAmount } from "@/lib/money";
import { ndgLimitSchema, ndgSettingsSchema } from "@/lib/validation";

const ADMIN_ONLY = "Moduł NDG jest dostępny tylko dla administratora.";
const DAY_MS = 24 * 60 * 60 * 1000;

function assertAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN") throw new ForbiddenError(ADMIN_ONLY);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

// ---------- OKRESY ----------

export type NdgScope = "MONTH" | "QUARTER" | "YEAR";

const ROMAN = ["I", "II", "III", "IV"];

export function quarterOfMonth(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

export function quarterMonths(year: number, quarter: number): string[] {
  const first = (quarter - 1) * 3 + 1;
  return [0, 1, 2].map(
    (offset) => `${year}-${String(first + offset).padStart(2, "0")}`
  );
}

export function quarterLabel(year: number, quarter: number): string {
  return `${ROMAN[quarter - 1]} kwartał ${year}`;
}

function monthsOfYear(year: number): string[] {
  return Array.from(
    { length: 12 },
    (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`
  );
}

/** Zakres [od, do) dla dowolnego zestawu miesięcy (miesiące muszą być kolejne). */
function rangeOfMonths(months: string[]): { from: Date; to: Date } {
  return {
    from: monthRange(months[0]).from,
    to: monthRange(months[months.length - 1]).to,
  };
}

// ---------- USTAWIENIA ----------

export type NdgSettingsDto = {
  enabled: boolean;
  mode: NdgPeriodMode;
  revenueBasis: NdgRevenueBasis;
  warnThresholdPercent: number;
  businessStartedAt: string | null;
  note: string;
};

export async function getNdgSettings(actor: Actor): Promise<NdgSettingsDto> {
  assertAdmin(actor);
  const row = await prisma.ndgSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  return {
    enabled: row.enabled,
    mode: row.mode,
    revenueBasis: row.revenueBasis,
    warnThresholdPercent: row.warnThresholdPercent,
    businessStartedAt: row.businessStartedAt
      ? toWallClockInput(row.businessStartedAt).slice(0, 10)
      : null,
    note: row.note,
  };
}

export async function updateNdgSettings(
  actor: Actor,
  input: z.input<typeof ndgSettingsSchema>
): Promise<NdgSettingsDto> {
  assertAdmin(actor);
  const data = ndgSettingsSchema.parse(input);
  const payload = {
    enabled: data.enabled,
    mode: data.mode,
    revenueBasis: data.revenueBasis,
    warnThresholdPercent: data.warnThresholdPercent,
    businessStartedAt: data.businessStartedAt
      ? wallClockToUtc(`${data.businessStartedAt}T12:00`)
      : null,
    note: data.note ?? "",
  };
  await prisma.ndgSettings.upsert({
    where: { id: "singleton" },
    update: payload,
    create: { id: "singleton", ...payload },
  });
  return getNdgSettings(actor);
}

// ---------- LIMITY ----------

export type NdgLimitDto = {
  id: string;
  validFrom: string;
  validFromMonth: string;
  amount: number;
  note: string;
};

export async function listNdgLimits(actor: Actor): Promise<NdgLimitDto[]> {
  assertAdmin(actor);
  const rows = await prisma.ndgMonthlyLimit.findMany({
    orderBy: { validFrom: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    validFrom: row.validFrom.toISOString(),
    validFromMonth: toWallClockInput(row.validFrom).slice(0, 7),
    amount: toAmount(row.amount),
    note: row.note,
  }));
}

export async function createNdgLimit(
  actor: Actor,
  input: z.input<typeof ndgLimitSchema>
): Promise<NdgLimitDto> {
  assertAdmin(actor);
  const data = ndgLimitSchema.parse(input);
  const validFrom = monthRange(data.validFrom).from;

  const existing = await prisma.ndgMonthlyLimit.findUnique({
    where: { validFrom },
    select: { id: true },
  });
  if (existing) {
    throw new ValidationError(
      `Limit obowiązujący od ${formatMonthLabel(data.validFrom)} już istnieje — usuń go albo wybierz inny miesiąc.`
    );
  }

  const created = await prisma.ndgMonthlyLimit.create({
    data: {
      validFrom,
      amount: new Prisma.Decimal(data.amount.toFixed(2)),
      note: data.note ?? "",
    },
  });
  return {
    id: created.id,
    validFrom: created.validFrom.toISOString(),
    validFromMonth: toWallClockInput(created.validFrom).slice(0, 7),
    amount: toAmount(created.amount),
    note: created.note,
  };
}

export async function deleteNdgLimit(actor: Actor, id: string): Promise<void> {
  assertAdmin(actor);
  const result = await prisma.ndgMonthlyLimit.deleteMany({ where: { id } });
  if (result.count === 0) throw new NotFoundError("Nie znaleziono limitu.");
}

/** Limit obowiązujący w danym miesiącu: ostatni wpis z datą <= początek miesiąca. */
function limitForMonth(
  limits: Array<{ validFrom: Date; amount: number }>,
  monthKey: string
): number | null {
  const monthStart = monthRange(monthKey).from;
  let found: number | null = null;
  for (const limit of limits) {
    if (limit.validFrom <= monthStart) found = limit.amount;
  }
  return found;
}

// ---------- PRZYCHÓD ----------

/** Przychód w rozbiciu na miesiące — według wybranej podstawy. */
async function revenueByMonth(
  months: string[],
  basis: NdgRevenueBasis
): Promise<Map<string, number>> {
  const { from, to } = rangeOfMonths(months);
  const buckets = new Map<string, number>(months.map((month) => [month, 0]));

  const add = (date: Date, amount: number) => {
    const monthKey = toWallClockInput(date).slice(0, 7);
    if (!buckets.has(monthKey)) return;
    buckets.set(monthKey, round((buckets.get(monthKey) ?? 0) + amount));
  };

  if (basis === "PAID") {
    const payments = await prisma.payment.findMany({
      where: { paidAt: { gte: from, lt: to } },
      select: { paidAt: true, amount: true },
    });
    for (const payment of payments) add(payment.paidAt, toAmount(payment.amount));
  } else {
    const invoices = await prisma.invoice.findMany({
      where: { issuedAt: { gte: from, lt: to }, status: { not: "CANCELLED" } },
      select: { issuedAt: true, totalAmount: true },
    });
    for (const invoice of invoices) {
      add(invoice.issuedAt, toAmount(invoice.totalAmount));
    }
  }

  return buckets;
}

// ---------- WYKORZYSTANIE LIMITU ----------

export type NdgStatus = "OK" | "WATCH" | "WARNING" | "EXCEEDED" | "UNKNOWN";

export type NdgMonthUsage = {
  monthKey: string;
  label: string;
  revenue: number;
  limit: number | null;
  percent: number | null;
};

export type NdgProjection = {
  isCurrent: boolean;
  elapsedDays: number;
  totalDays: number;
  dailyAverage: number;
  projectedRevenue: number;
  projectedPercent: number | null;
  /** Data, w której przy obecnym tempie limit zostanie wyczerpany. */
  exhaustionDate: string | null;
};

export type NdgPeriodUsage = {
  periodKey: string;
  label: string;
  from: string;
  to: string;
  revenue: number;
  limit: number | null;
  remaining: number | null;
  percent: number | null;
  status: NdgStatus;
  months: NdgMonthUsage[];
  projection: NdgProjection | null;
};

function resolveStatus(
  percent: number | null,
  warnThresholdPercent: number
): NdgStatus {
  if (percent === null) return "UNKNOWN";
  if (percent >= 100) return "EXCEEDED";
  if (percent >= warnThresholdPercent) return "WARNING";
  if (percent >= Math.min(70, Math.max(warnThresholdPercent - 10, 10))) {
    return "WATCH";
  }
  return "OK";
}

function buildPeriodUsage(
  months: string[],
  periodKey: string,
  label: string,
  revenueByMonthMap: Map<string, number>,
  limits: Array<{ validFrom: Date; amount: number }>,
  warnThresholdPercent: number,
  now: Date
): NdgPeriodUsage {
  const monthUsages: NdgMonthUsage[] = months.map((monthKey) => {
    const revenue = revenueByMonthMap.get(monthKey) ?? 0;
    const limit = limitForMonth(limits, monthKey);
    return {
      monthKey,
      label: formatMonthLabel(monthKey),
      revenue,
      limit,
      percent: limit && limit > 0 ? round((revenue / limit) * 100) : null,
    };
  });

  const revenue = round(
    monthUsages.reduce((sum, month) => sum + month.revenue, 0)
  );
  // Limit okresu to suma limitów jego miesięcy — dzięki temu zmiana kwoty
  // w trakcie kwartału liczy się poprawnie. Brak kwoty w którymkolwiek
  // miesiącu oznacza, że limitu nie znamy.
  const hasAllLimits = monthUsages.every((month) => month.limit !== null);
  const limit = hasAllLimits
    ? round(monthUsages.reduce((sum, month) => sum + (month.limit ?? 0), 0))
    : null;

  const percent = limit && limit > 0 ? round((revenue / limit) * 100) : null;
  const { from, to } = rangeOfMonths(months);

  const isCurrent = now >= from && now < to;
  const totalDays = Math.round((to.getTime() - from.getTime()) / DAY_MS);
  let projection: NdgProjection | null = null;

  if (isCurrent) {
    const elapsedDays = Math.max(
      1,
      Math.ceil((now.getTime() - from.getTime()) / DAY_MS)
    );
    const dailyAverage = round(revenue / elapsedDays);
    const projectedRevenue = round(dailyAverage * totalDays);
    let exhaustionDate: string | null = null;

    if (limit && limit > 0 && dailyAverage > 0) {
      const daysToLimit = (limit - revenue) / dailyAverage;
      if (daysToLimit <= 0) {
        exhaustionDate = now.toISOString();
      } else {
        const date = new Date(now.getTime() + daysToLimit * DAY_MS);
        if (date < to) exhaustionDate = date.toISOString();
      }
    }

    projection = {
      isCurrent,
      elapsedDays,
      totalDays,
      dailyAverage,
      projectedRevenue,
      projectedPercent:
        limit && limit > 0 ? round((projectedRevenue / limit) * 100) : null,
      exhaustionDate,
    };
  }

  return {
    periodKey,
    label,
    from: from.toISOString(),
    to: to.toISOString(),
    revenue,
    limit,
    remaining: limit === null ? null : round(limit - revenue),
    percent,
    status: resolveStatus(percent, warnThresholdPercent),
    months: monthUsages,
    projection,
  };
}

export type NdgOverview = {
  settings: NdgSettingsDto;
  year: number;
  /** Okresy roku zgodnie z trybem (kwartały albo miesiące). */
  periods: NdgPeriodUsage[];
  /** Okres wskazany w parametrach albo bieżący. */
  selected: NdgPeriodUsage;
  /** Dwanaście miesięcy roku — do wykresu. */
  monthly: NdgMonthUsage[];
  limits: NdgLimitDto[];
  hasLimits: boolean;
};

export async function getNdgOverview(
  actor: Actor,
  options: { year?: number | null; periodKey?: string | null } = {},
  now = new Date()
): Promise<NdgOverview> {
  assertAdmin(actor);

  const todayWall = toWallClockInput(now);
  const year = options.year ?? Number(todayWall.slice(0, 4));
  const settings = await getNdgSettings(actor);

  const limitRows = await prisma.ndgMonthlyLimit.findMany({
    orderBy: { validFrom: "asc" },
  });
  const limits = limitRows.map((row) => ({
    validFrom: row.validFrom,
    amount: toAmount(row.amount),
  }));

  const months = monthsOfYear(year);
  const revenue = await revenueByMonth(months, settings.revenueBasis);

  const monthly: NdgMonthUsage[] = months.map((monthKey) => {
    const limit = limitForMonth(limits, monthKey);
    const value = revenue.get(monthKey) ?? 0;
    return {
      monthKey,
      label: formatMonthLabel(monthKey),
      revenue: value,
      limit,
      percent: limit && limit > 0 ? round((value / limit) * 100) : null,
    };
  });

  const periods: NdgPeriodUsage[] =
    settings.mode === "QUARTERLY"
      ? [1, 2, 3, 4].map((quarter) =>
          buildPeriodUsage(
            quarterMonths(year, quarter),
            `${year}-Q${quarter}`,
            quarterLabel(year, quarter),
            revenue,
            limits,
            settings.warnThresholdPercent,
            now
          )
        )
      : months.map((monthKey) =>
          buildPeriodUsage(
            [monthKey],
            monthKey,
            formatMonthLabel(monthKey),
            revenue,
            limits,
            settings.warnThresholdPercent,
            now
          )
        );

  const currentKey =
    settings.mode === "QUARTERLY"
      ? `${todayWall.slice(0, 4)}-Q${quarterOfMonth(Number(todayWall.slice(5, 7)))}`
      : todayWall.slice(0, 7);

  const selected =
    periods.find((period) => period.periodKey === options.periodKey) ??
    periods.find((period) => period.periodKey === currentKey) ??
    periods[periods.length - 1];

  return {
    settings,
    year,
    periods,
    selected,
    monthly,
    limits: await listNdgLimits(actor),
    hasLimits: limitRows.length > 0,
  };
}

// ---------- STATYSTYKI FINANSOWE ----------

export type TeacherStatsRow = {
  teacherId: string;
  teacherName: string;
  lessons: number;
  revenue: number;
  cost: number;
  margin: number;
};

export type FinancialStats = {
  scope: NdgScope;
  periodKey: string;
  label: string;
  from: string;
  to: string;
  revenueInvoiced: number;
  revenuePaid: number;
  cost: number;
  margin: number;
  lessons: number;
  activeStudents: number;
  invoices: number;
  perTeacher: TeacherStatsRow[];
};

function resolveScopeMonths(options: {
  scope: NdgScope;
  year: number;
  quarter?: number | null;
  month?: string | null;
}): { months: string[]; periodKey: string; label: string } {
  if (options.scope === "MONTH") {
    const monthKey =
      options.month ?? `${options.year}-01`;
    return {
      months: [monthKey],
      periodKey: monthKey,
      label: formatMonthLabel(monthKey),
    };
  }
  if (options.scope === "QUARTER") {
    const quarter = options.quarter ?? 1;
    return {
      months: quarterMonths(options.year, quarter),
      periodKey: `${options.year}-Q${quarter}`,
      label: quarterLabel(options.year, quarter),
    };
  }
  return {
    months: monthsOfYear(options.year),
    periodKey: String(options.year),
    label: `Rok ${options.year}`,
  };
}

/**
 * Statystyki finansowe okresu. Działają niezależnie od tego, czy pilnowanie
 * limitu NDG jest włączone — po przejściu na działalność rejestrowaną moduł
 * zostaje właśnie w tej roli.
 *
 * Przychód liczymy z rachunków (należny) i z wpłat (kasowo), koszt to wypłaty
 * nauczycieli za lekcje zrealizowane. Przychód przypisujemy nauczycielowi przez
 * pozycje rachunku powiązane z lekcją; pozycje pakietowe trafiają do nauczyciela
 * przypisanego uczniowi.
 */
export async function getFinancialStats(
  actor: Actor,
  options: {
    scope: NdgScope;
    year: number;
    quarter?: number | null;
    month?: string | null;
  }
): Promise<FinancialStats> {
  assertAdmin(actor);
  const { months, periodKey, label } = resolveScopeMonths(options);
  const { from, to } = rangeOfMonths(months);

  const [invoices, payments, lessons, activeStudents] = await Promise.all([
    prisma.invoice.findMany({
      where: { issuedAt: { gte: from, lt: to }, status: { not: "CANCELLED" } },
      select: {
        totalAmount: true,
        student: { select: { teacherId: true } },
        items: {
          select: {
            amount: true,
            lesson: { select: { teacherId: true } },
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: { paidAt: { gte: from, lt: to } },
      select: { amount: true },
    }),
    prisma.lesson.findMany({
      where: { status: "COMPLETED", scheduledAt: { gte: from, lt: to } },
      select: {
        teacherId: true,
        teacher: {
          select: { firstName: true, lastName: true, ratePerLesson: true },
        },
      },
    }),
    prisma.student.count({ where: { status: "ACTIVE" } }),
  ]);

  const rows = new Map<string, TeacherStatsRow>();
  const ensureRow = (teacherId: string, name?: string): TeacherStatsRow => {
    const existing = rows.get(teacherId);
    if (existing) {
      if (name && existing.teacherName === "—") existing.teacherName = name;
      return existing;
    }
    const created: TeacherStatsRow = {
      teacherId,
      teacherName: name ?? "—",
      lessons: 0,
      revenue: 0,
      cost: 0,
      margin: 0,
    };
    rows.set(teacherId, created);
    return created;
  };

  let revenueInvoiced = 0;
  for (const invoice of invoices) {
    revenueInvoiced += toAmount(invoice.totalAmount);
    for (const item of invoice.items) {
      const teacherId = item.lesson?.teacherId ?? invoice.student.teacherId;
      if (!teacherId) continue;
      const row = ensureRow(teacherId);
      row.revenue = round(row.revenue + toAmount(item.amount));
    }
  }

  let cost = 0;
  for (const lesson of lessons) {
    const rate = toAmount(lesson.teacher.ratePerLesson);
    cost += rate;
    const row = ensureRow(
      lesson.teacherId,
      `${lesson.teacher.firstName} ${lesson.teacher.lastName}`
    );
    row.lessons += 1;
    row.cost = round(row.cost + rate);
  }

  // Nauczyciele, którzy pojawili się tylko po stronie przychodu, też potrzebują nazwy.
  const missingNames = [...rows.values()].filter((row) => row.teacherName === "—");
  if (missingNames.length > 0) {
    const profiles = await prisma.teacherProfile.findMany({
      where: { id: { in: missingNames.map((row) => row.teacherId) } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const profile of profiles) {
      const row = rows.get(profile.id);
      if (row) row.teacherName = `${profile.firstName} ${profile.lastName}`;
    }
  }

  for (const row of rows.values()) {
    row.margin = round(row.revenue - row.cost);
  }

  const revenuePaid = round(
    payments.reduce((sum, payment) => sum + toAmount(payment.amount), 0)
  );

  return {
    scope: options.scope,
    periodKey,
    label,
    from: from.toISOString(),
    to: to.toISOString(),
    revenueInvoiced: round(revenueInvoiced),
    revenuePaid,
    cost: round(cost),
    margin: round(revenueInvoiced - cost),
    lessons: lessons.length,
    activeStudents,
    invoices: invoices.length,
    perTeacher: [...rows.values()].sort((a, b) => b.revenue - a.revenue),
  };
}

export function formatPeriodRange(period: NdgPeriodUsage): string {
  return `${formatDate(new Date(period.from))} – ${formatDate(
    new Date(new Date(period.to).getTime() - DAY_MS)
  )}`;
}
