"use client";

import { useActionState, useState } from "react";
import { cancelLessonAction } from "@/app/actions/lessons";
import { IDLE } from "@/lib/action-result";
import { FormMessage, SubmitButton } from "@/components/forms";
import { CANCELLATION_TIERS, cancellationChargePercent } from "@/lib/policy";

/** Progi opisujemy z `policy.ts`, żeby zmiana regulaminu nie wymagała ruszania UI. */
function tierText(): string {
  return CANCELLATION_TIERS.map((tier, index) => {
    const upper = index === 0 ? null : CANCELLATION_TIERS[index - 1].minHoursBefore;
    if (upper === null) {
      return `${tier.minHoursBefore} h i wcześniej — ${tier.chargePercent}%`;
    }
    if (tier.minHoursBefore === 0) {
      return `poniżej ${upper} h — ${tier.chargePercent}%`;
    }
    return `${tier.minHoursBefore}–${upper} h — ${tier.chargePercent}%`;
  }).join(" · ");
}

/**
 * Odwołanie lekcji. Procent liczymy z godziny ZGŁOSZENIA, nie z chwili wpisania
 * do systemu — uczeń często dzwoni wcześniej, niż ktokolwiek siada do CRM-a.
 * Kwotę wolno skorygować wyłącznie adminowi i tylko z podanym powodem.
 */
export function CancelLessonForm({
  lessonId,
  scheduledAtWallClock,
  defaultReportedAt,
  isAdmin,
}: {
  lessonId: string;
  /**
   * Termin lekcji jako „RRRR-MM-DDTHH:MM” czasu warszawskiego. Podgląd
   * porównuje dwa czasy ścienne, więc wychodzi tak samo niezależnie od strefy
   * przeglądarki; ostateczne naliczenie i tak robi serwer.
   */
  scheduledAtWallClock: string;
  /** „RRRR-MM-DDTHH:MM” czasu warszawskiego — moment otwarcia formularza. */
  defaultReportedAt: string;
  isAdmin: boolean;
}) {
  const [state, formAction] = useActionState(cancelLessonAction, IDLE);
  const [reportedAt, setReportedAt] = useState(defaultReportedAt);
  const [override, setOverride] = useState(false);

  const percent = reportedAt
    ? cancellationChargePercent(
        new Date(scheduledAtWallClock),
        new Date(reportedAt)
      )
    : null;
  return (
    <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        Odwołaj lekcję
      </summary>

      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={lessonId} />

        <div>
          <label className="label" htmlFor={`reported-${lessonId}`}>
            Kiedy uczeń zgłosił odwołanie
          </label>
          <input
            id={`reported-${lessonId}`}
            name="reportedAt"
            type="datetime-local"
            className="input"
            value={reportedAt}
            onChange={(event) => setReportedAt(event.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            Domyślnie teraz. Cofnij, jeśli uczeń zgłosił się wcześniej —
            od tego zależy naliczenie.
          </p>
        </div>

        <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
          Regulamin: {tierText()}.
          {percent !== null ? (
            <span className="mt-1 block font-medium text-slate-800">
              Naliczenie: {percent}% ceny ucznia
            </span>
          ) : null}
        </p>

        {isAdmin ? (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={override}
                onChange={(event) => setOverride(event.target.checked)}
              />
              Skoryguj kwotę ręcznie
            </label>
            {override ? (
              <div className="space-y-2">
                <div>
                  <label className="label" htmlFor={`amount-${lessonId}`}>
                    Kwota do naliczenia (zł)
                  </label>
                  <input
                    id={`amount-${lessonId}`}
                    name="amount"
                    inputMode="decimal"
                    className="input"
                    placeholder="puste = kwota z regulaminu"
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`note-${lessonId}`}>
                    Powód korekty
                  </label>
                  <input
                    id={`note-${lessonId}`}
                    name="note"
                    className="input"
                    placeholder="np. uczeń chory, zgłoszenie mailem"
                    required
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Kwotę nalicza regulamin. Korektę może wprowadzić administrator.
          </p>
        )}

        <SubmitButton variant="secondary" small>
          Odwołaj lekcję
        </SubmitButton>
        <FormMessage state={state} />
      </form>
    </details>
  );
}
