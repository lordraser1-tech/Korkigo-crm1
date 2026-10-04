"use server";

import { requireActor } from "@/lib/auth";
import { anonymizeStudent } from "@/lib/services/privacy";
import { toActionState, type ActionState } from "@/lib/action-result";
import { revalidatePanels } from "./shared";

export async function anonymizeStudentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const studentId = formData.get("studentId");
    const reason = formData.get("reason");
    if (typeof studentId !== "string") throw new Error("Brak ucznia.");

    await anonymizeStudent(actor, studentId, typeof reason === "string" ? reason : "");
    revalidatePanels();
    return {
      ok: true,
      message:
        "Dane osobowe nadpisane. Lekcje i rachunki zostały — nie wskazują już na osobę.",
    };
  } catch (error) {
    return toActionState(error);
  }
}
