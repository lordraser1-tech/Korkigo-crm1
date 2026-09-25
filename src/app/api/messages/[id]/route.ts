import { requireActor } from "@/lib/auth";
import { apiHandler } from "@/lib/api";
import { deleteMessage, markMessageRead } from "@/lib/services/messages";

type Params = { params: Promise<{ id: string }> };

/** Oznaczenie wiadomości jako przeczytanej przez zalogowanego nauczyciela. */
export async function POST(_request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    await markMessageRead(actor, id);
    return { ok: true };
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    await deleteMessage(actor, id);
    return { ok: true };
  });
}
