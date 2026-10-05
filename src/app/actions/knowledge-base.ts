"use server";

import { requireActor } from "@/lib/auth";
import {
  createKnowledgeEntry,
  deleteKnowledgeEntry,
  updateKnowledgeEntry,
} from "@/lib/services/knowledge-base";
import {
  formToObject,
  toActionState,
  type ActionState,
} from "@/lib/action-result";
import { revalidatePanels } from "./shared";

export async function createKnowledgeEntryAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const entry = await createKnowledgeEntry(actor, formToObject(formData) as never);
    revalidatePanels();
    return { ok: true, message: `Dodano „${entry.title}".` };
  } catch (error) {
    return toActionState(error);
  }
}

export async function updateKnowledgeEntryAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const id = formData.get("id");
    if (typeof id !== "string") {
      return { ok: false, message: "Brak identyfikatora materiału." };
    }
    await updateKnowledgeEntry(actor, id, formToObject(formData) as never);
    revalidatePanels();
    return { ok: true, message: "Zapisano." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteKnowledgeEntryAction(
  formData: FormData
): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Brak identyfikatora materiału.");
  await deleteKnowledgeEntry(actor, id);
  revalidatePanels();
}
