"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  setStudentRateAction,
  setTeacherRateAction,
} from "@/app/actions/subjects";
import { IDLE } from "@/lib/action-result";
import type { RateCell } from "@/lib/services/subjects";

function CellInput({ cell }: { cell: RateCell }) {
  const { pending } = useFormStatus();
  return (
    <input
      name="amount"
      inputMode="decimal"
      disabled={pending}
      defaultValue={cell.amount === null ? "" : cell.amount.toFixed(2)}
      placeholder="brak"
      aria-label={`Kwota: ${cell.label}`}
      className={`input w-24 px-2 py-1 text-sm ${
        cell.amount === null ? "border-amber-300 bg-amber-50" : ""
      }`}
    />
  );
}

/** Pojedyncza komórka macierzy — zapis po Enterze albo utracie skupienia. */
export function RateCellForm({
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
      className="flex items-center gap-1"
      // Zapis po wyjściu z pola — macierz bywa duża, klikanie „zapisz”
      // przy każdej komórce byłoby męczące.
      onBlur={(event) => {
        const form = event.currentTarget;
        if (!form.contains(event.relatedTarget as Node)) form.requestSubmit();
      }}
    >
      <input
        type="hidden"
        name={kind === "teacher" ? "teacherId" : "studentId"}
        value={ownerId}
      />
      <input type="hidden" name="subjectLevelId" value={cell.subjectLevelId} />
      <CellInput cell={cell} />
      {state.message && !state.ok ? (
        <span className="text-[11px] text-red-700" title={state.message}>
          !
        </span>
      ) : null}
    </form>
  );
}
