import { requireActor } from "@/lib/auth";
import { apiHandler } from "@/lib/api";
import { cancelInvoice, getInvoice } from "@/lib/services/billing";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return getInvoice(actor, id);
  });
}

/** Rachunków się nie kasuje — anulujemy, żeby numeracja została ciągła. */
export async function DELETE(_request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return cancelInvoice(actor, id);
  });
}
