import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

/**
 * Cztery rzeczy przed wejściem do aplikacji:
 *
 * 1. Nagłówek CSP z jednorazowym nonce'em (patrz niżej).
 * 2. Limit zapytań na `/api/*`. Siedzi tutaj, a nie w poszczególnych trasach,
 *    żeby obejmował także te dopisane w przyszłości — o limicie w 28 miejscach
 *    prędzej czy później ktoś by zapomniał.
 * 3. Limit rozmiaru ciała żądania — też tutaj, z tego samego powodu.
 * 4. Szybkie odbicie niezalogowanych z paneli. Właściwa autoryzacja (rola,
 *    zakres danych) dzieje się w warstwie serwisowej — to tylko oszczędza
 *    puste renderowanie.
 */

/** Logowanie jest jedynym wejściem bez sesji, więc ma ostrzejszy limit. */
const LOGIN_RULE = { limit: 10, windowMs: 60_000 };
const API_RULE = { limit: 120, windowMs: 60_000 };

/**
 * Największe ciało żądania, jakie przyjmujemy. Aplikacja nie przyjmuje
 * plików — najcięższe, co wysyła formularz, to kilka kilobajtów tekstu —
 * więc 256 kB jest i tak z dużym zapasem. Bez tego progu żądanie na 3 MB
 * było wczytywane i parsowane w całości, a dopiero potem Zod odrzucał je za
 * zbyt długie imię; przy 120 żądaniach na minutę to darmowy sposób na
 * zajęcie pamięci serwera.
 */
const MAX_BODY_BYTES = 256 * 1024;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Zwraca odpowiedź 413, jeśli żądanie deklaruje zbyt duże ciało.
 *
 * Opieramy się na `Content-Length`, bo middleware nie może policzyć bajtów,
 * nie zjadając strumienia, który ma dopiero trafić do trasy. Nadawca piszący
 * „chunked" ten próg ominie — dlatego limit po stronie hostingu (patrz
 * README) zostaje drugą, niezależną barierą, a nie alternatywą.
 */
function tooLarge(request: NextRequest): NextResponse | null {
  if (!WRITE_METHODS.has(request.method)) return null;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared <= MAX_BODY_BYTES) return null;

  return NextResponse.json(
    { error: { code: "PAYLOAD_TOO_LARGE", message: "Żądanie jest zbyt duże." } },
    { status: 413 }
  );
}

/**
 * CSP z nonce'em zamiast `'unsafe-inline'`.
 *
 * Nonce musi być inny przy każdej odpowiedzi — stały zamieniłby ochronę
 * w ozdobnik — więc nagłówek powstaje tutaj, a nie w `next.config.ts`,
 * który potrafi tylko wartości stałe. Next czyta nonce z nagłówka ŻĄDANIA
 * i sam dokleja go do swoich skryptów hydracji; stąd ustawiamy go w obie
 * strony.
 *
 * `strict-dynamic` jest tu potrzebne: skrypt startowy Next-a dociąga kolejne
 * paczki dynamicznie, a one już nonce'a nie mają — dziedziczą zaufanie po nim.
 *
 * `style-src` zostaje z `'unsafe-inline'`: React wstawia style przez atrybut
 * `style`, którego nonce nie obejmuje. Ryzyko jest nieporównanie mniejsze niż
 * przy skryptach — stylem nie wykonasz kodu.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "connect-src 'self'",
    "font-src 'self' data:",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const oversized = tooLarge(request);
  if (oversized) return oversized;

  const nonce = crypto.randomUUID().replaceAll("-", "");
  const csp = buildCsp(nonce);

  /** Odpowiedź przepuszczająca żądanie dalej, z nonce'em widocznym dla Next-a. */
  const passThrough = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    const response = NextResponse.next({ request: { headers } });
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };

  if (pathname.startsWith("/api/")) {
    // Crona i webhooka Telegrama pomijamy: chroni je sekret, a pochodzą
    // z jednego adresu, więc wpadłyby we własny limit.
    const skip =
      pathname.startsWith("/api/cron/") || pathname.startsWith("/api/telegram/");
    if (skip) return passThrough();

    const isLogin = pathname === "/api/auth/login";
    const rule = isLogin ? LOGIN_RULE : API_RULE;
    const result = checkRateLimit(
      `${isLogin ? "login" : "api"}:${clientKey(request.headers)}`,
      rule
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Zbyt wiele zapytań. Spróbuj za chwilę.",
          },
        },
        {
          status: 429,
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        }
      );
    }
    return passThrough();
  }

  const needsSession =
    pathname.startsWith("/admin") || pathname.startsWith("/nauczyciel");
  if (needsSession && !request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return passThrough();
}

export const config = {
  /**
   * Wszystko poza plikami statycznymi — nagłówek CSP musi trafić na KAŻDĄ
   * stronę, także logowanie i 404, a nie tylko na panele.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
