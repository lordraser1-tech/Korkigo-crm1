import { NextResponse } from "next/server";
import { syncCalendars } from "@/lib/services/calendar-sync";

/**
 * Wypchnięcie zmian do kalendarzy Google — odpalane przez cron hostingu.
 *
 * Ten sam sekret co przypomnienia; bez niego endpoint jest zamknięty, bo
 * chodzi o zapis do cudzych kalendarzy.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Brak CRON_SECRET." } },
      { status: 503 }
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nieprawidłowy sekret." } },
      { status: 401 }
    );
  }

  return NextResponse.json({ data: await syncCalendars() });
}
