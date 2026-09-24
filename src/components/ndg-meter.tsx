import type { NdgPeriodUsage, NdgSettingsDto } from "@/lib/services/ndg";
import { formatPeriodRange } from "@/lib/services/ndg";
import { NDG_STATUS, NdgStatusChip } from "@/components/ndg-status";
import { formatDate } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";

/**
 * Metr wykorzystania limitu: jedna liczba-bohater (procent), pasek z
 * wypełnieniem niosącym severity na jaśniejszym torze tej samej rampy oraz
 * znacznik progu ostrzeżenia, żeby było widać, gdzie zapala się alarm.
 */
export function NdgLimitMeter({
  period,
  settings,
}: {
  period: NdgPeriodUsage;
  settings: NdgSettingsDto;
}) {
  const style = NDG_STATUS[period.status];
  const percent = period.percent;
  const filled = percent === null ? 0 : Math.min(percent, 100);
  const overflow = percent !== null && percent > 100;

  return (
    <section className="card p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Wykorzystanie limitu · {period.label}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {formatPeriodRange(period)}
          </p>
        </div>
        <NdgStatusChip status={period.status} />
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-x-8 gap-y-3">
        <p
          className="text-6xl font-semibold leading-none text-slate-900"
          aria-label={
            percent === null
              ? "Wykorzystanie limitu nieznane"
              : `Wykorzystano ${percent} procent limitu`
          }
        >
          {percent === null ? "—" : `${percent.toFixed(1).replace(".", ",")}%`}
        </p>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-slate-500">Przychód w okresie</dt>
            <dd className="text-base font-semibold text-slate-900">
              {formatPLN(period.revenue)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Limit okresu</dt>
            <dd className="text-base font-semibold text-slate-900">
              {period.limit === null ? "nie podano" : formatPLN(period.limit)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">
              {period.remaining !== null && period.remaining < 0
                ? "Ponad limit"
                : "Pozostało"}
            </dt>
            <dd
              className="text-base font-semibold"
              style={{
                color:
                  period.remaining !== null && period.remaining < 0
                    ? "var(--color-status-critical)"
                    : undefined,
              }}
            >
              {period.remaining === null
                ? "—"
                : formatPLN(Math.abs(period.remaining))}
            </dd>
          </div>
        </dl>
      </div>

      <div className="relative">
        <div
          className="h-5 w-full overflow-hidden rounded-lg"
          style={{ backgroundColor: style.track }}
          role="img"
          aria-label={`Pasek wykorzystania limitu: ${
            percent === null ? "brak danych" : `${percent}%`
          }`}
        >
          <div
            className="h-full rounded-lg transition-[width]"
            style={{ width: `${filled}%`, backgroundColor: style.fill }}
          />
        </div>

        {/* Znacznik progu ostrzeżenia — widać, gdzie zapala się alarm. */}
        {period.limit !== null ? (
          <div
            className="absolute -top-1 bottom-0 w-px bg-slate-700"
            style={{ left: `${Math.min(settings.warnThresholdPercent, 100)}%` }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
        <span>0</span>
        {period.limit !== null ? (
          <span>
            próg ostrzeżenia {settings.warnThresholdPercent}%
            {overflow ? " · pasek pokazuje maksymalnie 100%" : ""}
          </span>
        ) : (
          <span>uzupełnij kwotę limitu w ustawieniach modułu</span>
        )}
        <span>{period.limit === null ? "limit" : formatPLN(period.limit)}</span>
      </div>

      {period.projection ? (
        <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Średnio dziennie
            </p>
            <p className="mt-0.5 font-semibold text-slate-900">
              {formatPLN(period.projection.dailyAverage)}
            </p>
            <p className="text-xs text-slate-500">
              po {period.projection.elapsedDays} z {period.projection.totalDays} dni
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Prognoza na koniec okresu
            </p>
            <p className="mt-0.5 font-semibold text-slate-900">
              {formatPLN(period.projection.projectedRevenue)}
            </p>
            <p className="text-xs text-slate-500">
              {period.projection.projectedPercent === null
                ? "brak limitu do porównania"
                : `${period.projection.projectedPercent.toFixed(0)}% limitu przy obecnym tempie`}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Limit wyczerpie się
            </p>
            <p className="mt-0.5 font-semibold text-slate-900">
              {period.projection.exhaustionDate
                ? formatDate(new Date(period.projection.exhaustionDate))
                : "nie w tym okresie"}
            </p>
            <p className="text-xs text-slate-500">
              przy tempie z bieżącego okresu
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
