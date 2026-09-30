/**
 * Ochrona logowania przed zgadywaniem hasła.
 *
 * Licznik trzymamy przy koncie (a nie w pamięci procesu), żeby przeżył restart
 * i działał także wtedy, gdy aplikacja stoi w kilku instancjach.
 *
 * Blokada jest świadomie KRÓTKA i czasowa: trwałe zamknięcie konta dałoby
 * atakującemu darmowy sposób na odcięcie nauczyciela od pracy — wystarczyłoby
 * kilkanaście złych haseł na jego adres.
 */
import { prisma } from "@/lib/prisma";

export const MAX_FAILED_LOGINS = 10;
export const LOCK_MINUTES = 15;

export type LockState = { locked: true; until: Date } | { locked: false };

export async function checkLock(
  userId: string,
  now = new Date()
): Promise<LockState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lockedUntil: true },
  });
  if (user?.lockedUntil && user.lockedUntil > now) {
    return { locked: true, until: user.lockedUntil };
  }
  return { locked: false };
}

/** Zwraca `true`, gdy ta właśnie próba włączyła blokadę — do dziennika. */
export async function registerFailedLogin(
  userId: string,
  now = new Date()
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { failedLogins: true, lockedUntil: true },
  });
  if (!user) return false;

  // Po wygaśnięciu blokady liczymy od nowa.
  const expired = user.lockedUntil !== null && user.lockedUntil <= now;
  const failed = (expired ? 0 : user.failedLogins) + 1;
  const locked = failed >= MAX_FAILED_LOGINS;

  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLogins: locked ? 0 : failed,
      lockedUntil: locked
        ? new Date(now.getTime() + LOCK_MINUTES * 60 * 1000)
        : expired
          ? null
          : user.lockedUntil,
    },
  });

  return locked;
}

export async function registerSuccessfulLogin(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLogins: 0, lockedUntil: null },
  });
}
