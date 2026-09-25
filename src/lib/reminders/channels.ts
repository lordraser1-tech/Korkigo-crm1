/**
 * Adaptery kanałów przypomnień.
 *
 * Klucze API czytamy wyłącznie ze zmiennych środowiskowych — nigdy z kodu.
 * Brak konfiguracji nie wywala wysyłki: adapter zwraca czytelny błąd, który
 * trafia do `ReminderLog`, więc admin widzi, czego brakuje.
 */

export type SendResult = { ok: true } | { ok: false; error: string };

export type ReminderTarget = {
  telegramChatId: string | null;
  phone: string | null;
};

async function sendTelegram(
  target: ReminderTarget,
  message: string
): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "Brak TELEGRAM_BOT_TOKEN w środowisku." };
  if (!target.telegramChatId) {
    return { ok: false, error: "Uczeń nie połączył jeszcze Telegrama." };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: target.telegramChatId,
          text: message,
        }),
      }
    );
    if (!response.ok) {
      return { ok: false, error: `Telegram odpowiedział ${response.status}.` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Błąd wysyłki Telegram.",
    };
  }
}

/**
 * SMS przez dostawcę wskazanego w `SMS_PROVIDER`. Domyślnie „log” — zapisuje
 * treść do logów zamiast wysyłać, żeby dało się przetestować cały przepływ
 * bez płatnego konta.
 */
async function sendSms(
  target: ReminderTarget,
  message: string
): Promise<SendResult> {
  if (!target.phone) return { ok: false, error: "Uczeń nie ma numeru telefonu." };

  const provider = process.env.SMS_PROVIDER ?? "log";
  if (provider === "log") {
    console.info(`[SMS → ${target.phone}] ${message}`);
    return { ok: true };
  }

  const token = process.env.SMS_API_TOKEN;
  const from = process.env.SMS_SENDER ?? "KorkiGO";
  if (!token) return { ok: false, error: "Brak SMS_API_TOKEN w środowisku." };

  // SMSAPI.pl — REST, autoryzacja tokenem Bearer.
  if (provider === "smsapi") {
    try {
      const response = await fetch("https://api.smsapi.pl/sms.do?format=json", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          to: target.phone,
          from,
          message,
          encoding: "utf-8",
        }),
      });
      if (!response.ok) {
        return { ok: false, error: `Dostawca SMS odpowiedział ${response.status}.` };
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Błąd wysyłki SMS.",
      };
    }
  }

  return { ok: false, error: `Nieznany dostawca SMS: ${provider}.` };
}

export async function sendReminder(
  channel: "TELEGRAM" | "SMS",
  target: ReminderTarget,
  message: string
): Promise<SendResult> {
  return channel === "TELEGRAM"
    ? sendTelegram(target, message)
    : sendSms(target, message);
}
