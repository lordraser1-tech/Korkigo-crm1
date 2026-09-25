import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { getAdminFinanceSummary } from "@/lib/services/finance";
import { listPayouts, listPayoutsDue } from "@/lib/services/payouts";
import { currentMonthKey, formatDate } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";
import { MonthNav } from "@/components/month-nav";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { m } = await searchParams;
  const monthKey = /^\d{4}-\d{2}$/.test(m ?? "") ? m! : currentMonthKey();
  const [summary, due, payouts] = await Promise.all([
    getAdminFinanceSummary(actor, monthKey),
    listPayoutsDue(actor),
    listPayouts(actor),
  ]);
  const totalDue = due.reduce((sum, row) => sum + row.amount, 0);

  return (
    <>
      <PageHeader
        title="Rozliczenia"
        description="Przychód ze stawek uczniów minus koszt wypłat nauczycieli, za lekcje zrealizowane."
        actions={<MonthNav monthKey={monthKey} basePath="/admin/rozliczenia" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lekcje zrealizowane" value={String(summary.completedLessons)} />
        <StatCard label="Przychód" value={formatPLN(summary.revenue)} />
        <StatCard label="Koszt (wypłaty)" value={formatPLN(summary.cost)} />
        <StatCard label="Marża" value={formatPLN(summary.margin)} />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Wg nauczyciela
        </h2>
        {summary.perTeacher.length === 0 ? (
          <EmptyState>Brak zrealizowanych lekcji w tym miesiącu.</EmptyState>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-2.5">Nauczyciel</th>
                  <th className="px-4 py-2.5">Lekcje</th>
                  <th className="px-4 py-2.5">Przychód</th>
                  <th className="px-4 py-2.5">Do wypłaty</th>
                  <th className="px-4 py-2.5">Marża</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.perTeacher.map((row) => (
                  <tr key={row.teacherId} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/nauczyciele/${row.teacherId}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {row.teacherName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {row.completedLessons}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {formatPLN(row.revenue)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {formatPLN(row.cost)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {formatPLN(row.margin)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-4 py-2.5 font-semibold text-slate-700">Razem</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-700">
                    {summary.completedLessons}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-700">
                    {formatPLN(summary.revenue)}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-700">
                    {formatPLN(summary.cost)}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">
                    {formatPLN(summary.margin)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">
            Rejestr wypłat dla nauczycieli
          </h2>
          <p className="text-sm text-slate-500">
            Do wypłaty razem:{" "}
            <strong className="text-slate-900">{formatPLN(totalDue)}</strong>
          </p>
        </div>
        <p className="mb-3 text-sm text-slate-500">
          Kwoty liczą się ze wszystkich miesięcy — lekcja znika stąd dopiero po
          oznaczeniu wypłaty w karcie nauczyciela.
        </p>

        {due.length === 0 ? (
          <EmptyState>Brak aktywnych nauczycieli.</EmptyState>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-2.5">Nauczyciel</th>
                  <th className="px-4 py-2.5">Lekcje nierozliczone</th>
                  <th className="px-4 py-2.5">Najstarsza lekcja</th>
                  <th className="px-4 py-2.5">Do wypłaty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {due.map((row) => (
                  <tr key={row.teacherId} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/nauczyciele/${row.teacherId}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {row.teacherName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{row.lessons}</td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {row.oldestLessonAt
                        ? formatDate(new Date(row.oldestLessonAt))
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {formatPLN(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">
          Ostatnie wypłaty ({payouts.length})
        </h3>
        {payouts.length === 0 ? (
          <EmptyState>Nie oznaczono jeszcze żadnej wypłaty.</EmptyState>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {payouts.slice(0, 10).map((payout) => (
              <li
                key={payout.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <span className="text-slate-700">
                  {formatDate(new Date(payout.paidAt))} ·{" "}
                  <Link
                    href={`/admin/nauczyciele/${payout.teacherId}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {payout.teacherName}
                  </Link>
                  <span className="block text-xs text-slate-500">
                    {payout.lessonCount} lekcji
                    {payout.paidByEmail ? ` · oznaczył: ${payout.paidByEmail}` : ""}
                    {payout.note ? ` · ${payout.note}` : ""}
                  </span>
                </span>
                <span className="font-semibold text-slate-900">
                  {formatPLN(payout.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
