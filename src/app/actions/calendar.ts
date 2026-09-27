"use server";

import { requireActor } from "@/lib/auth";
import {
  disconnectCalendar,
  setCalendarEnabled,
  syncCalendars,
} from "@/lib/services/calendar-sync";
import { toActionState, type ActionState } from "@/lib/action-result";
import { revalidatePanels } from "./shared";

export async function disconnectCalendarAction(
  formData: FormData
): Promise<void> {
  const actor = await requireActor();
  const teacherId = formData.get("teacherId");
  await disconnectCalendar(
    actor,
    typeof teacherId === "string" && teacherId ? teacherId : null
  );
  revalidatePanels();
}

export async function toggleCalendarAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const teacherId = formData.get("teacherId");
  await setCalendarEnabled(
    actor,
    formData.get("enabled") === "true",
    typeof teacherId === "string" && teacherId ? teacherId : null
  );
  revalidatePanels();
}

/**
 * „Wyślij teraz" — żeby nie czekać na crona przy pierwszym podłączeniu.
 * Nauczyciel wysyła wyłącznie swój kalendarz; admin może puścić wszystkie.
 */
export async function syncCalendarNowAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const requested = formData.get("teacherId");
    const scope =
      actor.role === "TEACHER"
        ? actor.teacherProfileId
        : typeof requested === "string" && requested
          ? requested
          : null;
    const result = await syncCalendars(50, scope);
    revalidatePanels();
    return {
      ok: true,
      message: `Zsynchronizowano: ${result.created} nowych, ${result.updated} zmienionych, ${result.deleted} usuniętych${
        result.failed > 0 ? `, błędów: ${result.failed}` : ""
      }.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}
