import { requireActor } from "@/lib/auth";
import { apiHandler, readJson } from "@/lib/api";
import {
  listMyMessages,
  listSentMessages,
  sendMessage,
} from "@/lib/services/messages";

export async function GET() {
  return apiHandler(async () => {
    const actor = await requireActor();
    // Admin dostaje skrzynkę nadawczą, nauczyciel — własną skrzynkę odbiorczą.
    return actor.role === "ADMIN"
      ? listSentMessages(actor)
      : listMyMessages(actor);
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    const actor = await requireActor();
    return sendMessage(actor, (await readJson(request)) as never);
  }, 201);
}
