import { Prisma } from "@prisma/client";

/** Decimal z Prismy -> liczba w złotych (kwoty w tej aplikacji są małe). */
export function toAmount(value: Prisma.Decimal | number | null): number {
  if (value === null) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

export function formatPLN(value: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
  }).format(value);
}
