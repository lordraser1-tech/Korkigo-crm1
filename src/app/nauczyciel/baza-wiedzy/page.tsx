import { requirePage } from "@/lib/auth";
import { listKnowledgeBase } from "@/lib/services/knowledge-base";
import { KnowledgeEntryList, SubjectTabs } from "@/components/knowledge-base";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function TeacherKnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<{ przedmiot?: string }>;
}) {
  const actor = await requirePage("TEACHER");
  const { przedmiot } = await searchParams;

  // Serwis oddaje wyłącznie przedmioty tego nauczyciela — strona niczego nie
  // filtruje, więc podstawiony `?przedmiot=` z cudzego przedmiotu po prostu
  // nie ma czego pokazać.
  const subjects = await listKnowledgeBase(actor);
  const active =
    subjects.find((subject) => subject.subjectId === przedmiot) ?? subjects[0];

  return (
    <>
      <PageHeader
        title="Baza wiedzy"
        description="Materiały pomocnicze do Twoich przedmiotów. Dodaje je administrator."
      />

      {subjects.length === 0 ? (
        <EmptyState>
          Nie masz jeszcze przypisanego żadnego przedmiotu. Przypisanie wynika
          z ustawionej stawki — zrobi to administrator.
        </EmptyState>
      ) : (
        <>
          <SubjectTabs
            subjects={subjects}
            activeId={active!.subjectId}
            basePath="/nauczyciel/baza-wiedzy"
          />
          <KnowledgeEntryList
            entries={active!.entries}
            emptyText={`Brak materiałów do przedmiotu „${active!.subjectName}".`}
          />
        </>
      )}
    </>
  );
}
