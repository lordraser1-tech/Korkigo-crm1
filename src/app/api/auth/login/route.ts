import { prisma } from "@/lib/prisma";
import { apiHandler, readJson } from "@/lib/api";
import { clientKey } from "@/lib/rate-limit";
import { UnauthorizedError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  LOCK_MINUTES,
  checkLock,
  registerFailedLogin,
  registerSuccessfulLogin,
} from "@/lib/services/login-guard";
import { recordSecurityEvent } from "@/lib/services/security-log";
import { createSessionCookie } from "@/lib/session";
import {
  requiresSecondFactor,
  verifySecondFactor,
} from "@/lib/services/two-factor";
import { loginSchema } from "@/lib/validation";

// Ten sam zabieg co w akcji formularza: nieistniejący e-mail kosztuje tyle
// samo czasu co złe hasło, więc odpowiedź nie zdradza, które konta istnieją.
const DUMMY_HASH_PROMISE = hashPassword("nieistniejace-konto-placeholder");

export async function POST(request: Request) {
  const ip = clientKey(request.headers);
  const userAgent = request.headers.get("user-agent");

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
      await recordSecurityEvent({
        type: "LOGIN_BLOCKED",
        userId: user.id,
        email: data.email,
        ip,
        userAgent,
      });
      throw new UnauthorizedError(
        `Zbyt wiele nieudanych prób. Spróbuj ponownie za ${LOCK_MINUTES} minut.`
      );
    }

    const hash = user?.passwordHash ?? (await DUMMY_HASH_PROMISE);
    const passwordOk = await verifyPassword(data.password, hash);
    if (!user || !passwordOk) {
      if (user) {
        const locked = await registerFailedLogin(user.id);
        if (locked) {
          await recordSecurityEvent({
            type: "ACCOUNT_LOCKED",
            userId: user.id,
            email: data.email,
            ip,
            userAgent,
          });
        }
      }
      await recordSecurityEvent({
        type: "LOGIN_FAILED",
        userId: user?.id ?? null,
        email: data.email,
        ip,
        userAgent,
        detail: user ? null : "konto nie istnieje",
      });
      throw new UnauthorizedError("Nieprawidłowy e-mail lub hasło.");
    }
    if (user.role === "TEACHER" && !user.teacherProfile?.active) {
      throw new UnauthorizedError("Konto jest nieaktywne.");
    }
    // Drugi składnik obowiązuje TAKŻE tutaj. Gdyby REST go pomijał, byłby
    // najprostszym obejściem całej ochrony — wystarczyłoby znać hasło.
    // Klient API podaje kod w tym samym żądaniu (pole `code`); etapu
    // pośredniego na ciasteczku nie ma, bo integracja nie ma przeglądarki.
    if (await requiresSecondFactor(user.id)) {
      const code = typeof data.code === "string" ? data.code : "";
      if (!code) {
        await recordSecurityEvent({
          type: "TOTP_FAILED",
          userId: user.id,
          email: user.email,
          ip,
          userAgent,
          detail: "API bez kodu",
        });
        throw new UnauthorizedError(
          "Konto wymaga drugiego składnika — podaj pole `code`."
        );
      }

      const second = await verifySecondFactor(user.id, code);
      if (!second.ok) {
        await registerFailedLogin(user.id);
        await recordSecurityEvent({
          type: "TOTP_FAILED",
          userId: user.id,
          email: user.email,
          ip,
          userAgent,
          detail: "API",
        });
        throw new UnauthorizedError("Kod się nie zgadza.");
      }
      if (second.usedRecoveryCode) {
        await recordSecurityEvent({
          type: "RECOVERY_CODE_USED",
          userId: user.id,
          email: user.email,
          ip,
          userAgent,
          detail: "API",
        });
      }
    }

    await registerSuccessfulLogin(user.id);
    await recordSecurityEvent({
      type: "LOGIN_OK",
      userId: user.id,
      email: user.email,
      ip,
      userAgent,
      detail: "API",
    });
    await createSessionCookie({ userId: user.id, role: user.role });
    return { id: user.id, email: user.email, role: user.role };
  });
}
