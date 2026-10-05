import { requirePage } from "@/lib/auth";
import {
  listLessonNotes,
  listLessonsAwaitingNote,
} from "@/lib/services/lesson-notes";
import { listTeachers } from "@/lib/services/teachers";
import {
  LessonNoteList,
  LessonsAwaitingNoteList,
} from "@/components/lesson-note-list";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function AdminNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ szukaj?: string; teacherId?: string; uczen?: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { szukaj, teacherId, uczen } = await searchParams;
  const query = szukaj?.trim() || null;

  /**
   * Szukamy po stronie bazy, a nie przez ukrywanie wierszy w przeglądarce
   * (jak `SearchFilter` na krótkich listach): notatek przybywa po jednej
   * z każdej lekcji, więc po roku pracy byłoby ich kilkaset i filtr na
   * gotowej liście znaczyłby „przeszukaj to, co się akurat zmieściło".
   */
  const [notes, teachers, awaiting] = await Promise.all([
    listLessonNotes(actor, { query, teacherId: teacherId ?? null, studentId: uczen ?? null }),
    listTeachers(actor, { includeInactive: true }),
    // Przy aktywnym szukaniu lista „do uzupełnienia" tylko przeszkadza —
    // nie ma czego w niej szukać, bo te lekcje nie mają jeszcze treści.
    szukaj
      ? Promise.resolve([])
      : listLessonsAwaitingNote(actor, {
          teacherId: teacherId ?? null,
          studentId: uczen ?? null,
        }),
  ]);

  return (
    <>
      <PageHeader
        title="Notatki z lekcji"
        description="Notatki wszystkich nauczycieli. Szukanie obejmuje treść, ucznia, nauczyciela, przedmiot i temat zajęć."
      />

      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4" method="get">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="szukaj">
            Szukaj w notatkach
          </label>
          <input
            id="szukaj"
            name="szukaj"
            type="search"
            defaultValue={szukaj ?? ""}
            placeholder="np. czas przeszły, Oleksandra, Polski"
            className="input"
          />
        </div>
        {uczen ? <input type="hidden" name="uczen" value={uczen} /> : null}
        <div className="w-64">
          <label className="label" htmlFor="teacherId">
            Nauczyciel
          </label>
          <select
            id="teacherId"
            name="teacherId"
            defaultValue={teacherId ?? ""}
            className="input"
          >
            <option value="">Wszyscy</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.fullName}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Szukaj
        </button>
        {query || teacherId ? (
          <a href="/admin/notatki" className="btn-secondary">
            Wyczyść
          </a>
        ) : null}
      </form>

      {query ? (
        notes.length === 0 ? (
          <EmptyState>
            Nic nie pasuje do „{query}”.
          </EmptyState>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-500">
              Znaleziono {notes.length} dla „{query}”.
            </p>
            <LessonNoteList
              notes={notes}
              studentHref="/admin/uczniowie"
              emptyText=""
            />
          </>
        )
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Odbyte lekcje bez notatki ({awaiting.length})
            </h2>
            <LessonsAwaitingNoteList lessons={awaiting} studentHref="/admin/uczniowie" />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Zapisane notatki ({notes.length})
            </h2>
            <LessonNoteList
              notes={notes}
              studentHref="/admin/uczniowie"
              emptyText="Nikt nie zapisał jeszcze żadnej notatki."
            />
          </section>
        </>
      )}
    </>
  );
}
