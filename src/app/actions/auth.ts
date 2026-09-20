"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword, hashPassword } from "@/lib/password";
import { createSessionCookie, clearSessionCookie } from "@/lib/session";
import { loginSchema } from "@/lib/validation";
import { homePathFor } from "@/lib/auth";
import { type ActionState, toActionState } from "@/lib/action-result";

// Stały hash porównawczy — nieistniejący e-mail kosztuje tyle samo czasu co zły
// login, więc odpowiedź nie zdradza, które konta istnieją.
const DUMMY_HASH_PROMISE = hashPassword("nieistniejace-konto-placeholder");

export async function loginAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  let target: string;
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

    const hash = user?.passwordHash ?? (await DUMMY_HASH_PROMISE);
    const passwordOk = await verifyPassword(data.password, hash);

    if (!user || !passwordOk) {
      return { ok: false, message: "Nieprawidłowy e-mail lub hasło." };
    }
    if (user.role === "TEACHER" && !user.teacherProfile?.active) {
      return { ok: false, message: "Konto jest nieaktywne. Skontaktuj się z administratorem." };
    }

    await createSessionCookie({ userId: user.id, role: user.role });
    const next = formData.get("next");
    const wanted = typeof next === "string" && next.startsWith("/") ? next : null;
    target = wanted ?? homePathFor(user.role);
  } catch (error) {
    return toActionState(error);
  }
  redirect(target);
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
