/**
 * Middleware: CSP z nonce'em i limit rozmiaru ciała.
 *
 * Testujemy przez prawdziwy `NextRequest`, bo oba mechanizmy mają sens tylko
 * w kontekście nagłówków — sprawdzanie samych funkcji pomocniczych
 * przepuściłoby błąd w okablowaniu.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { resetRateLimits } from "@/lib/rate-limit";

function request(
  path: string,
  init: { method?: string; headers?: Record<string, string> } = {}
) {
  return new NextRequest(`https://crm.korkigo.pl${path}`, {
    method: init.method ?? "GET",
    headers: init.headers,
  });
}

const cspOf = (res: Response) => res.headers.get("content-security-policy") ?? "";
const nonceOf = (res: Response) => /'nonce-([a-f0-9]+)'/.exec(cspOf(res))?.[1] ?? null;

describe("CSP", () => {
  beforeEach(() => resetRateLimits());

  it("nie ma już 'unsafe-inline' w script-src", () => {
    const csp = cspOf(middleware(request("/login")));
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).toContain("'strict-dynamic'");
  });

  /** Stały nonce byłby ozdobnikiem — atakujący wkleiłby go we własny skrypt. */
  it("nonce jest inny przy każdej odpowiedzi", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i += 1) seen.add(nonceOf(middleware(request("/login")))!);
    expect(seen.size).toBe(20);
  });

  /**
   * Next dokleja nonce do swoich skryptów hydracji dopiero wtedy, gdy znajdzie
   * go w nagłówkach ŻĄDANIA. Ten sam nonce musi więc iść w obie strony —
   * inaczej przeglądarka odrzuciłaby całą hydrację.
   */
  it("ten sam nonce idzie do żądania i do odpowiedzi", () => {
    const res = middleware(request("/admin", { headers: { cookie: "korkigo_session=x" } }));
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonceOf(res));
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(cspOf(res));
  });

  it("obowiązuje też poza panelami — na logowaniu, stronie startowej i API", () => {
    for (const path of ["/", "/login", "/api/students", "/nie-ma-takiej-strony"]) {
      expect(cspOf(middleware(request(path))), path).toContain("nonce-");
    }
  });

  it("frame-ancestors dalej odcina osadzenie w cudzej ramce", () => {
    expect(cspOf(middleware(request("/login")))).toContain("frame-ancestors 'none'");
  });
});

describe("limit rozmiaru ciała", () => {
  beforeEach(() => resetRateLimits());

  const big = { "content-length": String(3 * 1024 * 1024), "content-type": "application/json" };

  it("odrzuca zbyt duże żądanie zapisu zanim ktokolwiek je sparsuje", async () => {
    const res = middleware(request("/api/students", { method: "POST", headers: big }));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  /** Akcje serwera idą na adres strony, nie na `/api` — też muszą być objęte. */
  it("obejmuje także akcje serwera w panelu", () => {
    const res = middleware(request("/admin/uczniowie", { method: "POST", headers: big }));
    expect(res.status).toBe(413);
  });

  it("zwykły formularz przechodzi bez zmian", () => {
    const res = middleware(
      request("/api/students", {
        method: "POST",
        headers: { "content-length": "900", "content-type": "application/json" },
      })
    );
    expect(res.status).not.toBe(413);
  });

  it("GET-a nie dotyczy, nawet z dziwnym nagłówkiem", () => {
    const res = middleware(request("/admin", { headers: { ...big, cookie: "korkigo_session=x" } }));
    expect(res.status).not.toBe(413);
  });
});

describe("odbicie niezalogowanych", () => {
  beforeEach(() => resetRateLimits());

  it("panel bez ciasteczka przekierowuje na logowanie z powrotem", () => {
    const res = middleware(request("/admin/uczniowie"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location")!;
    expect(location).toContain("/login");
    expect(location).toContain("next=%2Fadmin%2Fuczniowie");
  });

  it("logowanie i strona startowa zostają dostępne bez sesji", () => {
    for (const path of ["/login", "/"]) {
      expect(middleware(request(path)).status, path).not.toBe(307);
    }
  });
});
