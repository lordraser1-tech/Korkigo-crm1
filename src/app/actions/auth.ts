"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/password";
import { createSessionCookie, clearSessionCookie } from "@/lib/session";
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
  redirect("/login");
}
