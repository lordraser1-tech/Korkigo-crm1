import { prisma } from "@/lib/prisma";
import { apiHandler, readJson } from "@/lib/api";
import { UnauthorizedError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  LOCK_MINUTES,
  checkLock,
  registerFailedLogin,
  registerSuccessfulLogin,
} from "@/lib/services/login-guard";
import { createSessionCookie } from "@/lib/session";
import { loginSchema } from "@/lib/validation";

// Ten sam zabieg co w akcji formularza: nieistniejący e-mail kosztuje tyle
// samo czasu co złe hasło, więc odpowiedź nie zdradza, które konta istnieją.
const DUMMY_HASH_PROMISE = hashPassword("nieistniejace-konto-placeholder");

export async function POST(request: Request) {
  return apiHandler(async () => {
    const data = loginSchema.parse(await readJson(request));
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      select: {
        id: true,
        email: true,
        role: true,
        passwordHash: true,
        teacherProfile: { select: { active: true } },
      },
    });
    if (user && (await checkLock(user.id)).locked) {
      throw new UnauthorizedError(
        `Zbyt wiele nieudanych prób. Spróbuj ponownie za ${LOCK_MINUTES} minut.`
      );
    }

    const hash = user?.passwordHash ?? (await DUMMY_HASH_PROMISE);
    const passwordOk = await verifyPassword(data.password, hash);
    if (!user || !passwordOk) {
      if (user) await registerFailedLogin(user.id);
      throw new UnauthorizedError("Nieprawidłowy e-mail lub hasło.");
    }
    if (user.role === "TEACHER" && !user.teacherProfile?.active) {
      throw new UnauthorizedError("Konto jest nieaktywne.");
    }
    await registerSuccessfulLogin(user.id);
    await createSessionCookie({ userId: user.id, role: user.role });
    return { id: user.id, email: user.email, role: user.role };
  });
}
