"use server";

import { requireActor } from "@/lib/auth";
import {
  createStudent,
  deleteStudent,
  updateStudent,
} from "@/lib/services/students";
import {
  formToObject,
  toActionState,
  type ActionState,
} from "@/lib/action-result";
import { revalidatePanels } from "./shared";

export async function createStudentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const input = formToObject(formData);
    // Nauczyciel nigdy nie przesyła stawki — a gdyby spróbował, serwis to odrzuci.
    const student = await createStudent(actor, input as never);
    revalidatePanels();
    return { ok: true, message: `Dodano ucznia: ${student.fullName}.` };
  } catch (error) {
    return toActionState(error);
  }
}

export async function updateStudentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const { id, ...rest } = formToObject(formData);
    if (typeof id !== "string") throw new Error("Brak identyfikatora ucznia.");
    await updateStudent(actor, id, rest as never);
    revalidatePanels();
    return { ok: true, message: "Zapisano zmiany." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteStudentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const id = formData.get("id");
    if (typeof id !== "string") throw new Error("Brak identyfikatora ucznia.");
    await deleteStudent(actor, id);
    revalidatePanels();
    return { ok: true, message: "Uczeń został usunięty." };
  } catch (error) {
    return toActionState(error);
  }
}
