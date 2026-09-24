import { requireActor } from "@/lib/auth";
import { apiHandler } from "@/lib/api";
import { deletePayment } from "@/lib/services/billing";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    await deletePayment(actor, id);
    return { ok: true };
  });
}
