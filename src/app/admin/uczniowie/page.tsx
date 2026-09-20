import { requirePage } from "@/lib/auth";
import { listStudents } from "@/lib/services/students";
import { listTeachers } from "@/lib/services/teachers";
import { createStudentAction } from "@/app/actions/students";
import { ActionForm, Field, SelectField } from "@/components/forms";
import { StudentTable } from "@/components/student-table";
import { PageHeader } from "@/components/ui";

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; teacherId?: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { q, status, teacherId } = await searchParams;

  const [students, teachers] = await Promise.all([
    listStudents(actor, {
      search: q ?? null,
      status:
        status === "ACTIVE" || status === "PAUSED" || status === "ENDED"
          ? status
          : null,
      teacherId: teacherId ?? null,
    }),
    listTeachers(actor, { includeInactive: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Uczniowie"
        description="Pełna kartoteka wraz ze stawkami — widoczna tylko dla administratora."
      />

      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4" method="get">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="q">
            Szukaj
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            className="input"
            placeholder="imię, nazwisko lub e-mail"
          />
        </div>
        <div className="w-44">
          <label className="label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="input">
            <option value="">Wszystkie</option>
            <option value="ACTIVE">Aktywny</option>
            <option value="PAUSED">Wstrzymany</option>
            <option value="ENDED">Zakończony</option>
          </select>
        </div>
        <div className="w-56">
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
          Filtruj
        </button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <StudentTable
            students={students}
            hrefBase="/admin/uczniowie"
            showRate
            showTeacher
          />
        </div>

        <div className="card h-fit p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Dodaj ucznia
          </h2>
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
              <Field label="Przedmiot" name="subject" placeholder="np. Polski ogólny" />
            </div>
            <Field
              label="Stawka ucznia (zł / lekcja)"
              name="ratePerLesson"
              type="text"
              inputMode="decimal"
              defaultValue="0"
              hint="Kwota, którą płaci uczeń. Nauczyciel jej nie zobaczy."
            />
            <SelectField
              label="Nauczyciel"
              name="teacherId"
              options={[
                { value: "", label: "— bez przypisania —" },
                ...teachers.map((t) => ({ value: t.id, label: t.fullName })),
              ]}
            />
          </ActionForm>
        </div>
      </div>
    </>
  );
}
