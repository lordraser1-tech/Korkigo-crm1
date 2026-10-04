"use client";

import { useActionState } from "react";
import type { TwoFactorStatus } from "@/lib/services/two-factor";
import {
  confirmTwoFactorAction,
  disableTwoFactorAction,
  regenerateRecoveryCodesAction,
  startTwoFactorAction,
  type TwoFactorActionState,
} from "@/app/actions/two-factor";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Badge } from "@/components/ui";
import type { QrCode } from "@/lib/qr";

const IDLE_2FA: TwoFactorActionState = { ok: false };

/**
 * Kod QR przychodzi z serwera jako ścieżka SVG (`src/lib/qr.ts`) — tutaj
 * zostaje tylko oprawić go w elementy React. Tło rysujemy jawnie białe:
 * czytniki oczekują ciemnych modułów na jasnym tle, więc kod nie może
 * przejmować kolorów motywu.
 */
function QrImage({ qr }: { qr: QrCode }) {
  return (
    <svg
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      width={192}
      height={192}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Kod QR z konfiguracją drugiego składnika"
      className="rounded bg-white"
    >
      <rect width={qr.size} height={qr.size} fill="#ffffff" />
      <path d={qr.path} fill="#0f172a" />
    </svg>
  );
}

/** Kody zapasowe i sekret pokazujemy raz — stąd wyraźne ostrzeżenie. */
function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="mb-2 text-sm font-medium text-amber-900">
        Kody zapasowe — zapisz je teraz
      </p>
      <p className="mb-3 text-xs text-amber-800">
        Każdy działa jeden raz i zastępuje kod z aplikacji, gdy nie masz
        telefonu. Nie pokażemy ich ponownie — po zamknięciu tej strony zostaje
        tylko wygenerowanie nowych.
      </p>
      <ul className="grid grid-cols-2 gap-1.5 font-mono text-sm text-slate-900">
        {codes.map((code) => (
          <li key={code} className="rounded bg-white px-2 py-1 text-center">
            {code}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TwoFactorCard({ status }: { status: TwoFactorStatus }) {
  const [startState, startAction] = useActionState(startTwoFactorAction, IDLE_2FA);
  const [confirmState, confirmAction] = useActionState(
    confirmTwoFactorAction,
    IDLE_2FA
  );
  const [disableState, disableAction] = useActionState(
    disableTwoFactorAction,
    IDLE_2FA
  );
  const [codesState, codesAction] = useActionState(
    regenerateRecoveryCodesAction,
    IDLE_2FA
  );

  const setup = startState.secretForDisplay;

  return (
    <div className="card p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">
          Logowanie dwuetapowe
        </h2>
        {status.enabled ? (
          <Badge tone="green">włączone</Badge>
        ) : (
          <Badge tone="slate">wyłączone</Badge>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Oprócz hasła przy logowaniu trzeba podać kod z aplikacji
        (Google Authenticator, Aegis, 1Password). Samo wykradzione hasło
        przestaje wtedy wystarczać.
      </p>

      {status.enabled ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Pozostało kodów zapasowych:{" "}
            <strong>{status.unusedRecoveryCodes}</strong>
            {status.unusedRecoveryCodes <= 2 ? (
              <span className="mt-1 block text-amber-800">
                Zostało ich mało — wygeneruj nowy zestaw.
              </span>
            ) : null}
          </p>

          <form action={codesAction} className="space-y-2">
            <label className="label" htmlFor="codes-password">
              Hasło (żeby wygenerować nowe kody)
            </label>
            <input
              id="codes-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
            />
            <SubmitButton variant="secondary" small>
              Nowe kody zapasowe
            </SubmitButton>
            <FormMessage state={codesState} />
          </form>
          {codesState.recoveryCodes ? (
            <RecoveryCodes codes={codesState.recoveryCodes} />
          ) : null}

          <form action={disableAction} className="space-y-2 border-t border-slate-100 pt-4">
            <label className="label" htmlFor="disable-password">
              Hasło (żeby wyłączyć drugi składnik)
            </label>
            <input
              id="disable-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
            />
            <SubmitButton variant="danger" small>
              Wyłącz drugi składnik
            </SubmitButton>
            <FormMessage state={disableState} />
          </form>
        </div>
      ) : setup ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="mb-3 text-sm text-slate-700">
              1. Dodaj konto w aplikacji — zeskanuj ten kod:
            </p>
            {startState.qr ? (
              <div className="mb-3 flex justify-center">
                <QrImage qr={startState.qr} />
              </div>
            ) : null}
            <details className="text-sm text-slate-700">
              <summary className="cursor-pointer select-none">
                Nie mogę zeskanować — wpisz ręcznie
              </summary>
              <p className="mt-2 mb-1">Sekret do przepisania:</p>
              <p className="rounded bg-white px-2 py-1 text-center font-mono text-base tracking-widest text-slate-900">
                {setup}
              </p>
              <p className="mt-2 mb-1">
                Albo wklej cały adres (aplikacje na komputerze to przyjmują):
              </p>
              <p className="break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-600">
                {startState.uri}
              </p>
            </details>
          </div>

          <form action={confirmAction} className="space-y-2">
            <label className="label" htmlFor="confirm-code">
              2. Przepisz kod z aplikacji, żeby potwierdzić
            </label>
            <input
              id="confirm-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className="input font-mono tracking-widest"
              placeholder="123456"
            />
            <SubmitButton small>Włącz drugi składnik</SubmitButton>
            <FormMessage state={confirmState} />
          </form>
        </div>
      ) : (
        <div className="space-y-2">
          {confirmState.recoveryCodes ? (
            <>
              <FormMessage state={confirmState} />
              <RecoveryCodes codes={confirmState.recoveryCodes} />
            </>
          ) : (
            <form action={startAction}>
              <SubmitButton small>Rozpocznij konfigurację</SubmitButton>
              <FormMessage state={startState} />
            </form>
          )}
        </div>
      )}
    </div>
  );
}
