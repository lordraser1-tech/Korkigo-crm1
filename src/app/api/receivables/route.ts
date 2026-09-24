import { requireActor } from "@/lib/auth";
import { apiHandler } from "@/lib/api";
import { listReceivables } from "@/lib/services/billing";

export async function GET() {
  return apiHandler(async () => {
    const actor = await requireActor();
    return listReceivables(actor);
  });
}
