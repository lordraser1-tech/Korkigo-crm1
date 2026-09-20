import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { getStudent } from "@/lib/services/students";
import { listTeachers } from "@/lib/services/teachers";
import { listLessons } from "@/lib/services/lessons";
import { NotFoundError } from "@/lib/errors";
import { deleteStudentAction, updateStudentAction } from "@/app/actions/students";
import { ActionForm, Field, SelectField } from "@/components/forms";
import { LessonList } from "@/components/lesson-list";
import { PageHeader, StudentStatusBadge } from "@/components/ui";

export default async function AdminStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { id } = await params;

  const student = await getStudent(actor, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [teachers, lessons] = await Promise.all([
    listTeachers(actor, { includeInactive: true }),
    listLessons(actor, { studentId: student.id }),
  ]);

  return (
    <>
      <PageHeader
        title={student.fullName}
        description={
          [student.languageLevel, student.subject].filter(Boolean).join(" • ") ||
          "Karta ucznia"
        }
        actions={
          <Link href="/admin/uczniowie" className="btn-secondary">
            ← Wróć do listy
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Dane i stawka</h2>
              <StudentStatusBadge status={student.status} />
            </div>
            <ActionForm action={updateStudentAction} submitLabel="Zapisz zmiany">
              <input type="hidden" name="id" value={student.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Imię" name="firstName" defaultValue={student.firstName} required />
                <Field label="Nazwisko" name="lastName" defaultValue={student.lastName} required />
              </div>
              <Field
                label="Stawka ucznia (zł / lekcja)"
                name="ratePerLesson"
                inputMode="decimal"
                defaultValue={student.ratePerLesson?.toFixed(2) ?? "0.00"}
                hint="Widoczna wyłącznie w panelu administratora."
                required
              />
              <SelectField
                label="Nauczyciel"
                name="teacherId"
                defaultValue={student.teacherId ?? ""}
                options={[
                  { value: "", label: "— bez przypisania —" },
                  ...teachers.map((t) => ({ value: t.id, label: t.fullName })),
                ]}
              />
              <Field label="Telefon" name="contactPhone" defaultValue={student.contactPhone} />
              <Field label="E-mail" name="contactEmail" type="email" defaultValue={student.contactEmail} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Poziom" name="languageLevel" defaultValue={student.languageLevel} />
                <Field label="Przedmiot" name="subject" defaultValue={student.subject} />
              </div>
              <Field label="Opiekun" name="parentName" defaultValue={student.parentName} />
              <Field label="Telefon opiekuna" name="parentPhone" defaultValue={student.parentPhone} />
              <Field label="E-mail opiekuna" name="parentEmail" type="email" defaultValue={student.parentEmail} />
              <SelectField
                label="Status"
                name="status"
                defaultValue={student.status}
                options={[
                  { value: "ACTIVE", label: "Aktywny" },
                  { value: "PAUSED", label: "Wstrzymany" },
                  { value: "ENDED", label: "Zakończony" },
                ]}
              />
            </ActionForm>
          </div>

          <div className="card p-5">
            <h2 className="mb-2 text-base font-semibold text-slate-900">
              Usunięcie ucznia
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Ucznia z historią lekcji nie da się usunąć — zmień jego status na
              „Zakończony”, żeby zachować rozliczenia.
            </p>
            <ActionForm
              action={deleteStudentAction}
              submitLabel="Usuń ucznia"
              className="space-y-3"
            >
              <input type="hidden" name="id" value={student.id} />
            </ActionForm>
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            Historia lekcji ({lessons.length})
          </h2>
          <LessonList
            lessons={lessons}
            showTeacher
            emptyText="Brak lekcji dla tego ucznia."
          />
        </section>
      </div>
    </>
  );
}
