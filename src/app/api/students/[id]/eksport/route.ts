import { requireActor } from "@/lib/auth";
import { apiHandler } from "@/lib/api";
import { exportStudentData } from "@/lib/services/privacy";

type Params = { params: Promise<{ id: string }> };

/**
 * Eksport danych ucznia na żądanie (RODO art. 15 i 20). Autoryzację robi
 * serwis — tylko ADMIN. Zwracamy plik do pobrania, żeby dało się go po prostu
 * przekazać osobie, która o niego poprosiła.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const download = new URL(request.url).searchParams.get("pobierz") === "1";

  if (!download) {
    return apiHandler(async () => {
      const actor = await requireActor();
      return exportStudentData(actor, id);
    });
  }

  try {
    const actor = await requireActor();
    const data = await exportStudentData(actor, id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="dane-ucznia-${id}.json"`,
      },
    });
  } catch (error) {
    return apiHandler(async () => {
      throw error;
    });
  }
}
