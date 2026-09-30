import type { NextConfig } from "next";

/**
 * Nagłówki bezpieczeństwa.
 *
 * Najważniejszy jest `frame-ancestors 'none'` — panel admina z cenami
 * i rozliczeniami nie ma powodu dać się osadzić w cudzej ramce (clickjacking).
 * HSTS włączamy dopiero na produkcji, żeby nie zablokować lokalnego http.
 *
 * `script-src` ma `'unsafe-inline'`, bo Next wstrzykuje inline'owe skrypty
 * hydracji bez nonce'a. To świadomy kompromis: CSP nadal odcina skrypty
 * z obcych domen, a sama aplikacja nie renderuje HTML-a od użytkownika
 * (React escapuje wszystko, nie używamy `dangerouslySetInnerHTML`).
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self' data:",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
