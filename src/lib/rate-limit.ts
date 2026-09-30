/**
 * Limit zapytań — okno przesuwne trzymane w pamięci procesu.
 *
 * ŚWIADOME OGRANICZENIE: licznik żyje w jednej instancji i zeruje się przy
 * restarcie. Dla jednego małego serwera to wystarcza i nie wymaga dokładania
 * Redisa. Jeżeli aplikacja stanie w kilku instancjach albo za CDN-em, włącz
 * dodatkowo limit po stronie hostingu — ten tutaj wtedy tylko uzupełnia.
 *
 * Blokada logowania (`login-guard.ts`) jest osobną, trwalszą warstwą: siedzi
 * w bazie, bo dotyczy konta, a nie adresu.
 */

type Bucket = { hits: number[]; };

const buckets = new Map<string, Bucket>();

/** Sprzątamy rzadko, przy okazji zapytań — bez osobnego timera. */
let lastSweep = Date.now();
const SWEEP_EVERY_MS = 60_000;

export type RateLimitRule = { limit: number; windowMs: number };

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    const alive = bucket.hits.filter((hit) => now - hit < windowMs);
    if (alive.length === 0) buckets.delete(key);
    else bucket.hits = alive;
  }
}

export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now = Date.now()
): RateLimitResult {
  sweep(now, rule.windowMs);

  const bucket = buckets.get(key) ?? { hits: [] };
  const hits = bucket.hits.filter((hit) => now - hit < rule.windowMs);

  if (hits.length >= rule.limit) {
    const oldest = hits[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((rule.windowMs - (now - oldest)) / 1000)
    );
    bucket.hits = hits;
    buckets.set(key, bucket);
    return { ok: false, retryAfterSeconds };
  }

  hits.push(now);
  bucket.hits = hits;
  buckets.set(key, bucket);
  return { ok: true, remaining: rule.limit - hits.length };
}

/** Do testów — stan jest globalny dla procesu. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}

/**
 * Adres klienta zza proxy. Bierzemy PIERWSZY wpis `x-forwarded-for`, bo to
 * adres klienta; kolejne dopisują pośrednicy. Gdy nagłówka nie ma (np. lokalnie),
 * wracamy do jednego wspólnego klucza — lepiej ograniczyć wszystkich niż nikogo.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "nieznany";
}
