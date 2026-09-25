import Link from "next/link";
import { requirePage } from "@/lib/auth";
import {
  getStudentRateMatrix,
  getTeacherRateMatrix,
  listSubjects,
} from "@/lib/services/subjects";
import {
  createSubjectAction,
  createSubjectLevelAction,
  deleteSubjectAction,
  deleteSubjectLevelAction,
  toggleSubjectLevelAction,
} from "@/app/actions/subjects";
import { ActionForm, ConfirmButton, Field, SelectField } from "@/components/forms";
import { RateMatrix } from "@/components/rate-matrix";
import { SearchFilter } from "@/components/search-filter";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export default async function AdminSubjectsPage() {
  const actor = await requirePage("ADMIN");
  const [subjects, teacherMatrix, studentMatrix] = await Promise.all([
    listSubjects(actor, { includeInactive: true }),
    getTeacherRateMatrix(actor),
    getStudentRateMatrix(actor),
  ]);

  return (
    <>
      <PageHeader
        title="Przedmioty i stawki"
        description="Przedmioty, ich poziomy oraz stawki nauczycieli i ceny uczniów — osobno dla każdej kombinacji."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              Przedmioty i poziomy
            </h2>
            {subjects.length === 0 ? (
              <EmptyState>
                Nie ma jeszcze żadnego przedmiotu — dodaj pierwszy po prawej.
              </EmptyState>
            ) : (
              <ul className="space-y-3">
                {subjects.map((subject) => (
                  <li key={subject.id} className="card p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">
                        {subject.name}
                        {!subject.active ? (
                          <span className="ml-2">
                            <Badge tone="slate">wyłączony</Badge>
                          </span>
                        ) : null}
                      </h3>
                      <form action={deleteSubjectAction}>
                        <input type="hidden" name="id" value={subject.id} />
                        <ConfirmButton message="Usunąć ten przedmiot wraz z jego poziomami?">
                          Usuń przedmiot
                        </ConfirmButton>
                      </form>
                    </div>

                    {subject.levels.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Brak poziomów — dodaj je po prawej.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {subject.levels.map((level) => (
                          <li
                            key={level.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          >
                            <span>
                              <span className="font-medium text-slate-800">
                                {level.name}
                              </span>
                              <span className="ml-2 text-xs text-slate-500">
                                {level.lessonCount} lekcji
                              </span>
                              {!level.active ? (
                                <span className="ml-2">
                                  <Badge tone="slate">wyłączony</Badge>
                                </span>
                              ) : null}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <form action={toggleSubjectLevelAction}>
                                <input type="hidden" name="id" value={level.id} />
                                <input
                                  type="hidden"
                                  name="active"
                                  value={level.active ? "false" : "true"}
                                />
                                <button type="submit" className="btn-secondary btn-sm">
                                  {level.active ? "Wyłącz" : "Włącz"}
                                </button>
                              </form>
                              <form action={deleteSubjectLevelAction}>
                                <input type="hidden" name="id" value={level.id} />
                                <ConfirmButton message="Usunąć ten poziom?">
                                  Usuń
                                </ConfirmButton>
                              </form>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              Stawki nauczycieli
            </h2>
            <p className="mb-3 text-sm text-slate-500">
              Kwota wypłacana za zrealizowaną lekcję. Puste pole = brak stawki,
              czyli blokada zapisu lekcji z tej kombinacji.
            </p>
            <SearchFilter label="Szukaj nauczyciela" placeholder="imię lub nazwisko">
              <RateMatrix
                kind="teacher"
                levels={teacherMatrix.levels}
                rows={teacherMatrix.rows}
              />
            </SearchFilter>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              Ceny uczniów
            </h2>
            <p className="mb-3 text-sm text-slate-500">
              Cena płacona przez ucznia — indywidualna, per przedmiot i poziom.
              Nauczyciel jej nie widzi.
            </p>
            <SearchFilter label="Szukaj ucznia" placeholder="imię lub nazwisko">
              <RateMatrix
                kind="student"
                levels={studentMatrix.levels}
                rows={studentMatrix.rows}
              />
            </SearchFilter>
          </section>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Nowy przedmiot
            </h2>
            <ActionForm
              action={createSubjectAction}
              submitLabel="Dodaj przedmiot"
              resetOnSuccess
            >
              <Field label="Nazwa" name="name" required placeholder="np. Matematyka" />
            </ActionForm>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Nowy poziom
            </h2>
            {subjects.length === 0 ? (
              <p className="text-sm text-slate-500">
                Najpierw dodaj przedmiot.
              </p>
            ) : (
              <ActionForm
                action={createSubjectLevelAction}
                submitLabel="Dodaj poziom"
                resetOnSuccess
              >
                <SelectField
                  label="Przedmiot"
                  name="subjectId"
                  required
                  options={subjects.map((subject) => ({
                    value: subject.id,
                    label: subject.name,
                  }))}
                />
                <Field
                  label="Nazwa poziomu"
                  name="name"
                  required
                  placeholder="np. Rozszerzony"
                />
              </ActionForm>
            )}
          </div>

          <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Jak to działa</p>
            <p className="mt-1">
              Przedmiot i poziom są cechą <strong>lekcji</strong>, nie ucznia —
              jeden uczeń może brać kilka przedmiotów. Przy zapisie lekcji
              system sprawdza, czy dla wybranej kombinacji istnieje stawka
              nauczyciela i cena ucznia; bez nich zapis jest odrzucany.
            </p>
            <p className="mt-2">
              Ceny konkretnego ucznia ustawisz też w{" "}
              <Link href="/admin/uczniowie" className="underline">
                jego karcie
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
