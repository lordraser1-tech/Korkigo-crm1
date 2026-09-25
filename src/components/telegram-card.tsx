"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createTelegramLinkAction,
  disconnectTelegramAction,
} from "@/app/actions/reminders";
import { IDLE } from "@/lib/action-result";

function GenerateButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondary btn-sm" disabled={pending}>
      {pending ? "Generuję…" : "Wygeneruj link Telegram"}
    </button>
  );
}

/**
 * Połączenie konta Telegram ucznia. Link generujemy na żądanie i wysyłamy
 * uczniowi ręcznie — bot sam zapisze `chatId` po kliknięciu `/start`.
 */
export function TelegramCard({
  studentId,
  connected,
  canDisconnect,
}: {
  studentId: string;
  connected: boolean;
  canDisconnect: boolean;
}) {
  const [state, formAction] = useActionState(createTelegramLinkAction, IDLE);

  if (connected) {
    return (
      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <p className="font-medium">Telegram połączony ✓</p>
        {canDisconnect ? (
          <form action={disconnectTelegramAction} className="mt-2">
            <input type="hidden" name="studentId" value={studentId} />
            <button type="submit" className="btn-secondary btn-sm">
              Rozłącz
            </button>
          </form>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
      <p className="mb-2 text-slate-600">
        Uczeń nie połączył jeszcze Telegrama. Wyślij mu link — po kliknięciu bot
        zapisze połączenie automatycznie.
      </p>
      <form action={formAction}>
        <input type="hidden" name="studentId" value={studentId} />
        <GenerateButton />
      </form>
      {state.message ? (
        state.ok ? (
          <p className="mt-2 break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-700">
            {state.message}
          </p>
        ) : (
          <p className="mt-2 text-xs text-red-700">{state.message}</p>
        )
      ) : null}
    </div>
  );
}
