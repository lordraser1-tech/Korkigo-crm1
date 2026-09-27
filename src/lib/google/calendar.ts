/**
 * Zapis zdarzeń w kalendarzu Google.
 *
 * `GOOGLE_CALENDAR_PROVIDER=log` (domyślne) nie rusza sieci — zapamiętuje
 * wywołania w pamięci procesu, więc cały przepływ synchronizacji da się
 * przetestować bez konta Google. Wartość `google` włącza prawdziwe API.
 */
import { randomUUID } from "node:crypto";

export type CalendarEventInput = {
  summary: string;
  description: string;
  /** „RRRR-MM-DDTHH:MM" czasu ściennego — strefę podajemy osobno. */
  start: string;
  end: string;
  timeZone: string;
};

export type CalendarCall =
  | { action: "insert"; calendarId: string; event: CalendarEventInput; eventId: string }
  | { action: "patch"; calendarId: string; eventId: string; event: CalendarEventInput }
  | { action: "delete"; calendarId: string; eventId: string };

const recorded: CalendarCall[] = [];

/** Podgląd wywołań w trybie `log` — wyłącznie dla testów. */
export function recordedCalendarCalls(): readonly CalendarCall[] {
  return recorded;
}

export function resetRecordedCalendarCalls(): void {
  recorded.length = 0;
}

function provider(): string {
  return process.env.GOOGLE_CALENDAR_PROVIDER ?? "log";
}

function body(event: CalendarEventInput) {
  return {
    summary: event.summary,
    description: event.description,
    start: { dateTime: `${event.start}:00`, timeZone: event.timeZone },
    end: { dateTime: `${event.end}:00`, timeZone: event.timeZone },
  };
}

function eventsUrl(calendarId: string, eventId?: string): string {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId
  )}/events`;
  return eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
}

async function call(
  accessToken: string,
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  payload?: unknown
): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
}

export async function insertEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEventInput
): Promise<string> {
  if (provider() === "log") {
    const eventId = `log-${randomUUID()}`;
    recorded.push({ action: "insert", calendarId, event, eventId });
    return eventId;
  }

  const response = await call(accessToken, eventsUrl(calendarId), "POST", body(event));
  if (!response.ok) {
    throw new Error(`Google Calendar: zapis zdarzenia zwrócił ${response.status}.`);
  }
  const data = (await response.json()) as { id?: string };
  if (!data.id) throw new Error("Google Calendar nie zwrócił identyfikatora zdarzenia.");
  return data.id;
}

export async function patchEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: CalendarEventInput
): Promise<void> {
  if (provider() === "log") {
    recorded.push({ action: "patch", calendarId, eventId, event });
    return;
  }

  const response = await call(
    accessToken,
    eventsUrl(calendarId, eventId),
    "PATCH",
    body(event)
  );
  // Zdarzenie usunięte ręcznie w Google nie jest awarią — traktujemy je jak
  // nieistniejące i pozwalamy wyżej założyć je od nowa.
  if (response.status === 404 || response.status === 410) {
    throw new EventGoneError();
  }
  if (!response.ok) {
    throw new Error(`Google Calendar: aktualizacja zwróciła ${response.status}.`);
  }
}

export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  if (provider() === "log") {
    recorded.push({ action: "delete", calendarId, eventId });
    return;
  }

  const response = await call(accessToken, eventsUrl(calendarId, eventId), "DELETE");
  // 404/410 = zdarzenia już nie ma. Cel osiągnięty, nie zgłaszamy błędu.
  if (response.ok || response.status === 404 || response.status === 410) return;
  throw new Error(`Google Calendar: usunięcie zwróciło ${response.status}.`);
}

/** Zdarzenia nie ma już po stronie Google — trzeba założyć nowe. */
export class EventGoneError extends Error {
  constructor() {
    super("Zdarzenie nie istnieje już w kalendarzu Google.");
    this.name = "EventGoneError";
  }
}
