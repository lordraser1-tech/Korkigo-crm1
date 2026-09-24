import { requireActor } from "@/lib/auth";
import { apiHandler, readJson } from "@/lib/api";
import { listPayments, recordPayment } from "@/lib/services/billing";

export async function GET(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    const params = new URL(request.url).searchParams;
    return listPayments(actor, {
      month: params.get("month"),
      studentId: params.get("studentId"),
    });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    return recordPayment(actor, (await readJson(request)) as never);
  }, 201);
}
