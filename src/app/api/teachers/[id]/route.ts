import { requireActor } from "@/lib/auth";
import { apiHandler, readJson } from "@/lib/api";
import { getTeacher, updateTeacher } from "@/lib/services/teachers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return getTeacher(actor, id);
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return updateTeacher(actor, id, (await readJson(request)) as never);
  });
}
