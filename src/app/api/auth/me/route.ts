import { requireActor } from "@/lib/auth";
import { apiHandler } from "@/lib/api";

export async function GET() {
  return apiHandler(async () => {
    const actor = await requireActor();
    return {
      userId: actor.userId,
      email: actor.email,
      role: actor.role,
      teacherProfileId: actor.teacherProfileId,
    };
  });
}
