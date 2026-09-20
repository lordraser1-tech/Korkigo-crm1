import { requirePage } from "@/lib/auth";
import { getTeacherEarnings } from "@/lib/services/finance";
import { currentMonthKey } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";
import { MonthNav } from "@/components/month-nav";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";

export default async function TeacherEarningsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const actor = await requirePage("TEACHER");
  const { m } = await searchParams;
  const monthKey = /^\d{4}-\d{2}$/.test(m ?? "") ? m! : currentMonthKey();
  const earnings = await getTeacherEarnings(actor, actor.teacherProfileId, monthKey);

  return (
    <>
      <PageHeader
        title="Moje wypłaty"
        description="Wynagrodzenie liczone jako lekcje zrealizowane × Twoja stawka."
        actions={<MonthNav monthKey={monthKey} basePath="/nauczyciel/wyplaty" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Twoja stawka" value={formatPLN(earnings.ratePerLesson)} hint="za lekcję" />
        <StatCard label="Lekcje zrealizowane" value={String(earnings.completedLessons)} />
        <StatCard
          label="Pozostałe lekcje"
          value={String(earnings.scheduledLessons)}
          hint={`odwołane: ${earnings.cancelledLessons} • nieobecności: ${earnings.noShowLessons}`}
        />
        <StatCard label="Do wypłaty" value={formatPLN(earnings.total)} hint="za wybrany miesiąc" />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          Rozbicie na uczniów
        </h2>
        {earnings.byStudent.length === 0 ? (
          <EmptyState>
            W tym miesiącu nie masz jeszcze zrealizowanych lekcji.
          </EmptyState>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-2.5">Uczeń</th>
                  <th className="px-4 py-2.5">Lekcje zrealizowane</th>
                  <th className="px-4 py-2.5">Kwota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {earnings.byStudent.map((row) => (
                  <tr key={row.studentId}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {row.studentName}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {row.completedLessons}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {formatPLN(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="px-4 py-2.5 font-semibold text-slate-700">Razem</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-700">
                    {earnings.completedLessons}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">
                    {formatPLN(earnings.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
