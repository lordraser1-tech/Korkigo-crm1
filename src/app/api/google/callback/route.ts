import { NextResponse } from "next/server";
import { finishCalendarConnect } from "@/lib/services/calendar-sync";

/**
 * Powrót z Google. Tożsamość bierzemy z podpisanego `state`, nie z sesji —
 * Google przekierowuje przeglądarkę i nie da się tu polegać na ciasteczku.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  const back = (status: string) =>
    NextResponse.redirect(
      new URL(`/nauczyciel/ustawienia?kalendarz=${status}`, request.url)
    );

  if (error) return back("odmowa");
  if (!code || !state) return back("blad");

  try {
    await finishCalendarConnect(state, code);
    return back("ok");
  } catch {
    return back("blad");
  }
}
