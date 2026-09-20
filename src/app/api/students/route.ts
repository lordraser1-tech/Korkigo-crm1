import type { StudentStatus } from "@prisma/client";
import { requireActor } from "@/lib/auth";
import { apiHandler, readJson } from "@/lib/api";
import { createStudent, listStudents } from "@/lib/services/students";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const params = new URL(request.url).searchParams;
    const status = params.get("status");
    return listStudents(actor, {
      search: params.get("q"),
      status: (status as StudentStatus | null) ?? null,
      teacherId: params.get("teacherId"),
    });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    return createStudent(actor, (await readJson(request)) as never);
  }, 201);
}
