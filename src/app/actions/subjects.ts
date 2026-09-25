"use server";

import { requireActor } from "@/lib/auth";
import {
  createSubject,
  createSubjectLevel,
  deleteSubject,
  deleteSubjectLevel,
  setStudentRate,
  setTeacherRate,
  updateSubject,
  updateSubjectLevel,
} from "@/lib/services/subjects";
import {
  formToObject,
  toActionState,
  type ActionState,
} from "@/lib/action-result";
import { revalidatePanels } from "./shared";

export async function createSubjectAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const subject = await createSubject(actor, formToObject(formData) as never);
    revalidatePanels();
    return { ok: true, message: `Dodano przedmiot: ${subject.name}.` };
  } catch (error) {
    return toActionState(error);
  }
}

export async function createSubjectLevelAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const level = await createSubjectLevel(actor, formToObject(formData) as never);
    revalidatePanels();
    return { ok: true, message: `Dodano poziom: ${level.label}.` };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteSubjectAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Brak identyfikatora przedmiotu.");
  await deleteSubject(actor, id);
  revalidatePanels();
}

export async function deleteSubjectLevelAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Brak identyfikatora poziomu.");
  await deleteSubjectLevel(actor, id);
  revalidatePanels();
}

export async function toggleSubjectAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  const active = formData.get("active") === "true";
  if (typeof id !== "string") throw new Error("Brak identyfikatora przedmiotu.");
  await updateSubject(actor, id, { active });
  revalidatePanels();
}

export async function toggleSubjectLevelAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  const active = formData.get("active") === "true";
  if (typeof id !== "string") throw new Error("Brak identyfikatora poziomu.");
  await updateSubjectLevel(actor, id, { active });
  revalidatePanels();
}

/** Zapis jednej komórki macierzy stawek nauczycieli. */
export async function setTeacherRateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await setTeacherRate(actor, formToObject(formData) as never);
    revalidatePanels();
    return { ok: true, message: "Zapisano stawkę." };
  } catch (error) {
    return toActionState(error);
  }
}

/** Zapis jednej komórki macierzy cen uczniów. */
export async function setStudentRateAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await setStudentRate(actor, formToObject(formData) as never);
    revalidatePanels();
    return { ok: true, message: "Zapisano cenę." };
  } catch (error) {
    return toActionState(error);
  }
}
