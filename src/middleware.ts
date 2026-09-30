import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";

/**
 * Dwie rzeczy przed wejściem do aplikacji:
 *
 * 1. Limit zapytań na `/api/*`. Siedzi tutaj, a nie w poszczególnych trasach,
 *    żeby obejmował także te dopisane w przyszłości — o limicie w 28 miejscach
 *    prędzej czy później ktoś by zapomniał.
 * 2. Szybkie odbicie niezalogowanych z paneli. Właściwa autoryzacja (rola,
 *    zakres danych) dzieje się w warstwie serwisowej — to tylko oszczędza
 *    puste renderowanie.
 */

/** Logowanie jest jedynym wejściem bez sesji, więc ma ostrzejszy limit. */
const LOGIN_RULE = { limit: 10, windowMs: 60_000 };
const API_RULE = { limit: 120, windowMs: 60_000 };

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    // Crona i webhooka Telegrama pomijamy: chroni je sekret, a pochodzą
    // z jednego adresu, więc wpadłyby we własny limit.
    const skip =
      pathname.startsWith("/api/cron/") || pathname.startsWith("/api/telegram/");
    if (skip) return NextResponse.next();

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
    return NextResponse.next();
  }

  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/nauczyciel/:path*", "/api/:path*"],
};
