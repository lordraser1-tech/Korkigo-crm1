import { requireActor } from "@/lib/auth";
import { apiHandler, readJson } from "@/lib/api";
import {
  deleteStudent,
  getStudent,
  updateStudent,
} from "@/lib/services/students";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return getStudent(actor, id);
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return updateStudent(actor, id, (await readJson(request)) as never);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    await deleteStudent(actor, id);
    return { ok: true };
  });
}
