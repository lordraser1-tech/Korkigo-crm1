import { requirePage } from "@/lib/auth";
import { getTeacherEarnings } from "@/lib/services/finance";
import { getPayoutDue, listPayouts } from "@/lib/services/payouts";
import { currentMonthKey, formatDate } from "@/lib/datetime";
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
  const [earnings, due, payouts] = await Promise.all([
    getTeacherEarnings(actor, actor.teacherProfileId, monthKey),
    getPayoutDue(actor, actor.teacherProfileId),
    listPayouts(actor),
  ]);

  return (
    <>
      <PageHeader
        title="Moje wypłaty"
        description="Wynagrodzenie liczone jako lekcje zrealizowane × Twoja stawka."
        actions={<MonthNav monthKey={monthKey} basePath="/nauczyciel/wyplaty" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Przedmioty"
          value={String(earnings.bySubject.length)}
          hint="rozliczone w tym miesiącu"
        />
        <StatCard label="Lekcje zrealizowane" value={String(earnings.completedLessons)} />
        <StatCard
          label="Pozostałe lekcje"
          value={String(earnings.scheduledLessons)}
          hint={`odwołane: ${earnings.cancelledLessons} • nieobecności: ${earnings.noShowLessons}`}
        />
        <StatCard label="Do wypłaty" value={formatPLN(earnings.total)} hint="za wybrany miesiąc" />
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            Oczekuje na wypłatę
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Suma z wszystkich miesięcy — lekcje, które nie trafiły jeszcze do
            żadnej wypłaty.
          </p>
          <p className="text-2xl font-semibold text-slate-900">
            {formatPLN(due.amount)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {due.lessons === 0
              ? "wszystko rozliczone"
              : `${due.lessons} lekcji${
                  due.oldestLessonAt
                    ? `, od ${formatDate(new Date(due.oldestLessonAt))}`
                    : ""
                }`}
          </p>
        </div>

        <div className="card p-5">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            Historia wypłat ({payouts.length})
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Wypłaty oznaczone przez administratora.
          </p>
          {payouts.length === 0 ? (
            <EmptyState>Nie masz jeszcze żadnej wypłaty.</EmptyState>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {payouts.map((payout) => (
                <li
                  key={payout.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <span className="text-slate-700">
                    {formatDate(new Date(payout.paidAt))}
                    <span className="block text-xs text-slate-500">
                      {payout.lessonCount} lekcji
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
        </div>
      </section>

      {earnings.bySubject.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            Rozbicie na przedmioty
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-2.5">Przedmiot i poziom</th>
                  <th className="px-4 py-2.5">Lekcje</th>
                  <th className="px-4 py-2.5">Kwota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {earnings.bySubject.map((row) => (
                  <tr key={row.subjectLevelId}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {row.label}
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
            </table>
          </div>
        </section>
      ) : null}

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
