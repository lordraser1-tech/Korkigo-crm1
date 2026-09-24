import Link from "next/link";
import { requirePage } from "@/lib/auth";
import {
  getFinancialStats,
  getNdgOverview,
  quarterOfMonth,
  type NdgScope,
} from "@/lib/services/ndg";
import {
  createNdgLimitAction,
  deleteNdgLimitAction,
  updateNdgSettingsAction,
} from "@/app/actions/ndg";
import { ActionForm, ConfirmButton, Field, SelectField } from "@/components/forms";
import { NdgBanner } from "@/components/ndg-banner";
import { NdgLimitMeter } from "@/components/ndg-meter";
import { NdgMonthlyChart } from "@/components/ndg-monthly-chart";
import { NdgStats } from "@/components/ndg-stats";
import { NdgStatusChip } from "@/components/ndg-status";
import { currentMonthKey, formatDate, formatMonthLabel } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";
import { PageHeader } from "@/components/ui";

function parseScope(value: string | undefined): NdgScope {
  return value === "MONTH" || value === "QUARTER" || value === "YEAR"
    ? value
    : "QUARTER";
}

export default async function AdminNdgPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    period?: string;
    scope?: string;
    month?: string;
  }>;
}) {
  const actor = await requirePage("ADMIN");
  const params = await searchParams;

  const thisMonth = currentMonthKey();
  const year = /^\d{4}$/.test(params.year ?? "")
    ? Number(params.year)
    : Number(thisMonth.slice(0, 4));

  const overview = await getNdgOverview(actor, {
    year,
    periodKey: params.period ?? null,
  });

  const scope = parseScope(params.scope);
  const selectedMonth = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!
    : overview.selected.months[0]?.monthKey ?? thisMonth;

  const stats = await getFinancialStats(actor, {
    scope,
    year,
    quarter:
      overview.settings.mode === "QUARTERLY" && overview.selected.periodKey.includes("Q")
        ? Number(overview.selected.periodKey.split("Q")[1])
        : quarterOfMonth(Number(selectedMonth.slice(5, 7))),
    month: selectedMonth,
  });

  const query = (next: Record<string, string>) => {
    const search = new URLSearchParams({
      year: String(year),
      period: overview.selected.periodKey,
      scope,
      month: selectedMonth,
      ...next,
    });
    return `/admin/ndg?${search.toString()}`;
  };

  const quarters = overview.settings.mode === "QUARTERLY" ? overview.periods : [];

  return (
    <>
      <PageHeader
        title="Działalność nierejestrowana"
        description={
          overview.settings.enabled
            ? "Pilnowanie limitu przychodu i statystyki finansowe."
            : "Pilnowanie limitu wyłączone — moduł pracuje jako statystyki finansowe."
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href={query({ year: String(year - 1), period: "" })} className="btn-secondary btn-sm">
              ← {year - 1}
            </Link>
            <span className="min-w-16 text-center text-sm font-semibold text-slate-700">
              {year}
            </span>
            <Link href={query({ year: String(year + 1), period: "" })} className="btn-secondary btn-sm">
              {year + 1} →
            </Link>
          </div>
        }
      />

      {/* Pas ostrzegawczy na samej górze — od progu (domyślnie 90%) krzyczy. */}
      <NdgBanner period={overview.selected} settings={overview.settings} />

      {!overview.settings.enabled ? (
        <div className="mb-6 rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-700">
          <p className="font-semibold">Rejestrowanie NDG jest wyłączone.</p>
          <p className="mt-1 text-slate-600">
            {overview.settings.businessStartedAt
              ? `Działalność rejestrowana od ${formatDate(
                  new Date(`${overview.settings.businessStartedAt}T12:00:00Z`)
                )}. `
              : ""}
            Limit nie jest liczony ani pokazywany. Statystyki finansowe poniżej
            działają bez zmian.
          </p>
        </div>
      ) : null}

      <div className="space-y-8">
        {overview.settings.enabled ? (
          <>
            <NdgLimitMeter period={overview.selected} settings={overview.settings} />

            <section>
              <h2 className="mb-3 text-base font-semibold text-slate-900">
                Okresy {year}
              </h2>
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-4 py-2.5">Okres</th>
                      <th className="px-4 py-2.5">Przychód</th>
                      <th className="px-4 py-2.5">Limit</th>
                      <th className="px-4 py-2.5">Wykorzystanie</th>
                      <th className="px-4 py-2.5">Pozostało</th>
                      <th className="px-4 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 [font-variant-numeric:tabular-nums]">
                    {overview.periods.map((period) => (
                      <tr
                        key={period.periodKey}
                        className={
                          period.periodKey === overview.selected.periodKey
                            ? "bg-brand-50"
                            : "hover:bg-slate-50"
                        }
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={query({ period: period.periodKey })}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {period.label}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {formatPLN(period.revenue)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {period.limit === null ? "—" : formatPLN(period.limit)}
                        </td>
                        <td className="px-4 py-2.5">
                          {period.percent === null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span className="font-medium text-slate-900">
                              {period.percent.toFixed(1).replace(".", ",")}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {period.remaining === null
                            ? "—"
                            : formatPLN(period.remaining)}
                        </td>
                        <td className="px-4 py-2.5">
                          <NdgStatusChip status={period.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <NdgMonthlyChart
              monthly={overview.monthly}
              quarters={quarters}
              showMonthlyLimit={overview.settings.mode === "MONTHLY"}
            />

            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Miesiąc</th>
                    <th className="px-4 py-2.5">Przychód</th>
                    {overview.settings.enabled ? (
                      <>
                        <th className="px-4 py-2.5">Limit miesięczny</th>
                        <th className="px-4 py-2.5">
                          {overview.settings.mode === "MONTHLY"
                            ? "Wykorzystanie"
                            : "Kwartał"}
                        </th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 [font-variant-numeric:tabular-nums]">
                  {overview.monthly.map((month) => (
                    <tr key={month.monthKey} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 capitalize text-slate-700">
                        {month.label}
                      </td>
                      <td className="px-4 py-2.5 text-slate-900">
                        {formatPLN(month.revenue)}
                      </td>
                      {overview.settings.enabled ? (
                        <>
                          <td className="px-4 py-2.5 text-slate-600">
                            {month.limit === null ? "—" : formatPLN(month.limit)}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {overview.settings.mode === "MONTHLY"
                              ? month.percent === null
                                ? "—"
                                : `${month.percent.toFixed(0)}%`
                              : `${["I", "II", "III", "IV"][quarterOfMonth(Number(month.monthKey.slice(5, 7))) - 1]} kw.`}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card p-5">
              <h2 className="mb-1 text-base font-semibold text-slate-900">
                Ustawienia modułu
              </h2>
              <p className="mb-4 text-xs text-slate-500">
                Wyłączenie zostawia same statystyki — przyda się po założeniu firmy.
              </p>
              <ActionForm
                action={updateNdgSettingsAction}
                submitLabel="Zapisz ustawienia"
              >
                <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={overview.settings.enabled}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-slate-700">
                    Pilnuj limitu działalności nierejestrowanej
                  </span>
                </label>
                <SelectField
                  label="Okres rozliczenia limitu"
                  name="mode"
                  defaultValue={overview.settings.mode}
                  options={[
                    { value: "QUARTERLY", label: "Kwartalny" },
                    { value: "MONTHLY", label: "Miesięczny" },
                  ]}
                />
                <SelectField
                  label="Podstawa przychodu"
                  name="revenueBasis"
                  defaultValue={overview.settings.revenueBasis}
                  options={[
                    { value: "INVOICED", label: "Należny (z rachunków)" },
                    { value: "PAID", label: "Kasowy (z wpłat)" },
                  ]}
                  hint="Sposób liczenia potwierdź z księgowym."
                />
                <Field
                  label="Próg ostrzeżenia (%)"
                  name="warnThresholdPercent"
                  type="number"
                  min={10}
                  max={100}
                  defaultValue={overview.settings.warnThresholdPercent}
                  required
                />
                <Field
                  label="Działalność rejestrowana od"
                  name="businessStartedAt"
                  type="date"
                  defaultValue={overview.settings.businessStartedAt}
                  hint="Data przejścia na firmę — wyłącznie do dokumentacji."
                />
                <Field
                  label="Notatka"
                  name="note"
                  defaultValue={overview.settings.note}
                />
              </ActionForm>
            </div>

            <div className="card p-5">
              <h2 className="mb-1 text-base font-semibold text-slate-900">
                Kwoty limitu
              </h2>
              <p className="mb-4 text-xs text-slate-500">
                Limit miesięczny obowiązuje od wskazanego miesiąca aż do kolejnego
                wpisu. Limit kwartału to suma limitów jego miesięcy.
              </p>

              {overview.limits.length === 0 ? (
                <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Nie podano jeszcze żadnej kwoty — bez niej moduł nie policzy
                  wykorzystania.
                </p>
              ) : (
                <ul className="mb-4 space-y-2">
                  {overview.limits.map((limit) => (
                    <li
                      key={limit.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-medium text-slate-900">
                          {formatPLN(limit.amount)}
                        </span>
                        <span className="block text-xs text-slate-500">
                          od{" "}
                          <span className="capitalize">
                            {formatMonthLabel(limit.validFromMonth)}
                          </span>
                          {limit.note ? ` · ${limit.note}` : ""}
                        </span>
                      </span>
                      <form action={deleteNdgLimitAction}>
                        <input type="hidden" name="id" value={limit.id} />
                        <ConfirmButton message="Usunąć tę kwotę limitu?">
                          Usuń
                        </ConfirmButton>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              <ActionForm
                action={createNdgLimitAction}
                submitLabel="Dodaj kwotę"
                resetOnSuccess
              >
                <Field
                  label="Obowiązuje od miesiąca"
                  name="validFrom"
                  type="month"
                  defaultValue={thisMonth}
                  required
                />
                <Field
                  label="Limit miesięczny (zł)"
                  name="amount"
                  inputMode="decimal"
                  required
                />
                <Field
                  label="Notatka"
                  name="note"
                  placeholder="np. podstawa prawna, data sprawdzenia"
                />
              </ActionForm>
            </div>

            <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">
                To narzędzie pomocnicze, nie doradztwo podatkowe
              </p>
              <p className="mt-1">
                Aplikacja liczy to, co jej wpiszesz: kwotę limitu, okres i
                podstawę przychodu. Same przepisy — wysokość limitu, moment
                powstania przychodu, sposób liczenia — potwierdź z księgowym
                przed użyciem w rozliczeniach.
              </p>
            </div>
          </div>
        </div>

        <NdgStats
          stats={stats}
          scope={scope}
          scopeHref={(next) => query({ scope: next })}
        />
      </div>
    </>
  );
}
