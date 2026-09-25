import { requireActor } from "@/lib/auth";
import { apiHandler, readJson } from "@/lib/api";
import {
  cancelLesson,
  deleteLesson,
  getLesson,
  setLessonStatus,
  updateLesson,
} from "@/lib/services/lessons";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    return getLesson(actor, id);
  });
}

/**
 * Zmiana lekcji. Status idzie przez `setLessonStatus()`, a odwołanie przez
 * `cancelLesson()` — tą samą ścieżką co panel, więc regulaminu odwołań nie da
 * się ominąć przez API. `updateLesson()` obsługuje wyłącznie termin i czas
 * trwania i sam odrzuciłby status `CANCELLED`.
 */
export async function PATCH(request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    const body = (await readJson(request)) as Record<string, unknown>;

    if (body.status === "CANCELLED") {
      return cancelLesson(actor, id, body as never);
    }
    if (typeof body.status === "string") {
      return setLessonStatus(actor, id, body.status as never);
    }
    const scope = body.scope === "FUTURE" ? "FUTURE" : "ONE";
    return updateLesson(actor, id, body as never, scope);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const { id } = await params;
    await deleteLesson(actor, id);
    return { ok: true };
  });
}
