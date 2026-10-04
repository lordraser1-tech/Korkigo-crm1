/**
 * Kod QR jako dane dla SVG.
 *
 * Trzy decyzje warte zapamiętania:
 *
 * 1. Zwracamy ścieżkę (`path`), nie gotowy HTML. Projekt nie używa
 *    `dangerouslySetInnerHTML` i nie ma powodu zaczynać od kodu QR — komponent
 *    składa z tego zwykłe elementy React.
 * 2. Kod powstaje NA SERWERZE. Treść zawiera sekret TOTP, więc nie wysyłamy go
 *    do żadnej zewnętrznej usługi generującej obrazki ani nie liczymy
 *    w przeglądarce (biblioteka zostaje poza paczką klienta).
 * 3. Rysujemy zawsze ciemne moduły na białym tle, niezależnie od motywu.
 *    Odwrócony kontrast część czytników odrzuca, a to ma się zeskanować
 *    za pierwszym razem.
 */
import qrcode from "qrcode-generator";

/** Poziom korekcji błędów: „M" to standard dla otpauth i znosi lekkie zabrudzenia. */
const ERROR_CORRECTION = "M" as const;
/** Cicha strefa wymagana przez specyfikację — bez niej czytniki gubią kod. */
const QUIET_ZONE_MODULES = 4;

export type QrCode = {
  /** Rozmiar w modułach wraz z cichą strefą — gotowy na `viewBox`. */
  size: number;
  /** Ścieżka SVG ze wszystkimi ciemnymi modułami. */
  path: string;
};

export function createQrCode(text: string): QrCode {
  // `0` = biblioteka sama wybiera najmniejszą wersję mieszczącą dane.
  const qr = qrcode(0, ERROR_CORRECTION);
  qr.addData(text);
  qr.make();

  const modules = qr.getModuleCount();
  const size = modules + QUIET_ZONE_MODULES * 2;

  // Jedna ścieżka zamiast setek prostokątów — mniej węzłów w DOM i mniejszy HTML.
  const parts: string[] = [];
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (!qr.isDark(row, col)) continue;
      parts.push(
        `M${col + QUIET_ZONE_MODULES} ${row + QUIET_ZONE_MODULES}h1v1h-1z`
      );
    }
  }

  return { size, path: parts.join("") };
}
