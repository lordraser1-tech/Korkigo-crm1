import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Testy integracyjne uderzają w prawdziwą bazę — konfigurację bierzemy z .env.test.
if (existsSync(".env.test")) {
  for (const line of readFileSync(".env.test", "utf8").split("\n")) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
    if (match) process.env[match[1]] = match[2];
  }
}

/**
 * Bez bazy testy integracyjne były po cichu pomijane, a `npm test` kończył się
 * sukcesem — 7 przeszło, 119 pominiętych, kod wyjścia zero. CI mogło więc
 * raportować zielono, nie sprawdziwszy ani finansów, ani uprawnień
 * (audyt zewnętrzny, F30).
 *
 * Teraz brak `DATABASE_URL` to **twardy błąd konfiguracji**. Kto chce samych
 * testów bez bazy, mówi to wprost: `npm run test:unit`.
 */
if (!process.env.DATABASE_URL && process.env.KORKIGO_TESTY_BEZ_BAZY !== "1") {
  throw new Error(
    "Brak DATABASE_URL — testy integracyjne zostałyby po cichu pominięte.\n" +
      "  • pełny zestaw:  skopiuj .env.test.example do .env.test i wykonaj `npm run db:test:init`\n" +
      "  • same testy bez bazy: `npm run test:unit`"
  );
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Testy czyszczą te same tabele, więc muszą iść po kolei.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
