import type { LessonStatus } from "@prisma/client";
import { requireActor } from "@/lib/auth";
import { apiHandler, readJson } from "@/lib/api";
import { createLessons, listLessons } from "@/lib/services/lessons";
import { monthRange } from "@/lib/datetime";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const params = new URL(request.url).searchParams;
    const month = params.get("month");
    const range = month ? monthRange(month) : null;
    const status = params.get("status");
    return listLessons(actor, {
      from: range?.from ?? null,
      to: range?.to ?? null,
      teacherId: params.get("teacherId"),
      studentId: params.get("studentId"),
      status: (status as LessonStatus | null) ?? null,
    });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    return createLessons(actor, (await readJson(request)) as never);
  }, 201);
}
