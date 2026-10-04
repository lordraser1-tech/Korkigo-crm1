"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, verifyTwoFactorAction } from "@/app/actions/auth";
import { IDLE } from "@/lib/action-result";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function Alert({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

/** Drugi etap: kod z aplikacji albo kod zapasowy. */
function TwoFactorStep({ next }: { next: string | null }) {
  const [state, formAction] = useActionState(verifyTwoFactorAction, IDLE);

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Hasło się zgadza. Podaj teraz kod z aplikacji uwierzytelniającej.
        Jeśli nie masz telefonu pod ręką, wpisz jeden z kodów zapasowych.
      </p>
      <div>
        <label className="label" htmlFor="code">
          Kod
        </label>
        <input
          id="code"
          name="code"
          /* `text`, nie `number` — kody zapasowe mają litery i myślnik. */
          type="text"
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
          required
          className="input font-mono tracking-widest"
          placeholder="123456"
        />
      </div>
      {state.message ? <Alert message={state.message} /> : null}
      <SubmitButton label="Potwierdź" pendingLabel="Sprawdzam…" />
      <p className="text-center text-xs text-slate-500">
        <a href="/login" className="underline">
          Zacznij logowanie od nowa
        </a>
      </p>
    </form>
  );
}

export function LoginForm({ next }: { next: string | null }) {
  const [state, formAction] = useActionState(loginAction, IDLE);

  if (state.step === "TWO_FACTOR") return <TwoFactorStep next={next} />;

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label className="label" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          placeholder="nauczyciel@korkigo.pl"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Hasło
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </div>
      {state.message ? <Alert message={state.message} /> : null}
      <SubmitButton label="Zaloguj się" pendingLabel="Logowanie…" />
    </form>
  );
}
