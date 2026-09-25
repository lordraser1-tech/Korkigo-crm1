/**
 * Regulamin — wszystkie progi i procenty w JEDNYM miejscu.
 *
 * Gdy regulamin się zmieni, poprawiasz wyłącznie ten plik; reszta kodu pyta
 * o wynik, a nie o liczby. Nie rozsiewaj tych wartości po serwisach ani po UI.
 */

/** Ile uczeń płaci za odwołaną lekcję, zależnie od wyprzedzenia zgłoszenia. */
export const CANCELLATION_TIERS = [
  { minHoursBefore: 24, chargePercent: 0 },
  { minHoursBefore: 12, chargePercent: 50 },
  { minHoursBefore: 0, chargePercent: 100 },
] as const;

/** Nieobecność bez odwołania — zawsze pełna cena, bez progów czasowych. */
export const NO_SHOW_CHARGE_PERCENT = 100;

/**
 * Czy nauczycielowi należy się wypłata za lekcję, która się nie odbyła.
 * Za nieobecność ucznia — tak (nauczyciel czekał). Za odwołanie — nie,
 * nawet jeśli uczeń zapłacił karę.
 */
export const PAY_TEACHER_FOR_NO_SHOW = true;
export const PAY_TEACHER_FOR_CANCELLED = false;

const HOUR_MS = 60 * 60 * 1000;

/** Procent ceny za odwołanie zgłoszone o danej porze. */
export function cancellationChargePercent(
  scheduledAt: Date,
  reportedAt: Date
): number {
  const hoursBefore = (scheduledAt.getTime() - reportedAt.getTime()) / HOUR_MS;
  for (const tier of CANCELLATION_TIERS) {
    if (hoursBefore >= tier.minHoursBefore) return tier.chargePercent;
  }
  // Zgłoszenie po terminie lekcji traktujemy jak najostrzejszy próg.
  return CANCELLATION_TIERS[CANCELLATION_TIERS.length - 1].chargePercent;
}

/** Kwota do naliczenia za odwołanie — zaokrąglona do groszy. */
export function cancellationCharge(
  price: number,
  scheduledAt: Date,
  reportedAt: Date
): number {
  const percent = cancellationChargePercent(scheduledAt, reportedAt);
  return Number(((price * percent) / 100).toFixed(2));
}

/** Opis progu do pokazania w interfejsie. */
export function cancellationPolicyLabel(
  scheduledAt: Date,
  reportedAt: Date
): string {
  const percent = cancellationChargePercent(scheduledAt, reportedAt);
  const hours = Math.floor(
    (scheduledAt.getTime() - reportedAt.getTime()) / HOUR_MS
  );
  if (hours < 0) return `zgłoszone po terminie lekcji — ${percent}% ceny`;
  return `zgłoszone ${hours} h przed lekcją — ${percent}% ceny`;
}

/** Ile uczeń płaci za lekcję o danym statusie. */
export function lessonChargeAmount(lesson: {
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  price: number;
  cancellationAmount: number | null;
}): number {
  switch (lesson.status) {
    case "COMPLETED":
      return lesson.price;
    case "NO_SHOW":
      return Number(((lesson.price * NO_SHOW_CHARGE_PERCENT) / 100).toFixed(2));
    case "CANCELLED":
      // Kwota jest wyliczana przy odwoływaniu i zapisywana przy lekcji.
      return lesson.cancellationAmount ?? 0;
    default:
      return 0;
  }
}

/** Czy lekcja wchodzi do rozliczenia z nauczycielem. */
export function countsTowardsTeacherPayout(status: string): boolean {
  if (status === "COMPLETED") return true;
  if (status === "NO_SHOW") return PAY_TEACHER_FOR_NO_SHOW;
  if (status === "CANCELLED") return PAY_TEACHER_FOR_CANCELLED;
  return false;
}
