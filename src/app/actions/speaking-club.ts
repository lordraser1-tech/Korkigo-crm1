"use server";

import { requireActor } from "@/lib/auth";
import { undoSpeakingClub, redeemSpeakingClub } from "@/lib/services/speaking-club";
import {
  formToObject,
  toActionState,
  type ActionState,
} from "@/lib/action-result";
import { revalidatePanels } from "./shared";

export async function redeemSpeakingClubAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const club = await redeemSpeakingClub(actor, formToObject(formData) as never);
    revalidatePanels();
    return {
      ok: true,
      message: `Zapisano udział. Pozostało dostępnych: ${club.available}.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function undoSpeakingClubAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Brak identyfikatora wpisu.");
  await undoSpeakingClub(actor, id);
  revalidatePanels();
}
