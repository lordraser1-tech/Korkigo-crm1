"use server";

import { requireActor } from "@/lib/auth";
import { deletePayout, recordPayout } from "@/lib/services/payouts";
import {
  formToObject,
  toActionState,
  type ActionState,
} from "@/lib/action-result";
import { revalidatePanels } from "./shared";

export async function recordPayoutAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const payout = await recordPayout(actor, formToObject(formData) as never);
    revalidatePanels();
    return {
      ok: true,
      message: `Zapisano wypłatę ${payout.amount.toFixed(2)} zł (${payout.lessonCount} lekcji).`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deletePayoutAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Brak identyfikatora wypłaty.");
  await deletePayout(actor, id);
  revalidatePanels();
}
