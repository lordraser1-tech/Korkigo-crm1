"use client";

import { useEffect, useState, type ReactNode } from "react";

type View = "LIST" | "MONTH";
const STORAGE_KEY = "korkigo:kalendarz-widok";

/**
 * Przełącznik lista/miesiąc. Oba widoki przychodzą gotowe z serwera, więc
 * zmiana jest natychmiastowa; wybór pamiętamy w `localStorage` per przeglądarka.
 * Startujemy zawsze od listy, żeby serwer i klient renderowały to samo.
 */
export function CalendarView({
  list,
  month,
}: {
  list: ReactNode;
  month: ReactNode;
}) {
  const [view, setView] = useState<View>("LIST");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "MONTH" || saved === "LIST") setView(saved);
    } catch {
      // Prywatne okno albo zablokowane dane — zostajemy przy liście.
    }
  }, []);

  function choose(next: View) {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Brak zapisu nie może psuć samego przełączania.
    }
  }

  return (
    <div>
      <div className="mb-3 inline-flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {(
          [
            ["LIST", "Lista"],
            ["MONTH", "Miesiąc"],
          ] as Array<[View, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => choose(key)}
            aria-pressed={view === key}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === key
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "LIST" ? list : month}
    </div>
  );
}
