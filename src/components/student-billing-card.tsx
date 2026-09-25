import Link from "next/link";
import type { BillingMode } from "@prisma/client";
import type {
  InvoiceDto,
  PaymentDto,
  StudentBalanceDto,
} from "@/lib/services/billing";
import {
  createMonthlyInvoiceAction,
  createPackageInvoiceAction,
} from "@/app/actions/billing";
import { ActionForm, Field, SelectField } from "@/components/forms";
import { BILLING_MODE_LABEL, InvoiceStateBadge } from "@/components/billing";
import { currentMonthKey, formatDate } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";
import { Badge } from "@/components/ui";

/** Sekcja rozliczeń w karcie ucznia — tylko panel administratora. */
export function StudentBillingCard({
  studentId,
  billingMode,
  billing,
  levels = [],
}: {
  studentId: string;
  billingMode: BillingMode;
  /** Przedmioty/poziomy do rachunku za pakiet. */
  levels?: Array<{ id: string; label: string }>;
  billing: {
    balance: StudentBalanceDto;
    invoices: InvoiceDto[];
    payments: PaymentDto[];
    unbilledLessons: number;
  };
}) {
  const { balance, invoices, payments, unbilledLessons } = billing;

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Rozliczenia</h2>
        <Badge tone="blue">{BILLING_MODE_LABEL[billingMode]}</Badge>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Naliczono</p>
          <p className="text-lg font-semibold text-slate-900">
            {formatPLN(balance.charged)}
          </p>
          <p className="text-xs text-slate-500">
            rachunki: {formatPLN(balance.invoiced)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Wpłacono</p>
          <p className="text-lg font-semibold text-slate-900">
            {formatPLN(balance.paid)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Saldo</p>
          <p
            className={`text-lg font-semibold ${
              balance.balance < 0 ? "text-red-700" : "text-slate-900"
            }`}
          >
            {formatPLN(balance.balance)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Lekcje bez opłaty
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {balance.unpaidLessons}
          </p>
          <p className="text-xs text-slate-500">
            bez rachunku: {unbilledLessons}
          </p>
        </div>
      </div>

      {balance.overdueAmount > 0 ? (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Zaległość {formatPLN(balance.overdueAmount)}
          {balance.oldestDueAt
            ? ` — najstarszy termin minął ${formatDate(new Date(balance.oldestDueAt))}.`
            : "."}
        </p>
      ) : null}

      <div className="mb-5 rounded-lg bg-slate-50 p-4">
        {billingMode === "PREPAID" ? (
          <ActionForm
            action={createPackageInvoiceAction}
            submitLabel="Wystaw rachunek za pakiet"
            className="space-y-3"
          >
            <input type="hidden" name="studentId" value={studentId} />
            <SelectField
              label="Przedmiot i poziom"
              name="subjectLevelId"
              options={[
                { value: "", label: "— cena podana ręcznie —" },
                ...levels.map((level) => ({
                  value: level.id,
                  label: level.label,
                })),
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Liczba lekcji"
                name="quantity"
                type="number"
                min={1}
                max={200}
                defaultValue={10}
                required
              />
              <Field
                label="Cena za lekcję"
                name="unitPrice"
                inputMode="decimal"
                hint="Puste = stawka ucznia."
              />
            </div>
          </ActionForm>
        ) : (
          <ActionForm
            action={createMonthlyInvoiceAction}
            submitLabel="Wystaw rachunek za miesiąc"
            className="space-y-3"
          >
            <input type="hidden" name="studentId" value={studentId} />
            <Field
              label="Miesiąc"
              name="month"
              type="month"
              defaultValue={currentMonthKey()}
              required
            />
          </ActionForm>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            Rachunki ({invoices.length})
          </h3>
          {invoices.length === 0 ? (
            <p className="text-sm text-slate-500">Brak rachunków.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {invoices.slice(0, 8).map((invoice) => (
                <li
                  key={invoice.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <Link
                    href={`/admin/rachunki/${invoice.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {invoice.number}
                  </Link>
                  <span className="text-slate-600">
                    {formatPLN(invoice.totalAmount)}
                  </span>
                  <InvoiceStateBadge state={invoice.paymentState} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            Wpłaty ({payments.length})
          </h3>
          {payments.length === 0 ? (
            <p className="text-sm text-slate-500">Brak wpłat.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {payments.slice(0, 8).map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                >
                  <span className="text-slate-600">
                    {formatDate(new Date(payment.paidAt))}
                    {payment.invoiceNumber ? ` · ${payment.invoiceNumber}` : " · przedpłata"}
                  </span>
                  <span className="font-medium text-slate-900">
                    {formatPLN(payment.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
