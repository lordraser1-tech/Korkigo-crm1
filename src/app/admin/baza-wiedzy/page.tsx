import { requirePage } from "@/lib/auth";
import { listKnowledgeBase } from "@/lib/services/knowledge-base";
import { KnowledgeEntryBody, SubjectTabs } from "@/components/knowledge-base";
import {
  KnowledgeEntryAdminCard,
  NewKnowledgeEntryForm,
} from "@/components/knowledge-entry-editor";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function AdminKnowledgeBasePage({
  searchParams,
}: {
  searchParams: Promise<{ przedmiot?: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { przedmiot } = await searchParams;

  const subjects = await listKnowledgeBase(actor);
  const active =
    subjects.find((subject) => subject.subjectId === przedmiot) ?? subjects[0];

  return (
    <>
      <PageHeader
        title="Baza wiedzy"
        description="Linki do materiałów pomocniczych, osobno dla każdego przedmiotu. Nauczyciel widzi tylko te przedmioty, do których ma stawkę."
      />

      {subjects.length === 0 ? (
        <EmptyState>
          Najpierw dodaj przedmiot w zakładce „Przedmioty”.
        </EmptyState>
      ) : (
        <>
          <SubjectTabs
            subjects={subjects}
            activeId={active!.subjectId}
            basePath="/admin/baza-wiedzy"
          />

          <div className="mb-5">
            <NewKnowledgeEntryForm subjectId={active!.subjectId} />
          </div>

          {active!.entries.length === 0 ? (
            <EmptyState>
              Brak materiałów do przedmiotu „{active!.subjectName}”.
            </EmptyState>
          ) : (
            <ul className="space-y-3">
              {active!.entries.map((entry) => (
                <KnowledgeEntryAdminCard key={entry.id} entry={entry}>
                  <KnowledgeEntryBody entry={entry} />
                </KnowledgeEntryAdminCard>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
