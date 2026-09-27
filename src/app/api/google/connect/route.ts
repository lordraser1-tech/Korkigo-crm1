import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { apiHandler } from "@/lib/api";
import { startCalendarConnect } from "@/lib/services/calendar-sync";

/** Start zgody Google. Przekierowuje do Google z podpisanym `state`. */
export async function GET(request: Request) {
  const teacherId = new URL(request.url).searchParams.get("teacherId");
  try {
    const actor = await requireActor();
    const url = await startCalendarConnect(actor, teacherId);
    return NextResponse.redirect(url);
  } catch (error) {
    // Błąd konfiguracji pokazujemy jako zwykłą odpowiedź API, nie 500.
    return apiHandler(async () => {
      throw error;
    });
  }
}
