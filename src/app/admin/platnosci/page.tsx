import Link from "next/link";
import { requirePage } from "@/lib/auth";
import {
  listInvoices,
  listPayments,
  listReceivables,
} from "@/lib/services/billing";
import { listStudents } from "@/lib/services/students";
import { deletePaymentAction, recordPaymentAction } from "@/app/actions/billing";
import { ActionForm, ConfirmButton, Field, SelectField } from "@/components/forms";
import {
  BILLING_MODE_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_OPTIONS,
} from "@/components/billing";
import { MonthNav } from "@/components/month-nav";
import { currentMonthKey, formatDate, toWallClockInput } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { m } = await searchParams;
  const monthKey = /^\d{4}-\d{2}$/.test(m ?? "") ? m! : currentMonthKey();

  const [receivables, payments, students, openInvoices] = await Promise.all([
    listReceivables(actor),
    listPayments(actor, { month: monthKey }),
    listStudents(actor),
    listInvoices(actor, { state: "OPEN" }),
  ]);

  const withArrears = receivables.filter((row) => row.arrears);
  const totalArrears = withArrears.reduce(
    (sum, row) => sum + Math.abs(Math.min(row.balance, 0)),
    0
  );
  const paidThisMonth = payments.reduce((sum, row) => sum + row.amount, 0);
  const unpaidLessons = receivables.reduce(
    (sum, row) => sum + row.unpaidLessons,
    0
  );

  return (
    <>
      <PageHeader
        title="Płatności i zaległości"
        description="Wpłaty uczniów oraz salda rozliczeń."
        actions={<MonthNav monthKey={monthKey} basePath="/admin/platnosci" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Wpłaty w miesiącu"
          value={formatPLN(paidThisMonth)}
          hint={`${payments.length} wpłat`}
        />
        <StatCard
          label="Zaległości"
          value={formatPLN(totalArrears)}
          hint={`${withArrears.length} uczniów z ujemnym saldem`}
        />
        <StatCard
          label="Rachunki do zapłaty"
          value={String(openInvoices.length)}
          hint="nieopłacone lub częściowo"
        />
        <StatCard
          label="Lekcje nieopłacone"
          value={String(unpaidLessons)}
          hint="zrealizowane, bez pokrycia we wpłatach"
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              Salda uczniów
            </h2>
            {receivables.length === 0 ? (
              <EmptyState>Brak uczniów w bazie.</EmptyState>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-4 py-2.5">Uczeń</th>
                      <th className="px-4 py-2.5">Tryb</th>
                      <th className="px-4 py-2.5">Naliczono</th>
                      <th className="px-4 py-2.5">Wpłacono</th>
                      <th className="px-4 py-2.5">Saldo</th>
                      <th className="px-4 py-2.5">Po terminie</th>
                      <th className="px-4 py-2.5">Lekcje bez opłaty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receivables.map((row) => (
                      <tr key={row.studentId} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/uczniowie/${row.studentId}`}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {row.studentName}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {BILLING_MODE_LABEL[row.billingMode]}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {formatPLN(row.charged)}
                          <span className="block text-xs text-slate-400">
                            rachunki: {formatPLN(row.invoiced)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {formatPLN(row.paid)}
                        </td>
                        <td
                          className={`px-4 py-2.5 font-medium ${
                            row.balance < 0 ? "text-red-700" : "text-slate-900"
                          }`}
                        >
                          {formatPLN(row.balance)}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.overdueAmount > 0 ? (
                            <span className="font-medium text-red-700">
                              {formatPLN(row.overdueAmount)}
                              {row.oldestDueAt ? (
                                <span className="block text-xs font-normal text-red-600">
                                  od {formatDate(new Date(row.oldestDueAt))}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.unpaidLessons === 0 ? (
                            <Badge tone="green">wszystkie opłacone</Badge>
                          ) : (
                            <Badge tone="amber">{row.unpaidLessons}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              Wpłaty w wybranym miesiącu
            </h2>
            {payments.length === 0 ? (
              <EmptyState>Brak wpłat w tym miesiącu.</EmptyState>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-4 py-2.5">Data</th>
                      <th className="px-4 py-2.5">Uczeń</th>
                      <th className="px-4 py-2.5">Rachunek</th>
                      <th className="px-4 py-2.5">Forma</th>
                      <th className="px-4 py-2.5">Kwota</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-600">
                          {formatDate(new Date(payment.paidAt))}
                        </td>
                        <td className="px-4 py-2.5 text-slate-800">
                          {payment.studentName}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {payment.invoiceId ? (
                            <Link
                              href={`/admin/rachunki/${payment.invoiceId}`}
                              className="text-brand-700 hover:underline"
                            >
                              {payment.invoiceNumber}
                            </Link>
                          ) : (
                            <span className="text-slate-400">przedpłata</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {PAYMENT_METHOD_LABEL[payment.method]}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {formatPLN(payment.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <form action={deletePaymentAction}>
                            <input type="hidden" name="id" value={payment.id} />
                            <ConfirmButton message="Usunąć tę wpłatę?">
                              Usuń
                            </ConfirmButton>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="card h-fit p-5">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            Zapisz wpłatę
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Wpłata bez wskazanego rachunku liczy się jako przedpłata na poczet
            przyszłych lekcji.
          </p>
          <ActionForm
            action={recordPaymentAction}
            submitLabel="Zapisz wpłatę"
            resetOnSuccess
          >
            <SelectField
              label="Uczeń"
              name="studentId"
              required
              options={students.map((student) => ({
                value: student.id,
                label: student.fullName,
              }))}
            />
            <SelectField
              label="Rachunek"
              name="invoiceId"
              options={[
                { value: "", label: "— bez rachunku (przedpłata) —" },
                ...openInvoices.map((invoice) => ({
                  value: invoice.id,
                  label: `${invoice.number} — ${invoice.studentName} (${formatPLN(
                    invoice.balance
                  )})`,
                })),
              ]}
            />
            <Field label="Kwota" name="amount" inputMode="decimal" required />
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
        </div>
      </div>
    </>
  );
}
