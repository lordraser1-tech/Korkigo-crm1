import type { NextConfig } from "next";

/**
 * Nagłówki bezpieczeństwa.
 *
 * CSP **nie ma tutaj**, tylko w `src/middleware.ts`: nonce musi być inny
 * przy każdej odpowiedzi, a ten plik potrafi wyłącznie wartości stałe.
 * Tu zostaje to, co się nie zmienia.
 *
 * `X-Frame-Options: DENY` dubluje `frame-ancestors 'none'` z CSP — panel
 * z cenami i rozliczeniami nie ma powodu dać się osadzić w cudzej ramce,
 * a ten nagłówek obejmuje też odpowiedzi, których middleware nie dotyka.
 * HSTS włączamy dopiero na produkcji, żeby nie zablokować lokalnego http.
 */
const securityHeaders = [
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
