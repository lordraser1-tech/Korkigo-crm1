import { requireActor } from "@/lib/auth";
import { apiHandler, readJson } from "@/lib/api";
import { getBillingSettings, updateBillingSettings } from "@/lib/services/billing";

export async function GET() {
  return apiHandler(async () => {
    const actor = await requireActor();
    return getBillingSettings(actor);
  });
}

export async function PUT(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    return updateBillingSettings(actor, (await readJson(request)) as never);
  });
}
