import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { listStudents } from "@/lib/services/students";
import { listTeachers } from "@/lib/services/teachers";
import { countLessonsByStatus, upcomingLessons } from "@/lib/services/lessons";
import { getAdminFinanceSummary } from "@/lib/services/finance";
import { listReceivables } from "@/lib/services/billing";
import { getNdgOverview } from "@/lib/services/ndg";
import { NdgBanner } from "@/components/ndg-banner";
import { currentMonthKey, formatMonthLabel, monthRange } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";
import { LessonList } from "@/components/lesson-list";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";

export default async function AdminDashboard() {
  const actor = await requirePage("ADMIN");
  const monthKey = currentMonthKey();
  const { from, to } = monthRange(monthKey);

  const [students, teachers, counts, finance, upcoming, receivables, ndg] =
    await Promise.all([
      listStudents(actor),
      listTeachers(actor),
      countLessonsByStatus(actor, { from, to }),
      getAdminFinanceSummary(actor, monthKey),
      upcomingLessons(actor, 6),
      listReceivables(actor),
      getNdgOverview(actor),
    ]);



  const activeStudents = students.filter((s) => s.status === "ACTIVE").length;
  const missingRates = students.filter((s) => (s.rateCount ?? 0) === 0);
  const withArrears = receivables.filter((row) => row.arrears);

  return (
    <>
      <PageHeader
        title="Pulpit"
        description={`Podsumowanie miesiąca: ${formatMonthLabel(monthKey)}`}
      />

      <NdgBanner
        period={ndg.selected}
        settings={ndg.settings}
        href="/admin/ndg"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Uczniowie aktywni"
          value={String(activeStudents)}
          hint={`wszystkich w bazie: ${students.length}`}
        />
        <StatCard label="Nauczyciele aktywni" value={String(teachers.length)} />
        <StatCard
          label="Lekcje zrealizowane"
          value={String(counts.COMPLETED)}
          hint={`zaplanowane: ${counts.SCHEDULED} • odwołane: ${counts.CANCELLED}`}
        />
        <StatCard
          label="Marża (miesiąc)"
          value={formatPLN(finance.margin)}
          hint={`przychód ${formatPLN(finance.revenue)} − koszt ${formatPLN(finance.cost)}`}
        />
      </div>



      {withArrears.length > 0 ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-900">
            {withArrears.length === 1
              ? "1 uczeń z zaległością."
              : `${withArrears.length} uczniów z zaległością.`}
          </p>
          <p className="mt-1 text-xs text-red-800">
            {withArrears.slice(0, 5).map((row, index) => (
              <span key={row.studentId}>
                {index > 0 ? ", " : ""}
                <Link
                  href={`/admin/uczniowie/${row.studentId}`}
                  className="font-medium underline"
                >
                  {row.studentName}
                </Link>{" "}
                ({formatPLN(Math.abs(Math.min(row.balance, 0)))})
              </span>
            ))}
            {withArrears.length > 5 ? " …" : ""}
            {" — "}
            <Link href="/admin/platnosci" className="font-medium underline">
              przejdź do płatności
            </Link>
          </p>
        </div>
      ) : null}

      {missingRates.length > 0 ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            {missingRates.length === 1
              ? "1 uczeń czeka na ustalenie ceny."
              : `${missingRates.length} uczniów czeka na ustalenie ceny.`}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Uczniowie bez ustalonej ceny za lekcję — bez niej nie da się
            zapisać im lekcji:{" "}
            {missingRates.slice(0, 5).map((student, index) => (
              <span key={student.id}>
                {index > 0 ? ", " : ""}
                <Link
                  href={`/admin/uczniowie/${student.id}`}
                  className="font-medium underline"
                >
                  {student.fullName}
                </Link>
              </span>
            ))}
            {missingRates.length > 5 ? " …" : ""}
          </p>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Najbliższe lekcje
            </h2>
            <Link
              href="/admin/lekcje"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Cały kalendarz →
            </Link>
          </div>
          <LessonList
            lessons={upcoming}
            showTeacher
            isAdmin
            studentHrefBase="/admin/uczniowie"
            emptyText="Brak zaplanowanych lekcji."
          />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Wynik wg nauczyciela
            </h2>
            <Link
              href="/admin/rozliczenia"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Rozliczenia →
            </Link>
          </div>
          {finance.perTeacher.length === 0 ? (
            <EmptyState>Brak zrealizowanych lekcji w tym miesiącu.</EmptyState>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Nauczyciel</th>
                    <th className="px-4 py-2.5">Lekcje</th>
                    <th className="px-4 py-2.5">Przychód</th>
                    <th className="px-4 py-2.5">Marża</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {finance.perTeacher.map((row) => (
                    <tr key={row.teacherId}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        {row.teacherName}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {row.completedLessons}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {formatPLN(row.revenue)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {formatPLN(row.margin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
