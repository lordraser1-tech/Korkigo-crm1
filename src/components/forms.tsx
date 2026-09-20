"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { IDLE, type ActionState } from "@/lib/action-result";

export function SubmitButton({
  children,
  variant = "primary",
  small,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  small?: boolean;
}) {
  const { pending } = useFormStatus();
  const cls = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    danger: "btn-danger",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${cls} ${small ? "btn-sm" : ""}`}
    >
      {pending ? "Zapisywanie…" : children}
    </button>
  );
}

/** Przycisk do akcji nieodwracalnych — pyta o potwierdzenie przed wysłaniem. */
export function ConfirmButton({
  children,
  message,
  variant = "danger",
  small = true,
}: {
  children: ReactNode;
  message: string;
  variant?: "primary" | "secondary" | "danger";
  small?: boolean;
}) {
  const { pending } = useFormStatus();
  const cls = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    danger: "btn-danger",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      className={`${cls} ${small ? "btn-sm" : ""}`}
    >
      {children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <div
      role="status"
      className={`rounded-lg px-3 py-2 text-sm ${
        state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
      }`}
    >
      <p>{state.message}</p>
      {state.fieldErrors ? (
        <ul className="mt-1 list-inside list-disc text-xs">
          {Object.entries(state.fieldErrors).flatMap(([field, messages]) =>
            messages.map((msg) => <li key={`${field}-${msg}`}>{msg}</li>)
          )}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Formularz spięty z akcją serwerową: sam pokazuje komunikat zwrotny i — dla
 * formularzy dodawania — czyści pola po udanym zapisie.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  resetOnSuccess = false,
  className = "space-y-4",
  footer,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel: string;
  resetOnSuccess?: boolean;
  className?: string;
  footer?: ReactNode;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <FormMessage state={state} />
      <div className="flex items-center gap-2">
        <SubmitButton>{submitLabel}</SubmitButton>
        {footer}
      </div>
    </form>
  );
}

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  hint,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue">) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? undefined}
        placeholder={placeholder}
        required={required}
        className="input"
        {...rest}
      />
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  label,
  name,
  options,
  defaultValue,
  required,
  hint,
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string | null;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? undefined}
        required={required}
        className="input"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
