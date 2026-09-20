import { redirect } from "next/navigation";
import { getActor, homePathFor } from "@/lib/auth";

export default async function HomePage() {
  const actor = await getActor();
  redirect(actor ? homePathFor(actor.role) : "/login");
}
