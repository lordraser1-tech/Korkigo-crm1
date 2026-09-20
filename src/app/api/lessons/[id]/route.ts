import { requireActor } from "@/lib/auth";
import { apiHandler, readJson } from "@/lib/api";
import { deleteLesson, getLesson, updateLesson } from "@/lib/services/lessons";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return getLesson(actor, id);
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return updateLesson(actor, id, (await readJson(request)) as never);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    await deleteLesson(actor, id);
    return { ok: true };
  });
}
