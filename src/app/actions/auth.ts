"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/password";
import {
  clearPendingTwoFactorCookie,
  clearSessionCookie,
  createPendingTwoFactorCookie,
  createSessionCookie,
  readPendingTwoFactor,
} from "@/lib/session";
import { loginSchema } from "@/lib/validation";
import { homePathFor } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";
import { clientKey } from "@/lib/rate-limit";
import {
  LOCK_MINUTES,
  checkLock,
  registerFailedLogin,
  registerSuccessfulLogin,
} from "@/lib/services/login-guard";
import { recordSecurityEvent } from "@/lib/services/security-log";
import {
  requiresSecondFactor,
  verifySecondFactor,
} from "@/lib/services/two-factor";
import { type ActionState, toActionState } from "@/lib/action-result";

// Stały hash porównawczy — nieistniejący e-mail kosztuje tyle samo czasu co zły
// login, więc odpowiedź nie zdradza, które konta istnieją.
const DUMMY_HASH_PROMISE = hashPassword("nieistniejace-konto-placeholder");

export async function loginAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let target: string;
  const requestHeaders = await headers();
  const ip = clientKey(requestHeaders);
  const userAgent = requestHeaders.get("user-agent");

  try {
    const data = loginSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const user = await prisma.user.findUnique({
      where: { email: data.email },
      select: {
        id: true,
        role: true,
        passwordHash: true,
        teacherProfile: { select: { active: true } },
      },
    });

    // Blokadę sprawdzamy PRZED porównaniem hasła, ale komunikat zostaje ten
    // sam dla nieistniejącego konta — nie podpowiadamy, które adresy istnieją.
    if (user && (await checkLock(user.id)).locked) {
      await recordSecurityEvent({
        type: "LOGIN_BLOCKED",
        userId: user.id,
        email: data.email,
        ip,
        userAgent,
      });
      return {
        ok: false,
        message: `Zbyt wiele nieudanych prób. Spróbuj ponownie za ${LOCK_MINUTES} minut.`,
      };
    }

    const hash = user?.passwordHash ?? (await DUMMY_HASH_PROMISE);
    const passwordOk = await verifyPassword(data.password, hash);

    if (!user || !passwordOk) {
      if (user && (await registerFailedLogin(user.id))) {
        await recordSecurityEvent({
          type: "ACCOUNT_LOCKED",
          userId: user.id,
          email: data.email,
          ip,
          userAgent,
        });
      }
      await recordSecurityEvent({
        type: "LOGIN_FAILED",
        userId: user?.id ?? null,
        email: data.email,
        ip,
        userAgent,
        detail: user ? null : "konto nie istnieje",
      });
      return { ok: false, message: "Nieprawidłowy e-mail lub hasło." };
    }
    if (user.role === "TEACHER" && !user.teacherProfile?.active) {
      return { ok: false, message: "Konto jest nieaktywne. Skontaktuj się z administratorem." };
    }

    await registerSuccessfulLogin(user.id);

    // Hasło się zgadza, ale przy włączonym drugim składniku to jeszcze nie
    // sesja — wydajemy krótkie ciasteczko etapu pośredniego i prosimy o kod.
    if (await requiresSecondFactor(user.id)) {
      await createPendingTwoFactorCookie(user.id);
      // `next` zostaje w formularzu po stronie klienta — nie ma potrzeby
      // przesyłać go tu i z powrotem.
      return { ok: true, step: "TWO_FACTOR" };
    }

    await recordSecurityEvent({
      type: "LOGIN_OK",
      userId: user.id,
      email: data.email,
      ip,
      userAgent,
    });
    await createSessionCookie({ userId: user.id, role: user.role });
    target = safeNextPath(formData.get("next")) ?? homePathFor(user.role);
  } catch (error) {
    return toActionState(error);
  }
  redirect(target);
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  await clearPendingTwoFactorCookie();
  redirect("/login");
}

/**
 * Drugi etap logowania: kod z aplikacji albo kod zapasowy.
 *
 * Tożsamość bierzemy z ciasteczka etapu pośredniego, nie z formularza — inaczej
 * dałoby się podać cudzy identyfikator i zalogować bez znajomości hasła.
 */
export async function verifyTwoFactorAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let target: string;
  const requestHeaders = await headers();
  const ip = clientKey(requestHeaders);
  const userAgent = requestHeaders.get("user-agent");

  try {
    const userId = await readPendingTwoFactor();
    if (!userId) {
      return {
        ok: false,
        message: "Sesja weryfikacji wygasła. Zaloguj się ponownie.",
      };
    }

    const code = formData.get("code");
    if (typeof code !== "string" || code.trim().length === 0) {
      return { ok: false, message: "Podaj kod." };
    }

    // Blokada liczy się także tutaj — inaczej drugi składnik byłby wygodnym
    // miejscem na zgadywanie szcześciocyfrowego kodu bez ograniczeń.
    if ((await checkLock(userId)).locked) {
      return {
        ok: false,
        message: `Zbyt wiele nieudanych prób. Spróbuj ponownie za ${LOCK_MINUTES} minut.`,
      };
    }

    const result = await verifySecondFactor(userId, code);
    if (!result.ok) {
      await registerFailedLogin(userId);
      await recordSecurityEvent({
        type: "TOTP_FAILED",
        userId,
        ip,
        userAgent,
      });
      return { ok: false, message: "Kod się nie zgadza." };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) return { ok: false, message: "Nie znaleziono konta." };

    await registerSuccessfulLogin(user.id);
    if (result.usedRecoveryCode) {
      await recordSecurityEvent({
        type: "RECOVERY_CODE_USED",
        userId: user.id,
        email: user.email,
        ip,
        userAgent,
      });
    }
    await recordSecurityEvent({
      type: "LOGIN_OK",
      userId: user.id,
      email: user.email,
      ip,
      userAgent,
      detail: result.usedRecoveryCode ? "kod zapasowy" : "drugi składnik",
    });

    await clearPendingTwoFactorCookie();
    await createSessionCookie({ userId: user.id, role: user.role });
    target = safeNextPath(formData.get("next")) ?? homePathFor(user.role);
  } catch (error) {
    return toActionState(error);
  }
  redirect(target);
}
