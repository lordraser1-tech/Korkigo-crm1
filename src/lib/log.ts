/**
 * Logowanie błędów serwera.
 *
 * `console.error("Błąd API:", error)` wyrzucało do logu cały obiekt. Przy
 * Prismie to znaczy treść zapytania razem z wartościami — czyli imiona,
 * e-maile i telefony uczniów lądowały w logach hostingu, których nie obejmuje
 * nasza retencja ani umowa powierzenia. Stąd własny zapis: nazwa, kod,
 * skrócony komunikat i ślad stosu, a z komunikatu wycinamy to, co wygląda
 * na dane osobowe.
 *
 * Każdy wpis dostaje krótki identyfikator, który pokazujemy też użytkownikowi.
 * Dzięki temu zgłoszenie „wyskoczył błąd 7f3a9c" prowadzi do konkretnej linii
 * w logu i nie trzeba logować więcej, niż trzeba.
 */
/**
 * Identyfikator wpisu jest tylko do skojarzenia zgłoszenia z linią w logu —
 * nikt się nim nie uwierzytelnia, więc nie musi być kryptograficzny.
 * Świadomie nie bierzemy go z `node:crypto`: ten moduł wchodzi przez
 * `action-result.ts` także do paczki klienta, a tam `node:` się nie zbuduje.
 */
function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const MAX_MESSAGE = 300;
const MAX_STACK_FRAMES = 6;

/**
 * Wzorce danych osobowych w komunikatach. Celowo szerokie — wolimy zamazać
 * za dużo niż zostawić w logu adres opiekuna.
 */
const SCRUBBERS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail]"],
  // Tokeny PRZED numerami: wzorzec numeru łapie też cyfrowy ogon tokena
  // i zostawiał w logu jego czytelny początek.
  [/\b[A-Za-z0-9_-]{32,}\b/g, "[token]"],
  [/(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){9,}/g, "[numer]"],
];

/**
 * Z komunikatu bierzemy **tylko pierwszy wiersz**. Prisma dopisuje pod nim
 * całe zapytanie z wartościami pól — imię, nazwisko, adres opiekuna — a tego
 * żaden wzorzec nie wyłapie, bo imię wygląda jak zwykły wyraz. Pierwszy
 * wiersz („Invalid `prisma.student.create()` invocation") mówi, co się
 * zepsuło, i nie niesie ani jednej wartości.
 */
function summarize(message: string): string {
  let out = message.split("\n")[0].trim();
  for (const [pattern, replacement] of SCRUBBERS) out = out.replace(pattern, replacement);
  return out.length > MAX_MESSAGE ? `${out.slice(0, MAX_MESSAGE)}…` : out;
}

/**
 * Z `meta` Prismy bierzemy wyłącznie nazwy pól i tabel. To identyfikatory ze
 * schematu, nie dane użytkownika — reszta `meta` bywa wartością, która ten
 * błąd wywołała.
 */
function schemaHints(error: object): string | null {
  const meta = (error as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object") return null;
  const names: string[] = [];
  for (const key of ["target", "field_name", "model_name", "column_name"]) {
    const value = (meta as Record<string, unknown>)[key];
    if (typeof value === "string") names.push(value);
    else if (Array.isArray(value)) names.push(...value.filter((v) => typeof v === "string"));
  }
  return names.length ? `pola=${names.join(",")}` : null;
}

/** Same ramki („at …"), bez wierszy komunikatu, które Prisma wkleja na górę. */
function frames(stack: string): string | null {
  const lines = stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "))
    .slice(0, MAX_STACK_FRAMES);
  return lines.length ? lines.join(" <- ") : null;
}

/**
 * Zapisuje błąd i zwraca jego identyfikator do pokazania użytkownikowi.
 * Nigdy nie rzuca — log nie może przewrócić obsługi błędu, którą opisuje.
 */
export function logError(context: string, error: unknown): string {
  const id = shortId();
  try {
    const parts: string[] = [`[${id}] ${context}`];

    if (error instanceof Error) {
      parts.push(`${error.name}: ${summarize(error.message)}`);
      // Kod Prismy (P2002 itd.) niesie sens bez niesienia danych.
      const code = (error as { code?: unknown }).code;
      if (typeof code === "string") parts.push(`kod=${code}`);
      const hints = schemaHints(error);
      if (hints) parts.push(hints);
      if (error.stack) {
        const trace = frames(error.stack);
        if (trace) parts.push(trace);
      }
    } else {
      parts.push(`nie-Error: ${summarize(String(error))}`);
    }

    console.error(parts.join(" | "));
  } catch {
    console.error(`[${id}] ${context} | nie udało się opisać błędu`);
  }
  return id;
}
