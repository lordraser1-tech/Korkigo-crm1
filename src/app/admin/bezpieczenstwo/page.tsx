import Link from "next/link";
import type { SecurityEventType } from "@prisma/client";
import { requirePage } from "@/lib/auth";
import {
  SECURITY_LOG_DAYS,
  getSecuritySummary,
  listSecurityEvents,
} from "@/lib/services/security-log";
import {
  RETENTION_REVIEW_MONTHS,
  listRetentionCandidates,
} from "@/lib/services/privacy";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";

const LABEL: Record<SecurityEventType, string> = {
  LOGIN_OK: "Zalogowano",
  LOGIN_FAILED: "Nieudane logowanie",
  LOGIN_BLOCKED: "Próba na zablokowanym koncie",
  ACCOUNT_LOCKED: "Konto zablokowane",
  PASSWORD_CHANGED: "Zmiana hasła",
  PASSWORD_RESET: "Reset hasła przez admina",
  TEACHER_DEACTIVATED: "Konto nauczyciela wyłączone",
  TOTP_ENABLED: "Włączono drugi składnik",
  TOTP_DISABLED: "Wyłączono drugi składnik",
  TOTP_FAILED: "Zły kod drugiego składnika",
  RECOVERY_CODE_USED: "Użyto kodu zapasowego",
  STUDENT_ANONYMIZED: "Anonimizacja danych ucznia",
  STUDENT_EXPORTED: "Eksport danych ucznia",
};

const TONE: Record<SecurityEventType, "green" | "amber" | "red" | "slate"> = {
  LOGIN_OK: "green",
  LOGIN_FAILED: "amber",
  LOGIN_BLOCKED: "red",
  ACCOUNT_LOCKED: "red",
  PASSWORD_CHANGED: "slate",
  PASSWORD_RESET: "slate",
  TEACHER_DEACTIVATED: "slate",
  TOTP_ENABLED: "green",
  TOTP_DISABLED: "amber",
  TOTP_FAILED: "amber",
  RECOVERY_CODE_USED: "amber",
  STUDENT_ANONYMIZED: "slate",
  STUDENT_EXPORTED: "slate",
};

const FILTERS = [
  { key: "", label: "Wszystkie" },
  { key: "PODEJRZANE", label: "Tylko podejrzane" },
  { key: "LOGIN_OK", label: "Udane logowania" },
  { key: "PASSWORD_RESET", label: "Zmiany haseł" },
];

export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ filtr?: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { filtr } = await searchParams;

  const onlyFailures = filtr === "PODEJRZANE";
  const type =
    filtr && filtr !== "PODEJRZANE" && filtr in LABEL
      ? (filtr as SecurityEventType)
      : null;

  const [summary, events, retention] = await Promise.all([
    getSecuritySummary(actor),
    listSecurityEvents(actor, { type, onlyFailures, limit: 200 }),
    listRetentionCandidates(actor),
  ]);

  const alarm = summary.failedLast24h >= 20 || summary.lockedLast24h > 0;

  return (
    <>
      <PageHeader
        title="Bezpieczeństwo"
        description={`Logowania i zmiany haseł z ostatnich ${SECURITY_LOG_DAYS} dni.`}
      />

      {alarm ? (
        <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Zwiększona liczba nieudanych prób.</strong> Jeśli to nie Ty,
          sprawdź adresy poniżej. Konta blokują się same na 15 minut, więc samo
          zgadywanie hasła nic nie da — ale warto wiedzieć, że ktoś próbuje.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Nieudane próby"
          value={String(summary.failedLast24h)}
          hint="ostatnie 24 h"
        />
        <StatCard
          label="Blokady kont"
          value={String(summary.lockedLast24h)}
          hint="ostatnie 24 h"
        />
        <StatCard
          label="Udane logowania"
          value={String(summary.successfulLast24h)}
          hint="ostatnie 24 h"
        />
        <StatCard
          label="Konta w blokadzie"
          value={String(summary.lockedAccounts.length)}
          hint="w tej chwili"
        />
      </div>

      {summary.topOffenders.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            Adresy z największą liczbą nieudanych prób (24 h)
          </h2>
          <ul className="space-y-1.5 text-sm">
            {summary.topOffenders.map((row) => (
              <li
                key={row.ip}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <span className="font-mono text-slate-700">{row.ip}</span>
                <span className="font-medium text-slate-900">
                  {row.attempts} prób
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.lockedAccounts.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            Konta zablokowane w tej chwili
          </h2>
          <ul className="space-y-1.5 text-sm">
            {summary.lockedAccounts.map((row) => (
              <li
                key={row.email}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
              >
                <span className="text-slate-700">{row.email}</span>
                <span className="text-slate-500">
                  do {formatDateTime(new Date(row.until))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="mb-1 text-base font-semibold text-slate-900">
          Przegląd retencji danych
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Uczniowie ze statusem „Zakończony”, bez lekcji od co najmniej{" "}
          {RETENTION_REVIEW_MONTHS} miesięcy. Aplikacja{" "}
          <strong>nic nie kasuje sama</strong> — okres przechowywania zależy od
          podstawy prawnej i dokumentów księgowych, więc decyzję podejmujesz Ty.
        </p>
        {retention.length === 0 ? (
          <EmptyState>
            Nie ma uczniów kwalifikujących się do przeglądu.
          </EmptyState>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-2.5 text-left">Uczeń</th>
                  <th className="px-4 py-2.5 text-left">Ostatnia lekcja</th>
                  <th className="px-4 py-2.5 text-left">Od ilu miesięcy</th>
                  <th className="px-4 py-2.5 text-left">Rachunki</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {retention.map((row) => (
                  <tr key={row.studentId} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/uczniowie/${row.studentId}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {row.studentName}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {row.lastLessonAt
                        ? formatDate(new Date(row.lastLessonAt))
                        : "brak lekcji"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {row.monthsSinceLastLesson ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{row.invoices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {FILTERS.map((option) => {
            const active = (filtr ?? "") === option.key;
            return (
              <Link
                key={option.key || "all"}
                href={
                  option.key
                    ? `/admin/bezpieczenstwo?filtr=${option.key}`
                    : "/admin/bezpieczenstwo"
                }
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>

        {events.length === 0 ? (
          <EmptyState>Brak zdarzeń w tym filtrze.</EmptyState>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-2.5 text-left">Kiedy</th>
                  <th className="px-4 py-2.5 text-left">Zdarzenie</th>
                  <th className="px-4 py-2.5 text-left">Konto</th>
                  <th className="px-4 py-2.5 text-left">Adres IP</th>
                  <th className="px-4 py-2.5 text-left">Szczegóły</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                      {formatDateTime(new Date(event.createdAt))}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={TONE[event.type]}>{LABEL[event.type]}</Badge>
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {event.email ?? "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-600">
                      {event.ip ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {event.detail ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-xs text-slate-500">
        Wpisy starsze niż {SECURITY_LOG_DAYS} dni kasują się same — adres IP to
        dane osobowe i nie trzymamy ich bez potrzeby.
      </p>
    </>
  );
}
