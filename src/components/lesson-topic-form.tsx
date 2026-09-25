"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { setLessonTopicAction } from "@/app/actions/lessons";
import { IDLE } from "@/lib/action-result";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary btn-sm" disabled={pending}>
      {pending ? "Zapisuję…" : "Zapisz"}
    </button>
  );
}

/**
 * Temat zajęć wpisywany przy samej lekcji — w kalendarzu i w kafelku grafiku.
 * Domyślnie zwinięty do jednej linijki, żeby nie zagracał listy.
 */
export function LessonTopicForm({
  lessonId,
  topic,
  compact = false,
}: {
  lessonId: string;
  topic: string | null;
  /** Wariant do wąskiej kolumny grafiku. */
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(setLessonTopicAction, IDLE);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-1 block max-w-full truncate text-left ${
          compact ? "text-[11px]" : "text-xs"
        } ${
          topic
            ? "text-slate-700 hover:text-brand-700 hover:underline"
            : "text-brand-700 hover:underline"
        }`}
        title={topic ?? "Dodaj temat zajęć"}
      >
        {topic ? `Temat: ${topic}` : "+ Dodaj temat"}
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-1.5 space-y-1">
      <input type="hidden" name="id" value={lessonId} />
      <input
        ref={inputRef}
        name="topic"
        defaultValue={topic ?? ""}
        autoFocus
        maxLength={200}
        placeholder="np. Czas przeszły — ćwiczenia"
        className="input px-2 py-1 text-xs"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <SaveButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-secondary btn-sm"
        >
          Anuluj
        </button>
        {state.message && !state.ok ? (
          <span className="text-[11px] text-red-700">{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}
