"use client";

import { useActionState, useEffect, useState } from "react";
import {
  saveLessonNoteAction,
  deleteLessonNoteAction,
} from "@/app/actions/lesson-notes";
import { IDLE } from "@/lib/action-result";
import type { LessonNoteDto } from "@/lib/services/lesson-notes";
import { ConfirmButton, FormMessage, SubmitButton } from "@/components/forms";

/**
 * Cztery pola szablonu w jednym miejscu. Etykiety i podpowiedzi stoją tutaj,
 * a nie przy każdym użyciu formularza — inaczej rozjechałyby się między
 * panelem nauczyciela a panelem admina.
 */
const FIELDS = [
  {
    name: "whatWeDid",
    label: "Co było na lekcji",
    placeholder: "np. czas przeszły — ćwiczenia, czytanie tekstu o pracy",
  },
  {
    name: "howItWent",
    label: "Jak poszło",
    placeholder: "np. dobrze z formami, gorzej z akcentem",
  },
  {
    name: "goal",
    label: "Cel",
    placeholder: "np. swobodna rozmowa o pracy do końca semestru",
  },
  {
    name: "nextSteps",
    label: "Co dalej",
    placeholder: "np. zadanie 4 i 5, powtórka słówek",
  },
] as const;

/** Notatka jako zwykły tekst — do wklejenia uczniowi w wiadomości. */
function asPlainText(values: Record<string, string>): string {
  return FIELDS.filter((field) => values[field.name]?.trim())
    .map((field) => `${field.label}:\n${values[field.name].trim()}`)
    .join("\n\n");
}

function CopyButton({ values }: { values: Record<string, string> }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = asPlainText(values);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Schowek bywa zablokowany (http, uprawnienia przeglądarki) — wtedy
      // zostaje zaznaczenie tekstu ręcznie i nie ma po co straszyć błędem.
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={copy} className="btn-secondary btn-sm">
      {copied ? "Skopiowano" : "Kopiuj notatkę"}
    </button>
  );
}

export function LessonNoteForm({
  lessonId,
  note,
  startOpen = false,
}: {
  lessonId: string;
  note: LessonNoteDto | null;
  startOpen?: boolean;
}) {
  const [state, formAction] = useActionState(saveLessonNoteAction, IDLE);
  const [open, setOpen] = useState(startOpen);
  /**
   * Po zapisie nowej notatki `note` z serwera jeszcze nie wrócił. Bez tego
   * znacznika formularz zwinąłby się z powrotem do „+ Dodaj notatkę" i przez
   * moment wyglądałby, jakby zapis się nie udał.
   */
  const [justSaved, setJustSaved] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => ({
    whatWeDid: note?.whatWeDid ?? "",
    howItWent: note?.howItWent ?? "",
    goal: note?.goal ?? "",
    nextSteps: note?.nextSteps ?? "",
  }));

  useEffect(() => {
    if (!state.ok) return;
    setOpen(false);
    setJustSaved(true);
  }, [state]);

  // Lekcja bez notatki pokazuje jeden przycisk, nie cztery pola. Przy liście
  // kilkunastu lekcji rozwinięte formularze są ścianą, przez którą nie da się
  // przewinąć do rzeczy, którą faktycznie chce się opisać.
  if (!open && note === null && !justSaved) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary btn-sm"
      >
        + Dodaj notatkę
      </button>
    );
  }

  if (!open) {
    return (
      <div className="space-y-3">
        <dl className="space-y-2">
          {FIELDS.filter((field) => values[field.name]?.trim()).map((field) => (
            <div key={field.name}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {field.label}
              </dt>
              <dd className="whitespace-pre-line text-sm text-slate-700">
                {values[field.name]}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-secondary btn-sm"
          >
            Edytuj
          </button>
          <CopyButton values={values} />
          <form action={deleteLessonNoteAction}>
            <input type="hidden" name="lessonId" value={lessonId} />
            <ConfirmButton
              message="Usunąć notatkę z tej lekcji?"
              variant="danger"
              small
            >
              Usuń
            </ConfirmButton>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="lessonId" value={lessonId} />
      {FIELDS.map((field) => (
        <div key={field.name}>
          <label className="label" htmlFor={`${lessonId}-${field.name}`}>
            {field.label}
          </label>
          <textarea
            id={`${lessonId}-${field.name}`}
            name={field.name}
            rows={2}
            maxLength={4000}
            placeholder={field.placeholder}
            className="input"
            value={values[field.name]}
            onChange={(event) =>
              setValues((prev) => ({ ...prev, [field.name]: event.target.value }))
            }
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton small>Zapisz notatkę</SubmitButton>
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
