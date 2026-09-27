import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { getEvidenceReport } from "@/lib/services/evidence";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";
import { PrintButton } from "@/components/print-button";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";

export default async function AdminEvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ rok?: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { rok } = await searchParams;
  const now = new Date();
  const year = /^\d{4}$/.test(rok ?? "") ? Number(rok) : now.getFullYear();
  const report = await getEvidenceReport(actor, year);

  const monthsWithRows = report.months.filter((month) => month.rows.length > 0);

  return (
    <div className="print-page">
      <div className="no-print">
        <PageHeader
          title="Ewidencja przychodu"
          description="Zestawienie do PIT-36: data, dokument, kwota i suma narastająca."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/admin/ewidencja?rok=${year - 1}`} className="btn-secondary">
                ← {year - 1}
              </Link>
              <Link href={`/admin/ewidencja?rok=${year + 1}`} className="btn-secondary">
                {year + 1} →
              </Link>
              <a
                href={`/api/evidence?format=csv&rok=${year}`}
                className="btn-secondary"
              >
                Pobierz CSV
              </a>
              <PrintButton />
            </div>
          }
        />

        <p className="mb-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Zestawienie pomocnicze.</strong> Aplikacja podaje wyłącznie
          kwoty wynikające z dokumentów — nie wylicza podatku, nie zna stawek ani
          kwoty wolnej. Zanim użyjesz tego do zeznania, potwierdź sposób ujęcia
          przychodu z księgowym.
        </p>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Rok" value={String(year)} />
          <StatCard
            label="Przychód razem"
            value={formatPLN(report.total)}
            hint="suma za cały rok"
          />
          <StatCard label="Pozycji w ewidencji" value={String(report.rowCount)} />
          <StatCard
            label="Podstawa"
            value={report.basis === "PAID" ? "kasowa" : "należna"}
            hint={report.basisLabel}
          />
        </div>
      </div>

      {/* Nagłówek widoczny wyłącznie na wydruku — ewidencja ma się obronić na papierze. */}
      <div className="mb-6 hidden print:block">
        <h1 className="text-xl font-bold">Ewidencja przychodu {year}</h1>
        {report.seller.name ? <p className="text-sm">{report.seller.name}</p> : null}
        {report.seller.address ? (
          <p className="text-sm">{report.seller.address}</p>
        ) : null}
        <p className="mt-1 text-xs">Podstawa: {report.basisLabel}</p>
        {report.seller.taxNote ? (
          <p className="text-xs">{report.seller.taxNote}</p>
        ) : null}
        <p className="mt-1 text-xs">
          Wygenerowano {formatDateTime(new Date(report.generatedAt))}
        </p>
      </div>

      {monthsWithRows.length === 0 ? (
        <EmptyState>
          W {year} roku nie ma jeszcze żadnej pozycji dla wybranej podstawy.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {monthsWithRows.map((month) => (
            <section key={month.monthKey}>
              <h2 className="mb-2 text-base font-semibold capitalize text-slate-900">
                {month.label}
              </h2>
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Lp.</th>
                      <th className="px-4 py-2.5 text-left">Data</th>
                      <th className="px-4 py-2.5 text-left">Dokument</th>
                      <th className="px-4 py-2.5 text-left">Uczeń</th>
                      <th className="px-4 py-2.5 text-right">Kwota</th>
                      <th className="px-4 py-2.5 text-right">Narastająco</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {month.rows.map((row) => (
                      <tr key={`${row.index}-${row.document}`}>
                        <td className="px-4 py-2 text-slate-500">{row.index}</td>
                        <td className="px-4 py-2 text-slate-700">
                          {formatDate(new Date(`${row.date}T12:00:00Z`))}
                        </td>
                        <td className="px-4 py-2 text-slate-700">{row.document}</td>
                        <td className="px-4 py-2 text-slate-700">{row.studentName}</td>
                        <td className="px-4 py-2 text-right font-medium text-slate-900">
                          {formatPLN(row.amount)}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600">
                          {formatPLN(row.cumulative)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td className="px-4 py-2.5 font-semibold text-slate-700" colSpan={4}>
                        Razem {month.label}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-900">
                        {formatPLN(month.total)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-600">
                        {formatPLN(month.cumulative)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ))}

          <div className="card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-base font-semibold text-slate-900">
                Przychód razem za {year}
              </span>
              <span className="text-2xl font-semibold text-slate-900">
                {formatPLN(report.total)}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {report.rowCount} pozycji · {report.basisLabel}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
