import { requireActor } from "@/lib/auth";
import { apiHandler, readJson } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import {
  createLessonInvoice,
  createMonthlyInvoice,
  createPackageInvoice,
  listInvoices,
  type InvoiceFilters,
} from "@/lib/services/billing";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const params = new URL(request.url).searchParams;
    const state = params.get("state");
    return listInvoices(actor, {
      month: params.get("month"),
      studentId: params.get("studentId"),
      state: (state as InvoiceFilters["state"]) ?? null,
    });
  });
}

/** `type`: "monthly" (domyślnie) | "lesson" | "package". */
export async function POST(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const body = (await readJson(request)) as { type?: string };

    switch (body.type ?? "monthly") {
      case "monthly":
        return createMonthlyInvoice(actor, body as never);
      case "lesson":
        return createLessonInvoice(actor, body as never);
      case "package":
        return createPackageInvoice(actor, body as never);
      default:
        throw new ValidationError(
          'Nieznany typ rachunku — użyj "monthly", "lesson" albo "package".'
        );
    }
  }, 201);
}
