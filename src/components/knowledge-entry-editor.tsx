"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createKnowledgeEntryAction,
  deleteKnowledgeEntryAction,
  updateKnowledgeEntryAction,
} from "@/app/actions/knowledge-base";
import { IDLE } from "@/lib/action-result";
import type { KnowledgeEntryDto } from "@/lib/services/knowledge-base";
import { ConfirmButton, FormMessage, SubmitButton } from "@/components/forms";

/** Pola są te same przy dodawaniu i przy edycji — stąd jeden komponent. */
function EntryFields({ entry }: { entry?: KnowledgeEntryDto }) {
  const prefix = entry?.id ?? "nowy";
  return (
    <>
      <div>
        <label className="label" htmlFor={`${prefix}-title`}>
          Nazwa materiału <span className="text-red-500">*</span>
        </label>
        <input
          id={`${prefix}-title`}
          name="title"
          required
          maxLength={200}
          defaultValue={entry?.title}
          placeholder="np. Słownik PWN — odmiana przez przypadki"
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-url`}>
          Adres <span className="text-red-500">*</span>
        </label>
        <input
          id={`${prefix}-url`}
          name="url"
          type="url"
          required
          maxLength={2000}
          defaultValue={entry?.url}
          placeholder="https://…"
          className="input"
        />
        <p className="mt-1 text-xs text-slate-500">
          Przyjmujemy tylko adresy http:// i https://
        </p>
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-description`}>
          Opis (nieobowiązkowy)
        </label>
        <textarea
          id={`${prefix}-description`}
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={entry?.description}
          placeholder="Do czego to się przydaje i komu"
          className="input"
        />
      </div>
    </>
  );
}

export function NewKnowledgeEntryForm({ subjectId }: { subjectId: string }) {
  const [state, formAction] = useActionState(createKnowledgeEntryAction, IDLE);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary btn-sm"
      >
        + Dodaj materiał
      </button>
    );
  }

  return (
    <form action={formAction} className="card space-y-3 p-4">
      {/* Przedmiot bierze się z otwartej zakładki, nie z osobnego pola —
          nie da się więc przez pomyłkę wrzucić materiału nie tam. */}
      <input type="hidden" name="subjectId" value={subjectId} />
      <EntryFields />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton small>Dodaj</SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-secondary btn-sm"
        >
          Anuluj
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

/**
 * Materiał w panelu admina: albo podgląd z przyciskami, albo formularz na
 * pełną szerokość. Trzy pola wciśnięte w kolumnę obok tytułu były nie do
 * wypełnienia, więc edycja zastępuje kartę zamiast się w niej mieścić.
 */
export function KnowledgeEntryAdminCard({
  entry,
  children,
}: {
  entry: KnowledgeEntryDto;
  /** Podgląd materiału — składa go strona (komponent serwerowy). */
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(updateKnowledgeEntryAction, IDLE);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <li className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">{children}</div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="btn-secondary btn-sm"
            >
              Edytuj
            </button>
            <form action={deleteKnowledgeEntryAction}>
              <input type="hidden" name="id" value={entry.id} />
              <ConfirmButton message={`Usunąć „${entry.title}"?`}>
                Usuń
              </ConfirmButton>
            </form>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="card p-4">
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={entry.id} />
        <EntryFields entry={entry} />
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton small>Zapisz</SubmitButton>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-secondary btn-sm"
          >
            Anuluj
          </button>
        </div>
        <FormMessage state={state} />
      </form>
    </li>
  );
}
