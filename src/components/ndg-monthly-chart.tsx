import type { NdgMonthUsage, NdgPeriodUsage } from "@/lib/services/ndg";
import { formatPLN } from "@/lib/money";

/**
 * Przychód miesiąc po miesiącu — jedna seria, więc bez legendy: tytuł ją nazywa.
 * Słupki stoją na zerze, mają zaokrąglone końce i 2-pikselową przerwę, a wartość
 * pokazuje się na hover (najwyższy miesiąc jest podpisany na stałe).
 * Dokładne liczby są w tabeli pod wykresem.
 */
export function NdgMonthlyChart({
  monthly,
  quarters,
  showMonthlyLimit = false,
}: {
  monthly: NdgMonthUsage[];
  /** Kwartały do pogrupowania słupków; puste = bez podziału. */
  quarters: NdgPeriodUsage[];
  /** Procent limitu miesięcznego pokazujemy tylko w trybie miesięcznym. */
  showMonthlyLimit?: boolean;
}) {
  const max = Math.max(...monthly.map((month) => month.revenue), 1);
  const peak = monthly.reduce(
    (best, month) => (month.revenue > best.revenue ? month : best),
    monthly[0]
  );
  const empty = monthly.every((month) => month.revenue === 0);

  const groups =
    quarters.length === 4
      ? quarters.map((quarter, index) => ({
          quarter,
          months: monthly.slice(index * 3, index * 3 + 3),
        }))
      : [{ quarter: null, months: monthly }];

  return (
    <section className="card p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">
          Przychód miesięczny
        </h2>
        <p className="text-xs text-slate-500">
          wartości dokładne w tabeli pod wykresem
        </p>
      </div>

      {empty ? (
        <p className="py-8 text-center text-sm text-slate-500">
          W tym roku nie ma jeszcze żadnego przychodu.
        </p>
      ) : (
        <div className="mt-4 flex items-end gap-4 overflow-x-auto pb-1">
          {groups.map((group, groupIndex) => (
            <div
              key={group.quarter?.periodKey ?? groupIndex}
              className="min-w-0 flex-1"
            >
              <div className="flex h-44 items-end gap-0.5">
                {group.months.map((month) => {
                  const height = Math.max((month.revenue / max) * 100, month.revenue > 0 ? 2 : 0);
                  const isPeak = month.monthKey === peak.monthKey && month.revenue > 0;
                  return (
                    <div
                      key={month.monthKey}
                      className="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
                    >
                      {isPeak ? (
                        <p className="mb-1 text-center text-[11px] font-medium text-slate-600">
                          {Math.round(month.revenue).toLocaleString("pl-PL")} zł
                        </p>
                      ) : null}
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${height}%`,
                          backgroundColor: "var(--color-series-1)",
                        }}
                      />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                        <span className="font-semibold capitalize">{month.label}</span>
                        {": "}
                        {formatPLN(month.revenue)}
                        {showMonthlyLimit && month.percent !== null
                          ? ` · ${month.percent.toFixed(0)}% limitu miesięcznego`
                          : ""}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-1 border-t border-slate-200 pt-1">
                <div className="flex gap-0.5">
                  {group.months.map((month) => (
                    <p
                      key={month.monthKey}
                      className="min-w-0 flex-1 truncate text-center text-[10px] uppercase text-slate-500"
                    >
                      {month.label.slice(0, 3)}
                    </p>
                  ))}
                </div>
                {group.quarter ? (
                  <p className="mt-1 text-center text-[11px] text-slate-500">
                    {group.quarter.label.split(" ")[0]} kw.
                    {group.quarter.percent !== null
                      ? ` · ${group.quarter.percent.toFixed(0)}% limitu`
                      : ""}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
