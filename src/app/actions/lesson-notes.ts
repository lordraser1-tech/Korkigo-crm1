"use server";

import { requireActor } from "@/lib/auth";
import {
  deleteLessonNote,
  saveLessonNote,
} from "@/lib/services/lesson-notes";
import {
  formToObject,
  toActionState,
  type ActionState,
} from "@/lib/action-result";
import { revalidatePanels } from "./shared";

export async function saveLessonNoteAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const lessonId = formData.get("lessonId");
    if (typeof lessonId !== "string") {
      return { ok: false, message: "Brak identyfikatora lekcji." };
    }
    await saveLessonNote(actor, lessonId, formToObject(formData) as never);
    revalidatePanels();
    return { ok: true, message: "Notatka zapisana." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteLessonNoteAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const lessonId = formData.get("lessonId");
  if (typeof lessonId !== "string") throw new Error("Brak identyfikatora lekcji.");
  await deleteLessonNote(actor, lessonId);
  revalidatePanels();
}
