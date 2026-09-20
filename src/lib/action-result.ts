import { ZodError } from "zod";
import { AppError } from "@/lib/errors";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const IDLE: ActionState = { ok: false };

/** Zamienia wyjątek z warstwy serwisowej na komunikat dla formularza. */
export function toActionState(error: unknown): ActionState {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return {
      ok: false,
      message: "Popraw zaznaczone pola.",
      fieldErrors,
    };
  }
  if (error instanceof AppError) {
    return { ok: false, message: error.message };
  }
  console.error("Nieobsłużony błąd akcji:", error);
  return { ok: false, message: "Coś poszło nie tak. Spróbuj ponownie." };
}

/** FormData -> zwykły obiekt (puste stringi zostawiamy walidacji). */
export function formToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}
