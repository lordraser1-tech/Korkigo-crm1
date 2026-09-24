"use server";

import { requireActor } from "@/lib/auth";
import {
  createNdgLimit,
  deleteNdgLimit,
  updateNdgSettings,
} from "@/lib/services/ndg";
import {
  formToObject,
  toActionState,
  type ActionState,
} from "@/lib/action-result";
import { revalidatePanels } from "./shared";

export async function updateNdgSettingsAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const payload = formToObject(formData);
    // Checkbox nieodznaczony nie trafia do FormData — brak wartości to „wyłączone”.
    payload.enabled = formData.get("enabled") === "on" ? "true" : "false";
    const settings = await updateNdgSettings(actor, payload as never);
    revalidatePanels();
    return {
      ok: true,
      message: settings.enabled
        ? "Zapisano ustawienia. Pilnowanie limitu jest włączone."
        : "Zapisano ustawienia. Pilnowanie limitu wyłączone — moduł pokazuje same statystyki.",
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function createNdgLimitAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const limit = await createNdgLimit(actor, formToObject(formData) as never);
    revalidatePanels();
    return {
      ok: true,
      message: `Dodano limit ${limit.amount.toFixed(2)} zł obowiązujący od ${limit.validFromMonth}.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteNdgLimitAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Brak identyfikatora limitu.");
  await deleteNdgLimit(actor, id);
  revalidatePanels();
}
