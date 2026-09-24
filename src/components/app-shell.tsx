import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions/auth";

export type NavItem = {
  href: string;
  label: string;
  /** Pozycja z makiety, która przyjdzie w kolejnej fazie — widoczna, nieklikalna. */
  soon?: boolean;
};

export function AppShell({
  nav,
  roleLabel,
  userLabel,
  children,
}: {
  nav: NavItem[];
  roleLabel: string;
  userLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="no-print border-b border-slate-200 bg-white lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <div>
            <p className="text-lg font-bold tracking-tight text-brand-700">
              KorkiGO
            </p>
            <p className="text-xs text-slate-500">{roleLabel}</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-6">
          {nav.map((item) =>
            item.soon ? (
              <span
                key={item.label}
                title="Funkcja zaplanowana na kolejną fazę"
                className="flex cursor-default items-center justify-between whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-400"
              >
                {item.label}
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                  wkrótce
                </span>
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
              >
                {item.label}
              </Link>
            )
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3">
          <p className="truncate text-sm text-slate-600">{userLabel}</p>
          <form action={logoutAction}>
            <button type="submit" className="btn-secondary btn-sm">
              Wyloguj
            </button>
          </form>
        </header>
        <main className="print-page min-w-0 flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
