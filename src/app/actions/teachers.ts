"use server";

import { requireActor } from "@/lib/auth";
import {
  changeOwnPassword,
  createAvailability,
  createTeacher,
  deleteAvailability,
  setTeacherPassword,
  updateTeacher,
} from "@/lib/services/teachers";
import {
  formToObject,
  toActionState,
  type ActionState,
} from "@/lib/action-result";
import { revalidatePanels } from "./shared";

export async function createTeacherAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const teacher = await createTeacher(actor, formToObject(formData) as never);
    revalidatePanels();
    return {
      ok: true,
      message: `Utworzono konto nauczyciela: ${teacher.fullName} (${teacher.email}).`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function updateTeacherAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const { id, active, ...rest } = formToObject(formData);
    if (typeof id !== "string") throw new Error("Brak identyfikatora nauczyciela.");
    const payload: Record<string, unknown> = { ...rest };
    if (active !== undefined) payload.active = active === "true" || active === "on";
    await updateTeacher(actor, id, payload as never);
    revalidatePanels();
    return { ok: true, message: "Zapisano zmiany." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function resetTeacherPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const id = formData.get("id");
    const password = formData.get("newPassword");
    if (typeof id !== "string" || typeof password !== "string") {
      throw new Error("Brak wymaganych danych.");
    }
    await setTeacherPassword(actor, id, password);
    return { ok: true, message: "Hasło nauczyciela zostało zmienione." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function changeOwnPasswordAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await changeOwnPassword(actor, formToObject(formData) as never);
    return { ok: true, message: "Hasło zostało zmienione." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function createAvailabilityAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await createAvailability(actor, formToObject(formData) as never);
    revalidatePanels();
    return { ok: true, message: "Dodano okno dyspozycyjności." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteAvailabilityAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Brak identyfikatora wpisu.");
  await deleteAvailability(actor, id);
  revalidatePanels();
}
