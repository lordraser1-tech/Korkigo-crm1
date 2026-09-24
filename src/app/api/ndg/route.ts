import { requireActor } from "@/lib/auth";
import { apiHandler } from "@/lib/api";
import {
  getFinancialStats,
  getNdgOverview,
  type NdgScope,
} from "@/lib/services/ndg";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const params = new URL(request.url).searchParams;
    const year = params.get("year");
    const scope = params.get("scope");

    // ?scope=MONTH|QUARTER|YEAR zwraca statystyki zamiast przeglądu limitu.
    if (scope === "MONTH" || scope === "QUARTER" || scope === "YEAR") {
      return getFinancialStats(actor, {
        scope: scope as NdgScope,
        year: year ? Number(year) : new Date().getFullYear(),
        quarter: params.get("quarter") ? Number(params.get("quarter")) : null,
        month: params.get("month"),
      });
    }

    return getNdgOverview(actor, {
      year: year ? Number(year) : null,
      periodKey: params.get("period"),
    });
  });
}
