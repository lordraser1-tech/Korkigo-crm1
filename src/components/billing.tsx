import type { BillingMode, PaymentMethod } from "@prisma/client";
import type {
  InvoicePaymentState,
  LessonPaymentState,
  PaymentFlag,
} from "@/lib/services/billing";
import { Badge } from "@/components/ui";

export const BILLING_MODE_LABEL: Record<BillingMode, string> = {
  POSTPAID: "Miesięcznie z dołu",
  PER_LESSON: "Po każdej lekcji",
  PREPAID: "Pakiet z góry",
};

export const BILLING_MODE_OPTIONS = (
  Object.keys(BILLING_MODE_LABEL) as BillingMode[]
).map((value) => ({ value, label: BILLING_MODE_LABEL[value] }));

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  TRANSFER: "Przelew",
  CASH: "Gotówka",
  BLIK: "BLIK",
  OTHER: "Inna",
};

export const PAYMENT_METHOD_OPTIONS = (
  Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]
).map((value) => ({ value, label: PAYMENT_METHOD_LABEL[value] }));

const INVOICE_STATE_LABEL: Record<InvoicePaymentState, string> = {
  PAID: "Opłacony",
  PARTIAL: "Częściowo",
  UNPAID: "Nieopłacony",
  OVERDUE: "Po terminie",
  CANCELLED: "Anulowany",
};

export function InvoiceStateBadge({ state }: { state: InvoicePaymentState }) {
  const tone = {
    PAID: "green",
    PARTIAL: "amber",
    UNPAID: "blue",
    OVERDUE: "red",
    CANCELLED: "slate",
  }[state] as "green" | "amber" | "blue" | "red" | "slate";
  return <Badge tone={tone}>{INVOICE_STATE_LABEL[state]}</Badge>;
}

/**
 * Widoczne również dla nauczyciela — celowo bez kwoty, daty i numeru rachunku.
 */
export function PaymentFlagBadge({ flag }: { flag: PaymentFlag | null }) {
  if (!flag) return null;
  return flag === "OVERDUE" ? (
    <Badge tone="red">Zaległość</Badge>
  ) : (
    <Badge tone="green">Rozliczenia OK</Badge>
  );
}

const LESSON_PAYMENT_LABEL: Record<LessonPaymentState, string> = {
  PAID: "Opłacona",
  UNPAID: "Do zapłaty",
  OVERDUE: "Po terminie",
  NOT_INVOICED: "Bez rachunku",
};

/**
 * Status płatności pojedynczej lekcji. Widoczny także dla nauczyciela —
 * jak flaga przy uczniu, niesie tylko informację „zapłacone / nie”, bez kwot.
 */
export function LessonPaymentBadge({
  payment,
}: {
  payment: { state: LessonPaymentState; fromPackage: boolean };
}) {
  const tone = {
    PAID: "green",
    UNPAID: "amber",
    OVERDUE: "red",
    NOT_INVOICED: "slate",
  }[payment.state] as "green" | "amber" | "red" | "slate";

  const label =
    payment.fromPackage && payment.state === "PAID"
      ? "Z pakietu"
      : payment.fromPackage && payment.state !== "NOT_INVOICED"
        ? `Pakiet — ${LESSON_PAYMENT_LABEL[payment.state].toLowerCase()}`
        : LESSON_PAYMENT_LABEL[payment.state];

  return <Badge tone={tone}>{label}</Badge>;
}
