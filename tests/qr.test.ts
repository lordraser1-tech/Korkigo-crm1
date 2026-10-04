/**
 * Kod QR dla konfiguracji 2FA.
 *
 * Najważniejszy test tutaj nie sprawdza struktury SVG, a to, czy kod DA SIĘ
 * ODCZYTAĆ: rasteryzujemy macierz i puszczamy przez prawdziwy dekoder. Błędna
 * maska albo korekcja błędów daje kod, który czasem się skanuje, a czasem nie —
 * to najgorszy możliwy rodzaj awarii i trzeba go wykluczyć wprost.
 */
import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { createQrCode } from "@/lib/qr";
import { generateTotpSecret, totpUri } from "@/lib/totp";

/**
 * Macierz modułów -> piksele RGBA, których oczekuje dekoder.
 * Skalujemy, bo dekoder potrzebuje kilku pikseli na moduł, żeby znaleźć wzorce.
 */
function rasterize(
  path: string,
  size: number,
  scale = 6
): { data: Uint8ClampedArray; width: number; height: number } {
  const width = size * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  // Tło białe — ciemne moduły domalujemy niżej.
  data.fill(255);

  // Każdy moduł w ścieżce ma postać „M<col> <row>h1v1h-1z".
  for (const match of path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const col = Number(match[1]);
    const row = Number(match[2]);
    for (let y = row * scale; y < (row + 1) * scale; y += 1) {
      for (let x = col * scale; x < (col + 1) * scale; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 255;
      }
    }
  }
  return { data, width, height: width };
}

function decode(text: string): string | null {
  const qr = createQrCode(text);
  const { data, width, height } = rasterize(qr.path, qr.size);
  return jsQR(data, width, height)?.data ?? null;
}

describe("kod QR", () => {
  it("prawdziwy dekoder odczytuje z niego dokładnie ten adres otpauth", () => {
    const uri = totpUri("MRVUOBNNAPK5OUFFYXPNQPXKGAG5WQG4", "admin@korkigo.pl");
    expect(decode(uri)).toBe(uri);
  });

  it("odczytuje się dla wielu losowych sekretów", () => {
    // Różne sekrety dają różne długości po zakodowaniu — sprawdzamy, że
    // automatyczny dobór wersji kodu nie wysypuje się na żadnym z nich.
    for (let i = 0; i < 5; i += 1) {
      const uri = totpUri(generateTotpSecret(), `nauczyciel${i}@korkigo.pl`);
      expect(decode(uri)).toBe(uri);
    }
  });

  it("radzi sobie z długim adresem e-mail", () => {
    const uri = totpUri(
      generateTotpSecret(),
      "bardzo.dluga.nazwa.konta.nauczyciela@przykladowa-domena-korkigo.pl"
    );
    expect(decode(uri)).toBe(uri);
  });

  it("ma cichą strefę po każdej stronie", () => {
    const qr = createQrCode("test");
    const coords = [...qr.path.matchAll(/M(\d+) (\d+)h/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    const minX = Math.min(...coords.map(([x]) => x));
    const minY = Math.min(...coords.map(([, y]) => y));
    const maxX = Math.max(...coords.map(([x]) => x));
    const maxY = Math.max(...coords.map(([, y]) => y));

    // Bez cichej strefy czytniki gubią kod przy krawędzi ekranu.
    expect(minX).toBeGreaterThanOrEqual(4);
    expect(minY).toBeGreaterThanOrEqual(4);
    expect(qr.size - 1 - maxX).toBeGreaterThanOrEqual(4);
    expect(qr.size - 1 - maxY).toBeGreaterThanOrEqual(4);
  });

  it("rozmiar rośnie wraz z długością danych", () => {
    const krotki = createQrCode("abc");
    const dlugi = createQrCode("x".repeat(400));
    expect(dlugi.size).toBeGreaterThan(krotki.size);
  });

  it("zwraca dane do SVG, nie gotowy HTML", () => {
    // Projekt nie używa `dangerouslySetInnerHTML` — kod QR tego nie zmienia.
    const qr = createQrCode("test");
    expect(qr.path).not.toContain("<");
    expect(qr.path).toMatch(/^M[\dMhvz .-]+$/);
  });
});
