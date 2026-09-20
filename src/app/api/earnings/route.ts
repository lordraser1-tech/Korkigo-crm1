import { requireActor } from "@/lib/auth";
import { apiHandler } from "@/lib/api";
import { getTeacherEarnings } from "@/lib/services/finance";
import { currentMonthKey } from "@/lib/datetime";
import { ValidationError } from "@/lib/errors";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const params = new URL(request.url).searchParams;
    const month = params.get("month") ?? currentMonthKey();

    // Nauczyciel bez parametru pyta o siebie; cudze `teacherId` odrzuci serwis.
    const teacherId = params.get("teacherId") ?? actor.teacherProfileId;
    if (!teacherId) throw new ValidationError("Podaj `teacherId`.");

    return getTeacherEarnings(actor, teacherId, month);
  });
}
