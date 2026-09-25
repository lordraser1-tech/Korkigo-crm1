"use server";

import { requireActor } from "@/lib/auth";
import {
  createTelegramLink,
  disconnectTelegram,
} from "@/lib/services/reminders";
import { toActionState, type ActionState } from "@/lib/action-result";
import { revalidatePanels } from "./shared";

/** Generuje link zaproszenia do bota — do wysłania uczniowi ręcznie. */
export async function createTelegramLinkAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const studentId = formData.get("studentId");
    if (typeof studentId !== "string") throw new Error("Brak ucznia.");
    const link = await createTelegramLink(actor, studentId);
    revalidatePanels();
    return { ok: true, message: link.url };
  } catch (error) {
    return toActionState(error);
  }
}

export async function disconnectTelegramAction(
  formData: FormData
): Promise<void> {
  const actor = await requireActor();
  const studentId = formData.get("studentId");
  if (typeof studentId !== "string") throw new Error("Brak ucznia.");
  await disconnectTelegram(actor, studentId);
  revalidatePanels();
}
