import type { LessonDto } from "@/lib/services/lessons";
import type { RateCell } from "@/lib/services/subjects";
import { formatPLN } from "@/lib/money";
import { EmptyState } from "@/components/ui";

type Row = {
  subjectLevelId: string;
  label: string;
  lessons: number;
  completed: number;
  /** Cena ucznia — podajemy ją wyłącznie w panelu administratora. */
  amount: number | null;
};

/**
 * Przedmiot i poziom są cechą lekcji, nie ucznia, więc „przedmioty ucznia”
 * składamy z jego lekcji. Admin dostaje dodatkowo kombinacje z ustaloną ceną,
 * na które lekcji jeszcze nie było — widać wtedy, co jest już wycenione.
 */
export function StudentSubjects({
  lessons,
  rates,
}: {
  lessons: LessonDto[];
  rates?: RateCell[];
}) {
  const rows = new Map<string, Row>();

  for (const lesson of lessons) {
    const row = rows.get(lesson.subjectLevelId) ?? {
      subjectLevelId: lesson.subjectLevelId,
      label: lesson.subjectLabel,
      lessons: 0,
      completed: 0,
      amount: null,
    };
    row.lessons += 1;
    if (lesson.status === "COMPLETED") row.completed += 1;
    rows.set(row.subjectLevelId, row);
  }

  for (const rate of rates ?? []) {
    if (rate.amount === null) continue;
    const row = rows.get(rate.subjectLevelId) ?? {
      subjectLevelId: rate.subjectLevelId,
      label: rate.label,
      lessons: 0,
      completed: 0,
      amount: null,
    };
    row.amount = rate.amount;
    rows.set(row.subjectLevelId, row);
  }

  const list = [...rows.values()].sort((a, b) => b.lessons - a.lessons);

  return (
    <div className="card p-5">
      <h2 className="mb-1 text-base font-semibold text-slate-900">
        Przedmioty ucznia
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Kombinacje przedmiot/poziom, na które uczeń chodzi. Jeden uczeń może
        brać kilka przedmiotów — wybiera się je przy zapisie lekcji.
      </p>

      {list.length === 0 ? (
        <EmptyState>Uczeń nie ma jeszcze żadnych lekcji.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {list.map((row) => (
            <li
              key={row.subjectLevelId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{row.label}</p>
                <p className="text-xs text-slate-500">
                  {row.lessons === 0
                    ? "brak lekcji — cena już ustalona"
                    : `${row.lessons} lekcji, w tym ${row.completed} zrealizowanych`}
                </p>
              </div>
              {rates ? (
                <span className="text-sm font-semibold text-slate-900">
                  {row.amount === null ? (
                    <span className="text-amber-700">brak ceny</span>
                  ) : (
                    formatPLN(row.amount)
                  )}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
