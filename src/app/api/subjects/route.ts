import { requireActor } from "@/lib/auth";
import { apiHandler } from "@/lib/api";
import { listSubjects } from "@/lib/services/subjects";

/** Lista przedmiotów z poziomami — potrzebna obu rolom do zapisu lekcji. */
export async function GET(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const includeInactive =
      new URL(request.url).searchParams.get("includeInactive") === "true";
    return listSubjects(actor, { includeInactive });
  });
}
