/**
 * Filtr ścieżki powrotu po zalogowaniu.
 *
 * Samo `startsWith("/")` NIE wystarcza: przeglądarka traktuje `//evil.pl`
 * i `/\evil.pl` jako adres bezwzględny, więc taki `?next=` wyprowadzałby
 * użytkownika z serwisu zaraz po podaniu hasła — gotowy scenariusz phishingowy
 * (ofiara loguje się naprawdę, a ląduje u atakującego).
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!value.startsWith("/")) return null;

  // Druga pozycja decyduje: „//" i „/\" to początek adresu bezwzględnego.
  const second = value[1];
  if (second === "/" || second === "\\") return null;

  // Znaki sterujące (w tym \n) potrafią rozciąć nagłówek Location.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  return value;
}
