"use server";

import { requireActor } from "@/lib/auth";
import { lessonStatusSchema } from "@/lib/validation";
import {
  createLessons,
  deleteFutureSeries,
  deleteLesson,
  setLessonStatus,
  updateLesson,
} from "@/lib/services/lessons";
import {
  formToObject,
  toActionState,
  type ActionState,
} from "@/lib/action-result";
import { revalidatePanels } from "./shared";

export async function createLessonsAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const created = await createLessons(actor, formToObject(formData) as never);
    revalidatePanels();
    return {
      ok: true,
      message:
        created.length === 1
          ? "Lekcja została dodana."
          : `Dodano ${created.length} lekcji cyklicznych.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function updateLessonAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const { id, ...rest } = formToObject(formData);
    if (typeof id !== "string") throw new Error("Brak identyfikatora lekcji.");
    await updateLesson(actor, id, rest as never);
    revalidatePanels();
    return { ok: true, message: "Zapisano zmiany w lekcji." };
  } catch (error) {
    return toActionState(error);
  }
}

/** Używane przez przyciski „Zrealizowana / Odwołana / Nieobecność”. */
export async function setLessonStatusAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  const status = lessonStatusSchema.parse(formData.get("status"));
  if (typeof id !== "string") throw new Error("Brak identyfikatora lekcji.");
  await setLessonStatus(actor, id, status);
  revalidatePanels();
}

export async function deleteLessonAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Brak identyfikatora lekcji.");
  await deleteLesson(actor, id);
  revalidatePanels();
}

export async function deleteSeriesAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const seriesId = formData.get("seriesId");
  if (typeof seriesId !== "string") throw new Error("Brak identyfikatora serii.");
  await deleteFutureSeries(actor, seriesId);
  revalidatePanels();
}
