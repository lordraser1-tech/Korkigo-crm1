import { requirePage } from "@/lib/auth";
import {
  listLessonNotes,
  listLessonsAwaitingNote,
} from "@/lib/services/lesson-notes";
import {
  LessonNoteList,
  LessonsAwaitingNoteList,
} from "@/components/lesson-note-list";
import { PageHeader } from "@/components/ui";

export default async function TeacherNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ uczen?: string }>;
}) {
  const actor = await requirePage("TEACHER");
  const studentId = (await searchParams).uczen ?? null;

  // Serwis sam zawęża zakres do lekcji tego nauczyciela — strona niczego
  // nie filtruje i nie ma jak tego obejść adresem.
  const [awaiting, notes] = await Promise.all([
    listLessonsAwaitingNote(actor, { studentId }),
    listLessonNotes(actor, { studentId }),
  ]);

  return (
    <>
      <PageHeader
        title="Notatki z lekcji"
        description="Krótkie podsumowanie po zajęciach: co było, jak poszło, cel i co dalej."
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Do uzupełnienia ({awaiting.length})
        </h2>
        <LessonsAwaitingNoteList lessons={awaiting} studentHref="/nauczyciel/uczniowie" />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Zapisane notatki ({notes.length})
        </h2>
        <LessonNoteList
          notes={notes}
          studentHref="/nauczyciel/uczniowie"
          emptyText="Nie masz jeszcze żadnej notatki."
        />
      </section>
    </>
  );
}
