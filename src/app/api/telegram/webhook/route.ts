import { NextResponse } from "next/server";
import { connectTelegramByToken } from "@/lib/services/reminders";
import { AppError } from "@/lib/errors";

/**
 * Webhook bota Telegram. Obsługuje wyłącznie `/start <token>` — od tego
 * zaczyna uczeń, klikając link z profilu.
 *
 * Telegram podpisuje żądania nagłówkiem `X-Telegram-Bot-Api-Secret-Token`,
 * ustawianym przy rejestracji webhooka; bez zgodności z `TELEGRAM_WEBHOOK_SECRET`
 * nie ruszamy bazy.
 */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "Brak TELEGRAM_WEBHOOK_SECRET." } },
      { status: 503 }
    );
  }
  if (request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Nieprawidłowy sekret." } },
      { status: 401 }
    );
  }

  let payload: {
    message?: { text?: string; chat?: { id?: number | string } };
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ data: { ignored: true } });
  }

  const text = payload.message?.text?.trim() ?? "";
  const chatId = payload.message?.chat?.id;
  const match = /^\/start\s+(\S+)$/.exec(text);

  if (!match || chatId === undefined) {
    // Każda inna wiadomość nas nie interesuje — odpowiadamy 200, żeby
    // Telegram nie ponawiał w nieskończoność.
    return NextResponse.json({ data: { ignored: true } });
  }

  try {
    const result = await connectTelegramByToken(match[1], String(chatId));
    return NextResponse.json({ data: { connected: true, ...result } });
  } catch (error) {
    if (error instanceof AppError) {
      // Zły albo zużyty token to nie awaria — logujemy i kończymy 200.
      return NextResponse.json({ data: { connected: false, reason: error.message } });
    }
    throw error;
  }
}
