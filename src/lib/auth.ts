import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readSessionCookie } from "@/lib/session";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

/**
 * Tożsamość wykonawcy żądania. Każda funkcja serwisowa przyjmuje `Actor`
 * i sama egzekwuje uprawnienia — UI nigdy nie jest jedynym zabezpieczeniem.
 */
export type AdminActor = {
  userId: string;
  email: string;
  role: "ADMIN";
  teacherProfileId: null;
};

export type TeacherActor = {
  userId: string;
  email: string;
  role: "TEACHER";
  teacherProfileId: string;
};

export type Actor =
  | { userId: string; email: string; role: "ADMIN"; teacherProfileId: null }
  | {
      userId: string;
      email: string;
      role: "TEACHER";
      teacherProfileId: string;
    };

export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await readSessionCookie();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      role: true,
      teacherProfile: { select: { id: true, active: true } },
    },
  });
  if (!user) return null;

  if (user.role === "ADMIN") {
    return {
      userId: user.id,
      email: user.email,
      role: "ADMIN",
      teacherProfileId: null,
    };
  }

  // Nauczyciel bez profilu albo dezaktywowany nie ma dostępu do niczego.
  if (!user.teacherProfile || !user.teacherProfile.active) return null;

  return {
    userId: user.id,
    email: user.email,
    role: "TEACHER",
    teacherProfileId: user.teacherProfile.id,
  };
});

/** Do użycia w API — rzuca błędem zamiast przekierowywać. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new UnauthorizedError();
  return actor;
}

export async function requireRole(role: "ADMIN"): Promise<AdminActor>;
export async function requireRole(role: "TEACHER"): Promise<TeacherActor>;
export async function requireRole(role: Role): Promise<Actor>;
export async function requireRole(role: Role): Promise<Actor> {
  const actor = await requireActor();
  if (actor.role !== role) throw new ForbiddenError();
  return actor;
}

/** Do użycia w komponentach serwerowych — przekierowuje na ekran logowania. */
export async function requirePage(role: "ADMIN"): Promise<AdminActor>;
export async function requirePage(role: "TEACHER"): Promise<TeacherActor>;
export async function requirePage(role?: Role): Promise<Actor>;
export async function requirePage(role?: Role): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (role && actor.role !== role) redirect(homePathFor(actor.role));
  return actor;
}

export function homePathFor(role: Role): string {
  return role === "ADMIN" ? "/admin" : "/nauczyciel";
}

export function assertAdmin(actor: Actor, message?: string): void {
  if (actor.role !== "ADMIN") throw new ForbiddenError(message);
}
