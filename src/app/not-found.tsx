import Link from "next/link";

/**
 * Własna strona 404 — nie tylko dla wyglądu.
 *
 * Domyślna strona Next-a jest generowana statycznie, a do statycznego HTML-a
 * nie da się wstrzyknąć nonce'a, który middleware losuje przy każdej
 * odpowiedzi. Efekt: przeglądarka odrzucała na niej wszystkie skrypty
 * i wypisywała naruszenia CSP. `force-dynamic` sprawia, że strona powstaje
 * przy żądaniu i dostaje ten sam nonce co reszta serwisu.
 */
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-semibold text-slate-300">404</p>
      <h1 className="text-xl font-semibold text-slate-900">
        Nie ma takiej strony
      </h1>
      <p className="text-sm text-slate-500">
        Adres mógł się zmienić albo link jest niepełny.
      </p>
      <Link href="/" className="btn btn-primary">
        Wróć na start
      </Link>
    </main>
  );
}
