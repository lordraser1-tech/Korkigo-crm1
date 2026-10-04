"use server";

import { requireActor } from "@/lib/auth";
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
} from "@/lib/services/two-factor";
import { toActionState, type ActionState } from "@/lib/action-result";
import { createQrCode, type QrCode } from "@/lib/qr";
import { revalidatePanels } from "./shared";

/**
 * Sekret i kody zapasowe pokazujemy RAZ, w odpowiedzi akcji — nie trafiają
 * do żadnego widoku ładowanego ponownie, bo wtedy leżałyby na ekranie
 * po odświeżeniu.
 */
export type TwoFactorActionState = ActionState & {
  secretForDisplay?: string;
  uri?: string;
  /**
   * Kod QR liczymy tutaj, a nie w komponencie: w treści siedzi sekret TOTP,
   * więc generator zostaje na serwerze i nie wchodzi do paczki klienta.
   */
  qr?: QrCode;
  recoveryCodes?: string[];
};

export async function startTwoFactorAction(
  _prev: TwoFactorActionState,
  _formData: FormData
): Promise<TwoFactorActionState> {
  try {
    const actor = await requireActor();
    const setup = await startTwoFactorSetup(actor);
    revalidatePanels();
    return { ok: true, ...setup, qr: createQrCode(setup.uri) };
  } catch (error) {
    return toActionState(error);
  }
}

export async function confirmTwoFactorAction(
  _prev: TwoFactorActionState,
  formData: FormData
): Promise<TwoFactorActionState> {
  try {
    const actor = await requireActor();
    const code = formData.get("code");
    if (typeof code !== "string") return { ok: false, message: "Podaj kod." };

    const { recoveryCodes } = await confirmTwoFactorSetup(actor, code);
    revalidatePanels();
    return {
      ok: true,
      message:
        "Drugi składnik włączony. Zapisz kody zapasowe — pokazujemy je tylko teraz.",
      recoveryCodes,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function disableTwoFactorAction(
  _prev: TwoFactorActionState,
  formData: FormData
): Promise<TwoFactorActionState> {
  try {
    const actor = await requireActor();
    const password = formData.get("password");
    if (typeof password !== "string") {
      return { ok: false, message: "Podaj hasło." };
    }
    await disableTwoFactor(actor, password);
    revalidatePanels();
    return { ok: true, message: "Drugi składnik wyłączony." };
  } catch (error) {
    return toActionState(error);
  }
}

export async function regenerateRecoveryCodesAction(
  _prev: TwoFactorActionState,
  formData: FormData
): Promise<TwoFactorActionState> {
  try {
    const actor = await requireActor();
    const password = formData.get("password");
    if (typeof password !== "string") {
      return { ok: false, message: "Podaj hasło." };
    }
    const { recoveryCodes } = await regenerateRecoveryCodes(actor, password);
    revalidatePanels();
    return {
      ok: true,
      message: "Nowe kody zapasowe. Poprzednie przestały działać.",
      recoveryCodes,
    };
  } catch (error) {
    return toActionState(error);
  }
}
