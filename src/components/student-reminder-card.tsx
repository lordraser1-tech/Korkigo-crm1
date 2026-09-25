import type { ReminderChannel } from "@prisma/client";
import { TelegramCard } from "@/components/telegram-card";
import { REMINDER_WINDOW_HOURS } from "@/lib/reminders/template";

/**
 * Stan przypomnień ucznia. Kanał wybiera się w formularzu obok — tutaj widać,
 * czy wybrany kanał w ogóle zadziała (Telegram wymaga połączenia przez bota,
 * SMS numeru telefonu).
 */
export function StudentReminderCard({
  student,
  canDisconnect,
}: {
  student: {
    id: string;
    contactPhone: string | null;
    reminderChannel: ReminderChannel;
    telegramConnected: boolean;
  };
  canDisconnect: boolean;
}) {
  return (
    <div className="card p-5">
      <h2 className="mb-1 text-base font-semibold text-slate-900">
        Przypomnienia o lekcji
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Wysyłamy jedno przypomnienie na lekcję, {REMINDER_WINDOW_HOURS.min}–
        {REMINDER_WINDOW_HOURS.max} godzin przed jej rozpoczęciem.
      </p>

      {student.reminderChannel === "NONE" ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Przypomnienia są wyłączone. Wybierz kanał w danych ucznia, żeby je
          włączyć.
        </p>
      ) : null}

      {student.reminderChannel === "SMS" && !student.contactPhone ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Wybrano SMS, ale uczeń nie ma numeru telefonu — przypomnienie nie
          zostanie wysłane.
        </p>
      ) : null}

      {student.reminderChannel === "TELEGRAM" && !student.telegramConnected ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Uczeń nie połączył jeszcze Telegrama — przypomnienia nie dojdą,
          dopóki nie kliknie linku poniżej.
        </p>
      ) : null}

      {student.reminderChannel !== "SMS" ? (
        <TelegramCard
          studentId={student.id}
          connected={student.telegramConnected}
          canDisconnect={canDisconnect}
        />
      ) : null}
    </div>
  );
}
