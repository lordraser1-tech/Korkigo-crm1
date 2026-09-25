"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  setStudentRateAction,
  setTeacherRateAction,
} from "@/app/actions/subjects";
import { IDLE } from "@/lib/action-result";
import type { RateCell } from "@/lib/services/subjects";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary btn-sm" disabled={pending}>
      {pending ? "…" : "Zapisz"}
    </button>
  );
}

function RateRow({
  kind,
  ownerId,
  cell,
}: {
  kind: "teacher" | "student";
  ownerId: string;
  cell: RateCell;
}) {
  const action = kind === "teacher" ? setTeacherRateAction : setStudentRateAction;
  const [state, formAction] = useActionState(action, IDLE);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-2 border-b border-slate-100 py-2 last:border-0"
    >
      <input
        type="hidden"
        name={kind === "teacher" ? "teacherId" : "studentId"}
        value={ownerId}
      />
      <input type="hidden" name="subjectLevelId" value={cell.subjectLevelId} />
      <span className="min-w-40 flex-1 text-sm text-slate-700">{cell.label}</span>
      <input
        name="amount"
        inputMode="decimal"
        defaultValue={cell.amount === null ? "" : cell.amount.toFixed(2)}
        placeholder="brak"
        className="input w-28 px-2 py-1 text-sm"
        aria-label={`Kwota: ${cell.label}`}
      />
      <span className="text-xs text-slate-400">zł</span>
      <SaveButton />
      {state.message ? (
        <span
          className={`text-xs ${state.ok ? "text-emerald-700" : "text-red-700"}`}
        >
          {state.ok ? "zapisano" : state.message}
        </span>
      ) : null}
    </form>
  );
}

/**
 * Edycja stawek jednego nauczyciela albo cen jednego ucznia — wiersz na każdy
 * przedmiot/poziom. Puste pole kasuje stawkę, a wtedy lekcji z tej kombinacji
 * nie da się zapisać.
 */
export function RateEditor({
  kind,
  ownerId,
  rates,
}: {
  kind: "teacher" | "student";
  ownerId: string;
  rates: RateCell[];
}) {
  if (rates.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nie ma jeszcze żadnego przedmiotu — dodaj go w zakładce „Przedmioty”.
      </p>
    );
  }

  return (
    <div>
      {rates.map((cell) => (
        <RateRow
          key={cell.subjectLevelId}
          kind={kind}
          ownerId={ownerId}
          cell={cell}
        />
      ))}
    </div>
  );
}
