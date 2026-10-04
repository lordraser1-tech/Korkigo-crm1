import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";

export const SESSION_COOKIE = "korkigo_session";
/**
 * Ciasteczko etapu pośredniego: hasło się zgadza, ale czekamy na drugi
 * składnik. NIE daje dostępu do niczego — niesie tylko informację, kogo
 * dotyczy kod, i żyje krótko.
 */
export const PENDING_2FA_COOKIE = "korkigo_2fa";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 dni
const PENDING_2FA_SECONDS = 5 * 60;

export type SessionPayload = {
  userId: string;
  role: Role;
  /** Moment wydania tokenu — porównywany z `User.sessionsValidFrom`. */
  issuedAt?: Date;
};

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "AUTH_SECRET musi być ustawiony i mieć min. 32 znaki (patrz .env.example)."
    );
  }
  return new TextEncoder().encode(value);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string") return null;
    if (payload.role !== "ADMIN" && payload.role !== "TEACHER") return null;
    return {
      userId: payload.sub,
      role: payload.role,
      issuedAt: payload.iat ? new Date(payload.iat * 1000) : undefined,
    };
  } catch {
    return null;
  }
}

export async function createSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function readSessionCookie(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

// ---------- ETAP POŚREDNI DRUGIEGO SKŁADNIKA ----------

export async function createPendingTwoFactorCookie(userId: string): Promise<void> {
  const token = await new SignJWT({ purpose: "2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${PENDING_2FA_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_2FA_SECONDS,
  });
}

/** Identyfikator użytkownika czekającego na kod — albo `null`. */
export async function readPendingTwoFactor(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(PENDING_2FA_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    // Bez sprawdzenia `purpose` zwykłe ciasteczko sesji przeszłoby tą ścieżką.
    if (payload.purpose !== "2fa" || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export async function clearPendingTwoFactorCookie(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_2FA_COOKIE);
}
