import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { getAdminFinanceSummary } from "@/lib/services/finance";
import { currentMonthKey } from "@/lib/datetime";
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
  const summary = await getAdminFinanceSummary(actor, monthKey);

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

      <p className="mt-6 text-xs text-slate-500">
        Faza 1 liczy po aktualnych stawkach. Płatności, zaległości i rachunki
        z numeracją pojawią się w fazie 2.
      </p>
    </>
  );
}
