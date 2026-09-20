import { requirePage } from "@/lib/auth";
import { listStudents } from "@/lib/services/students";
import { createStudentAction } from "@/app/actions/students";
import { ActionForm, Field, SelectField } from "@/components/forms";
import { StudentTable } from "@/components/student-table";
import { PageHeader } from "@/components/ui";

export default async function TeacherStudentsPage() {
  const actor = await requirePage("TEACHER");
  const students = await listStudents(actor);

  return (
    <>
      <PageHeader
        title="Moi uczniowie"
        description="Uczniowie przypisani do Ciebie. Stawki ustala administrator."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <StudentTable students={students} hrefBase="/nauczyciel/uczniowie" />
        </div>

        <div className="card h-fit p-5">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            Dodaj ucznia
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Nowy uczeń zostanie przypisany do Ciebie. Stawkę za lekcję uzupełni
            administrator.
          </p>
          <ActionForm
            action={createStudentAction}
            submitLabel="Dodaj ucznia"
            resetOnSuccess
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Imię" name="firstName" required />
              <Field label="Nazwisko" name="lastName" required />
            </div>
            <Field label="Telefon" name="contactPhone" />
            <Field label="E-mail" name="contactEmail" type="email" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Poziom" name="languageLevel" placeholder="np. A2" />
              <Field
                label="Przedmiot"
                name="subject"
                placeholder="np. Polski ogólny"
              />
            </div>
            <details className="rounded-lg bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">
                Dane opiekuna (opcjonalnie)
              </summary>
              <div className="mt-3 space-y-3">
                <Field label="Imię i nazwisko" name="parentName" />
                <Field label="Telefon opiekuna" name="parentPhone" />
                <Field label="E-mail opiekuna" name="parentEmail" type="email" />
              </div>
            </details>
            <SelectField
              label="Status"
              name="status"
              defaultValue="ACTIVE"
              options={[
                { value: "ACTIVE", label: "Aktywny" },
                { value: "PAUSED", label: "Wstrzymany" },
                { value: "ENDED", label: "Zakończony" },
              ]}
            />
          </ActionForm>
        </div>
      </div>
    </>
  );
}
