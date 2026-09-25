"use server";

import { requireActor } from "@/lib/auth";
import {
  deleteMessage,
  markAllMessagesRead,
  markMessageRead,
  sendMessage,
} from "@/lib/services/messages";
import {
  formToObject,
  toActionState,
  type ActionState,
} from "@/lib/action-result";
import { revalidatePanels } from "./shared";

export async function sendMessageAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const message = await sendMessage(actor, formToObject(formData) as never);
    revalidatePanels();
    return {
      ok: true,
      message: message.broadcast
        ? `Wysłano do wszystkich nauczycieli (${message.recipients.length}).`
        : `Wysłano do: ${message.recipients[0]?.teacherName ?? "nauczyciela"}.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function markMessageReadAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Brak identyfikatora wiadomości.");
  await markMessageRead(actor, id);
  revalidatePanels();
}

export async function markAllMessagesReadAction(): Promise<void> {
  const actor = await requireActor();
  await markAllMessagesRead(actor);
  revalidatePanels();
}

export async function deleteMessageAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Brak identyfikatora wiadomości.");
  await deleteMessage(actor, id);
  revalidatePanels();
}
