/**
 * OAuth Google — wyłącznie wymiana kodu i odświeżanie tokenu.
 *
 * Klucze czytamy tylko ze zmiennych środowiskowych. Brak konfiguracji nie
 * wywala aplikacji: funkcje zwracają czytelny błąd, a moduł kalendarza
 * pokazuje, czego brakuje.
 */
import { ValidationError } from "@/lib/errors";

/** Zakres celowo minimalny: dopisujemy zdarzenia, nie czytamy cudzych danych. */
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function requireGoogleConfig(): GoogleConfig {
  const config = googleConfig();
  if (!config) {
    throw new ValidationError(
      "Brak konfiguracji Google (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)."
    );
  }
  return config;
}

/**
 * Adres zgody. `state` wiąże powrót z konkretnym nauczycielem —
 * `prompt=consent` i `access_type=offline` są konieczne, żeby Google w ogóle
 * wydał `refresh_token`.
 */
export function authorizationUrl(state: string): string {
  const config = requireGoogleConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: SCOPES.join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
};

async function tokenRequest(
  body: Record<string, string>
): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new ValidationError(
      `Google odrzucił żądanie tokenu (${response.status}): ${detail.slice(0, 200)}`
    );
  }
  return response.json();
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  const config = requireGoogleConfig();
  const data = await tokenRequest({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const config = requireGoogleConfig();
  const data = await tokenRequest({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });
  return {
    accessToken: data.access_token,
    // Przy odświeżaniu Google zwykle nie przysyła nowego refresh tokenu.
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/** Adres konta, które właśnie podłączono — do pokazania w ustawieniach. */
export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    throw new ValidationError("Nie udało się odczytać adresu konta Google.");
  }
  const data = (await response.json()) as { email?: string };
  return data.email ?? "(nieznany adres)";
}
