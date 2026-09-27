"use client";

import { useActionState } from "react";
import { syncCalendarNowAction } from "@/app/actions/calendar";
import { IDLE } from "@/lib/action-result";
import { FormMessage, SubmitButton } from "@/components/forms";

/** Ręczne wypchnięcie — przy pierwszym podłączeniu nikt nie chce czekać na crona. */
export function CalendarSyncButton({ teacherId }: { teacherId?: string }) {
  const [state, formAction] = useActionState(syncCalendarNowAction, IDLE);

  return (
    <div>
      <form action={formAction}>
        {teacherId ? <input type="hidden" name="teacherId" value={teacherId} /> : null}
        <SubmitButton variant="secondary" small>
          Wyślij teraz
        </SubmitButton>
      </form>
      <FormMessage state={state} />
    </div>
  );
}
