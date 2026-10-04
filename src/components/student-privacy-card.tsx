"use client";

import { useActionState, useState } from "react";
import type { AnonymizationPreview } from "@/lib/services/privacy";
import { anonymizeStudentAction } from "@/app/actions/privacy";
import { IDLE } from "@/lib/action-result";
import { FormMessage, SubmitButton } from "@/components/forms";
import { formatDateTime } from "@/lib/datetime";

/**
 * Obsługa żądań RODO w karcie ucznia. Anonimizacja jest nieodwracalna, więc
 * jest schowana za rozwinięciem, wymaga powodu i pokazuje wprost, co zostanie.
 */
export function StudentPrivacyCard({
  studentId,
  preview,
}: {
  studentId: string;
  preview: AnonymizationPreview;
}) {
  const [state, formAction] = useActionState(anonymizeStudentAction, IDLE);
  const [confirmed, setConfirmed] = useState(false);

  if (preview.anonymizedAt) {
    return (
      <div className="card p-5">
        <h2 className="mb-1 text-base font-semibold text-slate-900">
          Dane osobowe
        </h2>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Dane tego ucznia zostały zanonimizowane{" "}
          {formatDateTime(new Date(preview.anonymizedAt))}. Rekordy finansowe
          zostały zachowane, ale nie wskazują już na osobę.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h2 className="mb-1 text-base font-semibold text-slate-900">
        Dane osobowe (RODO)
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Na żądanie ucznia albo opiekuna możesz wydać komplet danych lub je
        nadpisać.
      </p>

      <a
        href={`/api/students/${studentId}/eksport?pobierz=1`}
        className="btn-secondary inline-block"
      >
        Pobierz dane (JSON)
      </a>

      <details className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-red-800">
          Anonimizuj dane ucznia
        </summary>

        <p className="mt-3 text-xs text-red-800">
          Nadpiszemy imię, nazwisko, kontakty, dane opiekuna i snapshot nabywcy
          na rachunkach. <strong>Operacja jest nieodwracalna.</strong>
        </p>
        <p className="mt-2 text-xs text-red-800">
          Zostaną: {preview.lessons} lekcji, {preview.invoices} rachunków,{" "}
          {preview.payments} wpłat.
          {preview.keepsFinancialRecords
            ? " Rachunków nie usuwamy — to dokumenty księgowe z własnym okresem przechowywania."
            : ""}
        </p>

        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="studentId" value={studentId} />
          <label className="label" htmlFor={`reason-${studentId}`}>
            Powód (zostanie w dzienniku)
          </label>
          <input
            id={`reason-${studentId}`}
            name="reason"
            required
            className="input"
            placeholder="np. żądanie usunięcia danych z 04.10.2026"
          />
          <label className="flex items-start gap-2 text-xs text-red-800">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Rozumiem, że danych osobowych nie da się przywrócić.
          </label>
          {confirmed ? (
            <SubmitButton variant="danger" small>
              Anonimizuj nieodwracalnie
            </SubmitButton>
          ) : null}
          <FormMessage state={state} />
        </form>
      </details>
    </div>
  );
}
