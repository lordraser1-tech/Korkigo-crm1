import Link from "next/link";
import { requirePage } from "@/lib/auth";
import {
  listInvoices,
  listUnbilledLessons,
  type InvoiceFilters,
} from "@/lib/services/billing";
import { listStudents } from "@/lib/services/students";
import {
  createLessonInvoiceAction,
  createMonthlyInvoiceAction,
  createPackageInvoiceAction,
} from "@/app/actions/billing";
import { ActionForm, Field, SelectField } from "@/components/forms";
import {
  BILLING_MODE_LABEL,
  InvoiceStateBadge,
} from "@/components/billing";
import { MonthNav } from "@/components/month-nav";
import { currentMonthKey, formatDate, formatDateTime } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; state?: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { m, state } = await searchParams;
  const monthKey = /^\d{4}-\d{2}$/.test(m ?? "") ? m! : currentMonthKey();

  const [invoices, students, unbilled] = await Promise.all([
    listInvoices(actor, {
      month: monthKey,
      state: (state as InvoiceFilters["state"]) || null,
    }),
    listStudents(actor),
    listUnbilledLessons(actor),
  ]);

  const billable = students.filter((student) => student.status !== "ENDED");
  const monthlyStudents = billable.filter(
    (student) => student.billingMode !== "PREPAID"
  );
  const prepaidStudents = billable.filter(
    (student) => student.billingMode === "PREPAID"
  );
  const perLessonUnbilled = unbilled.filter(
    (lesson) => lesson.billingMode !== "PREPAID"
  );

  return (
    <>
      <PageHeader
        title="Rachunki"
        description="Numeracja nadawana automatycznie w formacie 1/09/2026, osobno dla każdego miesiąca."
        actions={
          <MonthNav
            monthKey={monthKey}
            basePath="/admin/rachunki"
            extraQuery={{ state }}
          />
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div>
          <form className="card mb-4 flex flex-wrap items-end gap-3 p-4" method="get">
            <input type="hidden" name="m" value={monthKey} />
            <div className="w-56">
              <label className="label" htmlFor="state">
                Status
              </label>
              <select id="state" name="state" defaultValue={state ?? ""} className="input">
                <option value="">Wszystkie</option>
                <option value="OPEN">Do zapłaty</option>
                <option value="OVERDUE">Po terminie</option>
                <option value="PAID">Opłacone</option>
                <option value="CANCELLED">Anulowane</option>
              </select>
            </div>
            <button type="submit" className="btn-secondary">
              Filtruj
            </button>
          </form>

          {invoices.length === 0 ? (
            <EmptyState>
              Brak rachunków wystawionych w tym miesiącu.
            </EmptyState>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Numer</th>
                    <th className="px-4 py-2.5">Uczeń</th>
                    <th className="px-4 py-2.5">Wystawiono</th>
                    <th className="px-4 py-2.5">Termin</th>
                    <th className="px-4 py-2.5">Kwota</th>
                    <th className="px-4 py-2.5">Wpłacono</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/admin/rachunki/${invoice.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {invoice.number}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {invoice.studentName}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {formatDate(new Date(invoice.issuedAt))}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {formatDate(new Date(invoice.dueAt))}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {formatPLN(invoice.totalAmount)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {formatPLN(invoice.paidAmount)}
                      </td>
                      <td className="px-4 py-2.5">
                        <InvoiceStateBadge state={invoice.paymentState} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              Rachunek za miesiąc
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Zbiera wszystkie nierozliczone lekcje zrealizowane w danym
              miesiącu (tryb „{BILLING_MODE_LABEL.POSTPAID}”).
            </p>
            {monthlyStudents.length === 0 ? (
              <p className="text-sm text-slate-500">Brak uczniów w tym trybie.</p>
            ) : (
              <ActionForm
                action={createMonthlyInvoiceAction}
                submitLabel="Wystaw rachunek"
              >
                <SelectField
                  label="Uczeń"
                  name="studentId"
                  required
                  options={monthlyStudents.map((student) => ({
                    value: student.id,
                    label: `${student.fullName} — ${
                      BILLING_MODE_LABEL[student.billingMode ?? "POSTPAID"]
                    }`,
                  }))}
                />
                <Field
                  label="Miesiąc"
                  name="month"
                  type="month"
                  defaultValue={monthKey}
                  required
                />
                <Field
                  label="Termin płatności (dni)"
                  name="dueDays"
                  type="number"
                  min={0}
                  max={120}
                  hint="Puste = domyślny termin z ustawień."
                />
                <Field label="Uwagi na rachunku" name="note" />
              </ActionForm>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              Rachunek za pojedynczą lekcję
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Lista zawiera lekcje zrealizowane, które nie trafiły jeszcze na
              żaden rachunek.
            </p>
            {perLessonUnbilled.length === 0 ? (
              <p className="text-sm text-slate-500">
                Wszystkie lekcje są rozliczone.
              </p>
            ) : (
              <ActionForm
                action={createLessonInvoiceAction}
                submitLabel="Wystaw rachunek"
              >
                <SelectField
                  label="Lekcja"
                  name="lessonId"
                  required
                  options={perLessonUnbilled.slice(0, 100).map((lesson) => ({
                    value: lesson.lessonId,
                    label: `${lesson.studentName} — ${formatDateTime(
                      new Date(lesson.scheduledAt)
                    )} (${formatPLN(lesson.amount)})`,
                  }))}
                />
                <Field
                  label="Termin płatności (dni)"
                  name="dueDays"
                  type="number"
                  min={0}
                  max={120}
                />
              </ActionForm>
            )}
          </div>

          <div className="card p-5">
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              Rachunek za pakiet
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Dla uczniów płacących z góry. Zrealizowane lekcje zdejmują
              jednostki z pakietu.
            </p>
            {prepaidStudents.length === 0 ? (
              <p className="text-sm text-slate-500">
                Żaden uczeń nie ma trybu „{BILLING_MODE_LABEL.PREPAID}”.
              </p>
            ) : (
              <ActionForm
                action={createPackageInvoiceAction}
                submitLabel="Wystaw rachunek"
              >
                <SelectField
                  label="Uczeń"
                  name="studentId"
                  required
                  options={prepaidStudents.map((student) => ({
                    value: student.id,
                    label: student.fullName,
                  }))}
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
                <Field label="Opis pozycji" name="description" />
                <Field
                  label="Termin płatności (dni)"
                  name="dueDays"
                  type="number"
                  min={0}
                  max={120}
                />
              </ActionForm>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
