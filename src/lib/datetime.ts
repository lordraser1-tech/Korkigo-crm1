/**
 * Cała aplikacja działa w czasie lokalnym szkoły (Europa/Warszawa), a w bazie
 * trzyma UTC. Formularze wysyłają "ścienny" czas ("2026-09-20T16:00"), więc
 * konwersję robimy jawnie — bez polegania na strefie serwera.
 */
export const APP_TIME_ZONE = "Europe/Warsaw";

const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return asUtc - date.getTime();
}

/** "2026-09-20T16:00" (czas warszawski) -> Date w UTC. */
export function wallClockToUtc(value: string, timeZone = APP_TIME_ZONE): Date {
  const match = WALL_CLOCK_RE.exec(value.trim());
  if (!match) throw new Error(`Nieprawidłowy format daty i godziny: ${value}`);
  const [, y, m, d, hh, mm] = match;
  const naive = Date.UTC(+y, +m - 1, +d, +hh, +mm);

  // Dwie iteracje wystarczą, by trafić w poprawny offset także przy zmianie czasu.
  let utc = naive - zoneOffsetMs(new Date(naive), timeZone);
  utc = naive - zoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

/** Date -> "2026-09-20T16:00" do pola <input type="datetime-local">. */
export function toWallClockInput(date: Date, timeZone = APP_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: APP_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: APP_TIME_ZONE,
    dateStyle: "medium",
  }).format(date);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatWeekday(date: Date): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
  }).format(date);
}

/** "2026-09" -> zakres [od, do) obejmujący ten miesiąc w czasie warszawskim. */
export function monthRange(monthKey: string): { from: Date; to: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new Error(`Nieprawidłowy miesiąc: ${monthKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: wallClockToUtc(`${year}-${pad(month)}-01T00:00`),
    to: wallClockToUtc(`${nextYear}-${pad(nextMonth)}-01T00:00`),
  };
}

export function currentMonthKey(now = new Date()): string {
  return toWallClockInput(now).slice(0, 7);
}

export function formatMonthLabel(monthKey: string): string {
  const { from } = monthRange(monthKey);
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: APP_TIME_ZONE,
    month: "long",
    year: "numeric",
  }).format(from);
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addWeeks(date: Date, weeks: number): Date {
  return new Date(date.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
}

/**
 * Przesuwa "ścienny" czas o N tygodni zachowując godzinę lokalną — dzięki temu
 * lekcja cykliczna o 16:00 zostaje o 16:00 także po zmianie czasu.
 */
export function addWeeksToWallClock(value: string, weeks: number): string {
  const match = WALL_CLOCK_RE.exec(value.trim());
  if (!match) throw new Error(`Nieprawidłowy format daty i godziny: ${value}`);
  const [, y, m, d, hh, mm] = match;
  const shifted = new Date(Date.UTC(+y, +m - 1, +d + weeks * 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate()
  )}T${hh}:${mm}`;
}

// ---------- TYDZIEŃ (grafik) ----------

/** Poniedziałek tygodnia, w którym leży podana data ścienna "RRRR-MM-DD". */
export function weekStartKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // getUTCDay(): 0 = niedziela, więc poniedziałek to przesunięcie o (d+6)%7.
  const shift = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - shift);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}`;
}

export function currentWeekKey(now = new Date()): string {
  return weekStartKey(toWallClockInput(now).slice(0, 10));
}

export function shiftWeek(weekKey: string, delta: number): string {
  const [year, month, day] = weekKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + delta * 7));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}`;
}

/** Siedem dni tygodnia: klucz daty i dzień tygodnia zgodny ze schematem (0 = niedziela). */
export function weekDays(
  weekKey: string
): Array<{ dateKey: string; dayOfWeek: number }> {
  const [year, month, day] = weekKey.split("-").map(Number);
  const pad = (value: number) => String(value).padStart(2, "0");
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day + index));
    return {
      dateKey: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
        date.getUTCDate()
      )}`,
      dayOfWeek: date.getUTCDay(),
    };
  });
}

/** Zakres [od, do) tygodnia w UTC, licząc od północy czasu warszawskiego. */
export function weekRange(weekKey: string): { from: Date; to: Date } {
  return {
    from: wallClockToUtc(`${weekKey}T00:00`),
    to: wallClockToUtc(`${shiftWeek(weekKey, 1)}T00:00`),
  };
}

export function formatWeekLabel(weekKey: string): string {
  const days = weekDays(weekKey);
  const first = wallClockToUtc(`${days[0].dateKey}T12:00`);
  const last = wallClockToUtc(`${days[6].dateKey}T12:00`);
  return `${formatDate(first)} – ${formatDate(last)}`;
}

/**
 * Siatka miesiąca od poniedziałku: pełne tygodnie obejmujące dany miesiąc.
 * Dni z sąsiednich miesięcy zostają w siatce, żeby tydzień był kompletny.
 */
export function monthGridDays(
  monthKey: string
): Array<{ dateKey: string; inMonth: boolean }> {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  // getUTCDay(): 0 = niedziela, a tydzień zaczynamy w poniedziałek.
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month - 1, 1 - offset));

  const pad = (value: number) => String(value).padStart(2, "0");
  const days: Array<{ dateKey: string; inMonth: boolean }> = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate() + index
      )
    );
    days.push({
      dateKey: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
        date.getUTCDate()
      )}`,
      inMonth: date.getUTCMonth() === month - 1,
    });
    // Szósty tydzień rysujemy tylko wtedy, gdy miesiąc naprawdę w nim siedzi.
    if (index === 34 && !daySpillsOver(start, month)) break;
  }
  return days;
}

function daySpillsOver(start: Date, month: number): boolean {
  const day35 = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 35)
  );
  return day35.getUTCMonth() === month - 1;
}

/** "16:00" -> minuty od północy; do porównań okien dyspozycyjności. */
export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
