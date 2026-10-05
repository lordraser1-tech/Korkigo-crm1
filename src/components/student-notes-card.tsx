import Link from "next/link";
import type { LessonNoteDto } from "@/lib/services/lesson-notes";
import { formatDate } from "@/lib/datetime";
import { EmptyState } from "@/components/ui";

/**
 * Notatki w karcie ucznia — tylko do czytania, kilka ostatnich.
 *
 * Edycja celowo siedzi na zakładce „Notatki z lekcji", a nie tutaj: karta
 * ucznia jest już gęsta, a cztery pola szablonu przy każdej lekcji zrobiłyby
 * z niej ścianę tekstu.
 */
export function StudentNotesCard({
  studentId,
  notes,
  total,
  notesHref,
}: {
  studentId: string;
  notes: LessonNoteDto[];
  total: number;
  /** Ścieżka zakładki notatek w tym panelu. */
  notesHref: string;
}) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">
          Notatki z lekcji ({total})
        </h2>
        <Link
          href={`${notesHref}?uczen=${studentId}`}
          className="text-sm text-brand-700 hover:underline"
        >
          Otwórz i edytuj
        </Link>
      </div>

      {notes.length === 0 ? (
        <EmptyState>
          Brak notatek. Dopisz je na zakładce „Notatki z lekcji”.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id} className="card p-4">
              <p className="mb-1 text-xs text-slate-500">
                {formatDate(new Date(note.lessonAt))} · {note.subjectLabel}
              </p>
              {note.whatWeDid ? (
                <p className="line-clamp-3 whitespace-pre-line text-sm text-slate-700">
                  {note.whatWeDid}
                </p>
              ) : null}
              {note.nextSteps ? (
                <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-sm text-slate-500">
                  Co dalej: {note.nextSteps}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
