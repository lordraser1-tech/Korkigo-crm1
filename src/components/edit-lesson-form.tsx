"use client";

import { useActionState } from "react";
import { updateLessonAction } from "@/app/actions/lessons";
import { IDLE } from "@/lib/action-result";
import { FormMessage, SubmitButton } from "@/components/forms";

/**
 * Zmiana terminu lekcji. Przy lekcji z serii pytamy o zakres: „tylko ta”
 * odczepia ją od serii, „ta i kolejne” przesuwa następne o tę samą różnicę
 * (lekcje ujęte na rachunku zostają nietknięte — pilnuje tego serwis).
 */
export function EditLessonForm({
  lessonId,
  scheduledAtWallClock,
  durationMinutes,
  inSeries,
}: {
  lessonId: string;
  scheduledAtWallClock: string;
  durationMinutes: number;
  inSeries: boolean;
}) {
  const [state, formAction] = useActionState(updateLessonAction, IDLE);

  return (
    <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        Zmień termin
      </summary>

      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={lessonId} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`when-${lessonId}`}>
              Termin
            </label>
            <input
              id={`when-${lessonId}`}
              name="scheduledAt"
              type="datetime-local"
              className="input"
              defaultValue={scheduledAtWallClock}
            />
          </div>
          <div>
            <label className="label" htmlFor={`duration-${lessonId}`}>
              Czas trwania (min)
            </label>
            <input
              id={`duration-${lessonId}`}
              name="durationMinutes"
              type="number"
              min={15}
              max={480}
              step={5}
              className="input"
              defaultValue={durationMinutes}
            />
          </div>
        </div>

        {inSeries ? (
          <fieldset className="space-y-1.5">
            <legend className="label">Zakres zmiany</legend>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="scope" value="ONE" defaultChecked />
              Tylko ta lekcja
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="scope" value="FUTURE" />
              Ta i kolejne lekcje serii
            </label>
          </fieldset>
        ) : (
          <input type="hidden" name="scope" value="ONE" />
        )}

        <SubmitButton variant="secondary" small>
          Zapisz termin
        </SubmitButton>
        <FormMessage state={state} />
      </form>
    </details>
  );
}
