import { NextResponse } from "next/server";
import { runReminderBatch } from "@/lib/services/reminders";

/**
 * Wysyłka przypomnień — odpalana co godzinę przez cron hostingu.
 *
 * Endpoint nie ma sesji, więc chroni go sekret: bez poprawnego nagłówka
 * `Authorization: Bearer <CRON_SECRET>` nie robi nic. Brak `CRON_SECRET`
 * w środowisku blokuje endpoint całkowicie — lepiej nie wysłać nic, niż
 * zostawić otwartą furtkę do masowej wysyłki.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Brak CRON_SECRET." } },
      { status: 503 }
    );
  }

  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nieprawidłowy sekret." } },
      { status: 401 }
    );
  }

  const result = await runReminderBatch();
  return NextResponse.json({ data: result });
}
