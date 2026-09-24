import { requireActor } from "@/lib/auth";
import { apiHandler } from "@/lib/api";
import { getSchedule } from "@/lib/services/schedule";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const params = new URL(request.url).searchParams;
    // `teacherId` działa tylko dla admina — nauczyciel i tak dostanie swój grafik.
    return getSchedule(actor, {
      weekKey: params.get("week"),
      teacherId: params.get("teacherId"),
    });
  });
}
