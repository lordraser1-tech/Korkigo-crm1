import Link from "next/link";
import type { NdgPeriodUsage, NdgSettingsDto } from "@/lib/services/ndg";
import { NDG_STATUS } from "@/components/ndg-status";
import { formatDate } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";

/**
 * Pas na górze strony. Pojawia się, gdy wykorzystanie limitu sięga progu
 * obserwacji — a od progu ostrzeżenia (domyślnie 90%) krzyczy.
 */
export function NdgBanner({
  period,
  settings,
  href,
}: {
  period: NdgPeriodUsage;
  settings: NdgSettingsDto;
  /** Gdy pas stoi poza modułem NDG, prowadzi do niego linkiem. */
  href?: string;
}) {
  if (!settings.enabled) return null;
  if (period.status === "OK") return null;

  const style = NDG_STATUS[period.status];

  // Nagłówek niesie już etykietę statusu — komunikat jej nie powtarza.
  const message = {
    WATCH: `Wykorzystano ${period.percent?.toFixed(0)}% limitu — ${period.label}.`,
    WARNING: `Wykorzystano ${period.percent?.toFixed(0)}% limitu — ${period.label}.`,
    EXCEEDED: `${period.label}: przekroczono limit o ${formatPLN(
      Math.abs(period.remaining ?? 0)
    )}.`,
    UNKNOWN: "Nie podano kwoty limitu — moduł nie może go pilnować.",
    OK: "",
  }[period.status];

  const detail =
    period.status === "UNKNOWN"
      ? "Dodaj kwotę limitu miesięcznego w ustawieniach modułu, a zacznę liczyć wykorzystanie."
      : period.remaining !== null && period.remaining >= 0
        ? `Do wykorzystania zostało ${formatPLN(period.remaining)}${
            period.projection?.exhaustionDate
              ? ` — przy obecnym tempie limit wyczerpie się ${formatDate(
                  new Date(period.projection.exhaustionDate)
                )}.`
              : "."
          }`
        : "Sprawdź rozliczenie okresu z księgowym.";

  return (
    <div
      role={period.status === "EXCEEDED" ? "alert" : "status"}
      className={`mb-6 flex flex-wrap items-start gap-3 rounded-xl border p-4 ${style.tone} ${style.border} ${style.text}`}
    >
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={{ backgroundColor: style.fill, color: "#fff" }}
      >
        {style.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {style.label} · {message}
        </p>
        <p className="mt-0.5 text-sm opacity-90">{detail}</p>
      </div>
      {href ? (
        <Link href={href} className="btn-secondary btn-sm shrink-0">
          Otwórz moduł NDG
        </Link>
      ) : null}
    </div>
  );
}
