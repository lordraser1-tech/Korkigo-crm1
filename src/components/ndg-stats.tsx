import Link from "next/link";
import type { FinancialStats, NdgScope } from "@/lib/services/ndg";
import { formatPLN } from "@/lib/money";
import { EmptyState, StatCard } from "@/components/ui";

const SCOPE_LABEL: Record<NdgScope, string> = {
  MONTH: "Miesiąc",
  QUARTER: "Kwartał",
  YEAR: "Rok",
};

/** Statystyki finansowe okresu — działają też po wyłączeniu pilnowania NDG. */
export function NdgStats({
  stats,
  scope,
  scopeHref,
}: {
  stats: FinancialStats;
  scope: NdgScope;
  scopeHref: (scope: NdgScope) => string;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Statystyki finansowe
          </h2>
          <p className="text-sm text-slate-500">{stats.label}</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {(Object.keys(SCOPE_LABEL) as NdgScope[]).map((option) => (
            <Link
              key={option}
              href={scopeHref(option)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                option === scope
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {SCOPE_LABEL[option]}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Przychód należny"
          value={formatPLN(stats.revenueInvoiced)}
          hint={`${stats.invoices} rachunków`}
        />
        <StatCard
          label="Wpłaty w okresie"
          value={formatPLN(stats.revenuePaid)}
          hint="ujęcie kasowe"
        />
        <StatCard
          label="Koszt wypłat"
          value={formatPLN(stats.cost)}
          hint="lekcje zrealizowane × stawka"
        />
        <StatCard label="Marża" value={formatPLN(stats.margin)} hint="należne − koszt" />
        <StatCard
          label="Lekcje zrealizowane"
          value={String(stats.lessons)}
          hint={`aktywnych uczniów: ${stats.activeStudents}`}
        />
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">
        Wynik wg nauczyciela
      </h3>
      {stats.perTeacher.length === 0 ? (
        <EmptyState>Brak zdarzeń finansowych w tym okresie.</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-2.5">Nauczyciel</th>
                <th className="px-4 py-2.5">Lekcje</th>
                <th className="px-4 py-2.5">Przychód</th>
                <th className="px-4 py-2.5">Koszt wypłat</th>
                <th className="px-4 py-2.5">Marża</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 [font-variant-numeric:tabular-nums]">
              {stats.perTeacher.map((row) => (
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
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Przychód przypisujemy nauczycielowi przez pozycje rachunku powiązane
        z lekcją; pozycje pakietowe trafiają do nauczyciela przypisanego uczniowi.
      </p>
    </section>
  );
}
