import { requireActor } from "@/lib/auth";
import { apiHandler, readJson } from "@/lib/api";
import { createTeacher, listTeachers } from "@/lib/services/teachers";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const includeInactive =
      new URL(request.url).searchParams.get("includeInactive") === "true";
    return listTeachers(actor, { includeInactive });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    return createTeacher(actor, (await readJson(request)) as never);
  }, 201);
}
