import { requireActor } from "@/lib/auth";
import { apiHandler } from "@/lib/api";
import { evidenceToCsv, getEvidenceReport } from "@/lib/services/evidence";

/**
 * Ewidencja przychodu. Bez parametru `format` zwraca dane jako JSON,
 * z `format=csv` plik do pobrania. Autoryzację robi serwis (tylko ADMIN).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const format = params.get("format");

  if (format !== "csv") {
    return apiHandler(async () => {
      const actor = await requireActor();
      const year = Number(params.get("rok")) || new Date().getFullYear();
      return getEvidenceReport(actor, year);
    });
  }

  try {
    const actor = await requireActor();
    const year = Number(params.get("rok")) || new Date().getFullYear();
    const report = await getEvidenceReport(actor, year);
    return new Response(evidenceToCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ewidencja-${year}.csv"`,
      },
    });
  } catch (error) {
    // Błędy (brak sesji, nie-admin) oddajemy tą samą drogą co reszta API.
    return apiHandler(async () => {
      throw error;
    });
  }
}
