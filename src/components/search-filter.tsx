"use client";

import { useId, useRef, useState, type ReactNode } from "react";

/**
 * Wyszukiwarka „na żywo” dla list renderowanych na serwerze. Filtruje
 * elementy z atrybutem `data-search` wewnątrz siebie, więc tabele mogą zostać
 * komponentami serwerowymi — nie przenosimy danych do przeglądarki tylko po to,
 * żeby je przefiltrować.
 */
export function SearchFilter({
  label = "Szukaj",
  placeholder,
  children,
}: {
  label?: string;
  placeholder?: string;
  children: ReactNode;
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<number | null>(null);

  function apply(value: string) {
    setQuery(value);
    const needle = value.trim().toLowerCase();
    const root = container.current;
    if (!root) return;

    let shown = 0;
    for (const row of root.querySelectorAll<HTMLElement>("[data-search]")) {
      const hit =
        needle === "" ||
        (row.dataset.search ?? "").toLowerCase().includes(needle);
      row.classList.toggle("hidden", !hit);
      if (hit) shown += 1;
    }
    setMatches(needle === "" ? null : shown);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor={id}>
            {label}
          </label>
          <input
            id={id}
            type="search"
            className="input"
            value={query}
            placeholder={placeholder}
            onChange={(event) => apply(event.target.value)}
          />
        </div>
        {matches !== null ? (
          <p className="pb-2 text-sm text-slate-500">
            {matches === 0 ? "Brak wyników" : `Pasuje: ${matches}`}
          </p>
        ) : null}
      </div>
      <div ref={container}>{children}</div>
    </div>
  );
}
