import Link from "next/link";
import type {
  KnowledgeEntryDto,
  KnowledgeSubjectDto,
} from "@/lib/services/knowledge-base";
import { EmptyState } from "@/components/ui";

/**
 * Zakładki przedmiotów jako zwykłe odnośniki, nie stan w przeglądarce:
 * adres `?przedmiot=…` da się wysłać drugiej osobie i przeżywa odświeżenie.
 */
export function SubjectTabs({
  subjects,
  activeId,
  basePath,
}: {
  subjects: KnowledgeSubjectDto[];
  activeId: string;
  basePath: string;
}) {
  return (
    <nav className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
      {subjects.map((subject) => {
        const active = subject.subjectId === activeId;
        return (
          <Link
            key={subject.subjectId}
            href={`${basePath}?przedmiot=${subject.subjectId}`}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            {subject.subjectName}
            {subject.active ? null : (
              <span className="ml-1.5 text-[10px] uppercase text-slate-400">
                wyłączony
              </span>
            )}
            <span className="ml-1.5 text-xs text-slate-400">
              {subject.entries.length}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Skąd prowadzi link — żeby było widać przed kliknięciem, nie po. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Sam materiał — bez obudowy, żeby dał się włożyć także w kartę admina. */
export function KnowledgeEntryBody({ entry }: { entry: KnowledgeEntryDto }) {
  return (
    <>
      {/*
        `rel="noopener"` nie jest ozdobnikiem: bez niego otwarta strona dostaje
        `window.opener` i może przestawić naszą kartę pod siebie.
      */}
      <a
        href={entry.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-base font-semibold text-brand-700 hover:underline"
      >
        {entry.title}
      </a>
      <p className="mt-0.5 truncate text-xs text-slate-400">{hostOf(entry.url)}</p>
      {entry.description ? (
        <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600">
          {entry.description}
        </p>
      ) : null}
    </>
  );
}

/** Widok tylko do czytania — panel nauczyciela. */
export function KnowledgeEntryList({
  entries,
  emptyText,
}: {
  entries: KnowledgeEntryDto[];
  emptyText: string;
}) {
  if (entries.length === 0) return <EmptyState>{emptyText}</EmptyState>;

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="card p-4">
          <KnowledgeEntryBody entry={entry} />
        </li>
      ))}
    </ul>
  );
}
