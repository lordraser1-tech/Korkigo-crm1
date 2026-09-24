"use server";

import { requireActor } from "@/lib/auth";
import {
  cancelInvoice,
  createLessonInvoice,
  createMonthlyInvoice,
  createPackageInvoice,
  deletePayment,
  recordPayment,
  updateBillingSettings,
} from "@/lib/services/billing";
import {
  formToObject,
  toActionState,
  type ActionState,
} from "@/lib/action-result";
import { revalidatePanels } from "./shared";

export async function createMonthlyInvoiceAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const invoice = await createMonthlyInvoice(
      actor,
      formToObject(formData) as never
    );
    revalidatePanels();
    return {
      ok: true,
      message: `Wystawiono rachunek ${invoice.number} na ${invoice.totalAmount.toFixed(2)} zł.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function createLessonInvoiceAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const invoice = await createLessonInvoice(
      actor,
      formToObject(formData) as never
    );
    revalidatePanels();
    return { ok: true, message: `Wystawiono rachunek ${invoice.number}.` };
  } catch (error) {
    return toActionState(error);
  }
}

export async function createPackageInvoiceAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const invoice = await createPackageInvoice(
      actor,
      formToObject(formData) as never
    );
    revalidatePanels();
    return {
      ok: true,
      message: `Wystawiono rachunek ${invoice.number} za pakiet (${invoice.totalAmount.toFixed(2)} zł).`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function cancelInvoiceAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const id = formData.get("id");
    if (typeof id !== "string") throw new Error("Brak identyfikatora rachunku.");
    const invoice = await cancelInvoice(actor, id);
    revalidatePanels();
    return { ok: true, message: `Rachunek ${invoice.number} został anulowany.` };
  } catch (error) {
    return toActionState(error);
  }
}

export async function recordPaymentAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    const payment = await recordPayment(actor, formToObject(formData) as never);
    revalidatePanels();
    return {
      ok: true,
      message: `Zapisano wpłatę ${payment.amount.toFixed(2)} zł${
        payment.invoiceNumber ? ` do rachunku ${payment.invoiceNumber}` : ""
      }.`,
    };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deletePaymentAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("Brak identyfikatora wpłaty.");
  await deletePayment(actor, id);
  revalidatePanels();
}

export async function updateBillingSettingsAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireActor();
    await updateBillingSettings(actor, formToObject(formData) as never);
    revalidatePanels();
    return { ok: true, message: "Zapisano dane do rachunków." };
  } catch (error) {
    return toActionState(error);
  }
}
