/**
 * Ewidencja przychodu — podkład pod PIT-36.
 *
 * ŚWIADOMIE nie ma tu ani jednej stawki podatkowej, kwoty wolnej ani
 * wyliczonego podatku. Moduł podaje wyłącznie to, co wynika z dokumentów:
 * datę, dokument, kwotę i sumę narastającą. Jak z tego powstanie zeznanie,
 * rozstrzyga księgowy — ta sama zasada, co w module NDG.
 *
 * Podstawę (przychód należny z rachunków albo kasowy z wpłat) bierzemy
 * z ustawień NDG, żeby ewidencja i pas ostrzegawczy limitu nigdy nie liczyły
 * czegoś innego.
 */
import type { NdgRevenueBasis } from "@prisma/client";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/auth";
import { toAmount } from "@/lib/money";
import { formatMonthLabel, monthRange, toWallClockInput } from "@/lib/datetime";
import { getNdgSettings } from "@/lib/services/ndg";
import { getBillingSettings } from "@/lib/services/billing";

const ADMIN_ONLY = "Ewidencja przychodu jest dostępna tylko dla administratora.";

export type EvidenceRow = {
  /** Liczba porządkowa w obrębie roku — ewidencja ma być ciągła. */
  index: number;
  date: string;
  /** Numer rachunku albo opis wpłaty. */
  document: string;
  studentName: string;
  amount: number;
  /** Suma od początku roku włącznie z tym wierszem. */
  cumulative: number;
};

export type EvidenceMonth = {
  monthKey: string;
  label: string;
  rows: EvidenceRow[];
  total: number;
  /** Suma od początku roku na koniec tego miesiąca. */
  cumulative: number;
};

export type EvidenceReport = {
  year: number;
  basis: NdgRevenueBasis;
  basisLabel: string;
  months: EvidenceMonth[];
  total: number;
  rowCount: number;
  seller: {
    name: string;
    address: string;
    contact: string;
    taxNote: string;
  };
  generatedAt: string;
};

export const BASIS_LABEL: Record<NdgRevenueBasis, string> = {
  INVOICED: "przychód należny — z wystawionych rachunków",
  PAID: "przychód kasowy — z otrzymanych wpłat",
};

function round(value: number): number {
  return Number(value.toFixed(2));
}

function yearRange(year: number): { from: Date; to: Date } {
  return {
    from: monthRange(`${year}-01`).from,
    to: monthRange(`${year + 1}-01`).from,
  };
}

type RawEntry = { date: Date; document: string; studentName: string; amount: number };

async function loadEntries(
  year: number,
  basis: NdgRevenueBasis
): Promise<RawEntry[]> {
  const { from, to } = yearRange(year);

  if (basis === "PAID") {
    const payments = await prisma.payment.findMany({
      where: { paidAt: { gte: from, lt: to } },
      select: {
        paidAt: true,
        amount: true,
        method: true,
        student: { select: { firstName: true, lastName: true } },
        invoice: { select: { number: true } },
      },
      orderBy: { paidAt: "asc" },
    });
    return payments.map((payment) => ({
      date: payment.paidAt,
      document: payment.invoice
        ? `wpłata do ${payment.invoice.number}`
        : "wpłata bez rachunku",
      studentName: `${payment.student.firstName} ${payment.student.lastName}`,
      amount: toAmount(payment.amount),
    }));
  }

  const invoices = await prisma.invoice.findMany({
    where: { issuedAt: { gte: from, lt: to }, status: { not: "CANCELLED" } },
    select: {
      issuedAt: true,
      number: true,
      totalAmount: true,
      student: { select: { firstName: true, lastName: true } },
    },
    orderBy: { issuedAt: "asc" },
  });
  return invoices.map((invoice) => ({
    date: invoice.issuedAt,
    document: `rachunek ${invoice.number}`,
    studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
    amount: toAmount(invoice.totalAmount),
  }));
}

export async function getEvidenceReport(
  actor: Actor,
  year: number
): Promise<EvidenceReport> {
  assertAdmin(actor, ADMIN_ONLY);

  const [settings, billing] = await Promise.all([
    getNdgSettings(actor),
    getBillingSettings(actor),
  ]);
  const basis = settings.revenueBasis;
  const entries = await loadEntries(year, basis);

  // Numeracja i suma narastająca idą przez cały rok, nie per miesiąc —
  // ewidencja ma być jednym ciągiem.
  let index = 0;
  let cumulative = 0;
  const byMonth = new Map<string, EvidenceRow[]>();

  for (const entry of entries) {
    index += 1;
    cumulative = round(cumulative + entry.amount);
    const monthKey = toWallClockInput(entry.date).slice(0, 7);
    const row: EvidenceRow = {
      index,
      date: toWallClockInput(entry.date).slice(0, 10),
      document: entry.document,
      studentName: entry.studentName,
      amount: entry.amount,
      cumulative,
    };
    (byMonth.get(monthKey) ?? byMonth.set(monthKey, []).get(monthKey)!).push(row);
  }

  const months: EvidenceMonth[] = [];
  let runningTotal = 0;
  for (let month = 1; month <= 12; month += 1) {
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    const rows = byMonth.get(monthKey) ?? [];
    const total = round(rows.reduce((sum, row) => sum + row.amount, 0));
    runningTotal = round(runningTotal + total);
    months.push({
      monthKey,
      label: formatMonthLabel(monthKey),
      rows,
      total,
      cumulative: runningTotal,
    });
  }

  return {
    year,
    basis,
    basisLabel: BASIS_LABEL[basis],
    months,
    total: runningTotal,
    rowCount: index,
    seller: {
      name: billing.sellerName,
      address: billing.sellerAddress,
      contact: billing.sellerContact,
      taxNote: billing.sellerTaxNote,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * CSV dla Excela w polskiej lokalizacji: separator średnik, przecinek
 * dziesiętny i BOM, inaczej arkusz rozjeżdża kolumny i łamie polskie znaki.
 */
export function evidenceToCsv(report: EvidenceReport): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const money = (value: number) => value.toFixed(2).replace(".", ",");

  const lines: string[] = [];
  lines.push(escape(`Ewidencja przychodu ${report.year}`));
  lines.push(escape(`Podstawa: ${report.basisLabel}`));
  if (report.seller.name) lines.push(escape(report.seller.name));
  if (report.seller.taxNote) lines.push(escape(report.seller.taxNote));
  lines.push("");
  lines.push(
    ["Lp.", "Data", "Dokument", "Uczeń", "Kwota", "Narastająco"]
      .map(escape)
      .join(";")
  );

  for (const month of report.months) {
    for (const row of month.rows) {
      lines.push(
        [
          String(row.index),
          row.date,
          row.document,
          row.studentName,
          money(row.amount),
          money(row.cumulative),
        ]
          .map(escape)
          .join(";")
      );
    }
  }

  lines.push("");
  lines.push([escape("Razem"), "", "", "", escape(money(report.total)), ""].join(";"));
  lines.push("");
  lines.push(escape("Zestawienie pomocnicze — nie stanowi doradztwa podatkowego."));

  return `﻿${lines.join("\r\n")}\r\n`;
}
