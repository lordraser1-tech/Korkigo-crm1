import { redirect } from "next/navigation";
import { getActor, homePathFor } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const actor = await getActor();
  if (actor) redirect(homePathFor(actor.role));

  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-2xl font-bold tracking-tight text-brand-700">
            KorkiGO
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Panel korepetycji z języka polskiego
          </p>
        </div>
        <div className="card p-6">
          <h1 className="mb-1 text-lg font-semibold text-slate-900">Logowanie</h1>
          <p className="mb-5 text-sm text-slate-500">
            Zaloguj się kontem administratora lub nauczyciela.
          </p>
          <LoginForm next={next ?? null} />
        </div>
      </div>
    </main>
  );
}
