/**
 * Treść przypomnień — JEDNO miejsce do edycji.
 *
 * Zmieniasz tekst tutaj i nigdzie indziej; logika wysyłki tylko podstawia
 * wartości. Nie wklejaj treści do adapterów ani do crona.
 */
export type ReminderVars = {
  firstName: string;
  subjectLabel: string;
  time: string;
  date: string;
  meetingLink: string | null;
};

export function buildReminderMessage(vars: ReminderVars): string {
  const base = `Cześć ${vars.firstName}! Przypominamy o lekcji ${vars.subjectLabel} jutro o ${vars.time}. Do zobaczenia!`;
  return vars.meetingLink ? `${base}\nLink: ${vars.meetingLink}` : base;
}

/** Ile godzin przed lekcją wysyłamy przypomnienie (okno dla crona). */
export const REMINDER_WINDOW_HOURS = { min: 23, max: 25 } as const;
