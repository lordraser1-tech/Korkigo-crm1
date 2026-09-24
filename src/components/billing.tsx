import type { BillingMode, PaymentMethod } from "@prisma/client";
import type { InvoicePaymentState, PaymentFlag } from "@/lib/services/billing";
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
