import { prisma } from "@/lib/prisma";
import { apiHandler, readJson } from "@/lib/api";
import { UnauthorizedError } from "@/lib/errors";
import { verifyPassword } from "@/lib/password";
import { createSessionCookie } from "@/lib/session";
import { loginSchema } from "@/lib/validation";

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
    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      throw new UnauthorizedError("Nieprawidłowy e-mail lub hasło.");
    }
    if (user.role === "TEACHER" && !user.teacherProfile?.active) {
      throw new UnauthorizedError("Konto jest nieaktywne.");
    }
    await createSessionCookie({ userId: user.id, role: user.role });
    return { id: user.id, email: user.email, role: user.role };
  });
}
