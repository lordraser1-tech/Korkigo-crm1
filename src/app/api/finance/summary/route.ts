import { requireActor } from "@/lib/auth";
import { apiHandler } from "@/lib/api";
import { getAdminFinanceSummary } from "@/lib/services/finance";
import { currentMonthKey } from "@/lib/datetime";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const month =
      new URL(request.url).searchParams.get("month") ?? currentMonthKey();
    return getAdminFinanceSummary(actor, month);
  });
}
