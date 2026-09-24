import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import {
  getBillingSettings,
  getInvoice,
  listPayments,
} from "@/lib/services/billing";
import { NotFoundError } from "@/lib/errors";
import { cancelInvoiceAction, recordPaymentAction } from "@/app/actions/billing";
import { ActionForm, Field, SelectField } from "@/components/forms";
import {
  InvoiceStateBadge,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_OPTIONS,
} from "@/components/billing";
import { PrintButton } from "@/components/print-button";
import { formatDate, toWallClockInput } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";

export default async function AdminInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { id } = await params;

  const invoice = await getInvoice(actor, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [settings, payments] = await Promise.all([
    getBillingSettings(actor),
    listPayments(actor, { studentId: invoice.studentId }),
  ]);
  const invoicePayments = payments.filter(
    (payment) => payment.invoiceId === invoice.id
  );

  const seller = invoice.sellerSnapshot || settings.sellerName;
  const period =
    invoice.periodStart && invoice.periodEnd
      ? `${formatDate(new Date(invoice.periodStart))} – ${formatDate(
          new Date(invoice.periodEnd)
        )}`
      : null;

  return (
    <>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/rachunki" className="btn-secondary">
          ← Wróć do rachunków
        </Link>
        <div className="flex items-center gap-2">
          <InvoiceStateBadge state={invoice.paymentState} />
          <PrintButton />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        {/* Dokument do druku */}
        <article className="card p-8">
          <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Rachunek nr {invoice.number}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Data wystawienia: {formatDate(new Date(invoice.issuedAt))}
              </p>
              <p className="text-sm text-slate-600">
                Termin płatności: {formatDate(new Date(invoice.dueAt))}
              </p>
              {period ? (
                <p className="text-sm text-slate-600">Okres: {period}</p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-lg font-bold tracking-tight text-brand-700">
                KorkiGO
              </p>
              <p className="text-xs text-slate-500">korepetycje z polskiego</p>
            </div>
          </header>

          <div className="mb-8 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sprzedawca
              </p>
              <p className="whitespace-pre-line text-sm text-slate-800">
                {seller || "— uzupełnij dane w Ustawieniach —"}
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Nabywca
              </p>
              <p className="whitespace-pre-line text-sm text-slate-800">
                {invoice.buyerSnapshot || invoice.studentName}
              </p>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-2">Lp.</th>
                <th className="px-3 py-2">Nazwa usługi</th>
                <th className="px-3 py-2">Ilość</th>
                <th className="px-3 py-2">Cena</th>
                <th className="px-3 py-2">Wartość</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.items.map((item, index) => (
                <tr key={item.id}>
                  <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                  <td className="px-3 py-2 text-slate-800">{item.description}</td>
                  <td className="px-3 py-2 text-slate-600">{item.quantity}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {formatPLN(item.unitPrice)}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {formatPLN(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300">
                <td colSpan={4} className="px-3 py-2 text-right font-semibold">
                  Razem do zapłaty
                </td>
                <td className="px-3 py-2 text-base font-bold text-slate-900">
                  {formatPLN(invoice.totalAmount)}
                </td>
              </tr>
              {invoice.paidAmount > 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-1 text-right text-slate-600">
                    Wpłacono
                  </td>
                  <td className="px-3 py-1 text-slate-700">
                    {formatPLN(invoice.paidAmount)}
                  </td>
                </tr>
              ) : null}
              {invoice.balance > 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-1 text-right text-slate-600">
                    Pozostało
                  </td>
                  <td className="px-3 py-1 font-semibold text-slate-900">
                    {formatPLN(invoice.balance)}
                  </td>
                </tr>
              ) : null}
            </tfoot>
          </table>

          {invoice.note ? (
            <p className="mt-6 text-sm text-slate-700">Uwagi: {invoice.note}</p>
          ) : null}

          {settings.bankAccount ? (
            <p className="mt-6 text-sm text-slate-700">
              Płatność przelewem na konto: <strong>{settings.bankAccount}</strong>
            </p>
          ) : null}

          <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
            <p>{settings.sellerTaxNote}</p>
            {settings.invoiceFooter ? <p className="mt-1">{settings.invoiceFooter}</p> : null}
            <p className="mt-6 text-slate-400">
              Rachunek wystawiony bez podpisu odbiorcy.
            </p>
          </footer>
        </article>

        <div className="no-print space-y-4">
          <div className="card p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Zapisz wpłatę
            </h2>
            {invoice.status === "CANCELLED" ? (
              <p className="text-sm text-slate-500">
                Rachunek anulowany — wpłat nie dopisujemy.
              </p>
            ) : (
              <ActionForm action={recordPaymentAction} submitLabel="Zapisz wpłatę">
                <input type="hidden" name="studentId" value={invoice.studentId} />
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <Field
                  label="Kwota"
                  name="amount"
                  inputMode="decimal"
                  defaultValue={invoice.balance > 0 ? invoice.balance.toFixed(2) : ""}
                  required
                />
                <Field
                  label="Data wpłaty"
                  name="paidAt"
                  type="date"
                  defaultValue={toWallClockInput(new Date()).slice(0, 10)}
                />
                <SelectField
                  label="Forma"
                  name="method"
                  defaultValue="TRANSFER"
                  options={PAYMENT_METHOD_OPTIONS}
                />
                <Field label="Notatka" name="note" />
              </ActionForm>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              Wpłaty do tego rachunku
            </h2>
            {invoicePayments.length === 0 ? (
              <p className="text-sm text-slate-500">Brak wpłat.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {invoicePayments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <span className="text-slate-700">
                      {formatDate(new Date(payment.paidAt))} ·{" "}
                      {PAYMENT_METHOD_LABEL[payment.method]}
                    </span>
                    <span className="font-medium text-slate-900">
                      {formatPLN(payment.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-2 text-base font-semibold text-slate-900">
              Anulowanie
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Rachunku nie usuwamy — numeracja musi zostać ciągła. Anulowanie
              zwalnia ujęte lekcje, żeby dało się wystawić poprawny dokument.
            </p>
            <ActionForm
              action={cancelInvoiceAction}
              submitLabel="Anuluj rachunek"
              className="space-y-3"
            >
              <input type="hidden" name="id" value={invoice.id} />
            </ActionForm>
          </div>
        </div>
      </div>
    </>
  );
}
