import { apiHandler } from "@/lib/api";
import { clearSessionCookie } from "@/lib/session";

export async function POST() {
  return apiHandler(async () => {
    await clearSessionCookie();
    return { ok: true };
  });
}
