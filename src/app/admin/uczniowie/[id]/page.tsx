import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { getStudent } from "@/lib/services/students";
import { listTeachers } from "@/lib/services/teachers";
import { listLessons } from "@/lib/services/lessons";
import { getStudentBilling, getLessonPaymentStates } from "@/lib/services/billing";
import { getStudentRates, listSubjectLevels } from "@/lib/services/subjects";
import { getSpeakingClub } from "@/lib/services/speaking-club";
import { RateEditor } from "@/components/rate-editor";
import { SpeakingClubCard } from "@/components/speaking-club-card";
import { NotFoundError } from "@/lib/errors";
import { deleteStudentAction, updateStudentAction } from "@/app/actions/students";
import { ActionForm, Field, SelectField } from "@/components/forms";
import { LessonHistory, parseHistoryFilter } from "@/components/lesson-history";
import { StudentBillingCard } from "@/components/student-billing-card";
import { StudentContactFields } from "@/components/student-contact-fields";
import { StudentReminderCard } from "@/components/student-reminder-card";
import { StudentSubjects } from "@/components/student-subjects";
import { BILLING_MODE_OPTIONS } from "@/components/billing";
import { PageHeader, StudentStatusBadge } from "@/components/ui";

export default async function AdminStudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ historia?: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { id } = await params;
  const filter = parseHistoryFilter((await searchParams).historia);

  const student = await getStudent(actor, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [teachers, lessons, billing, rates, speakingClub, levels] =
    await Promise.all([
      listTeachers(actor, { includeInactive: true }),
      listLessons(actor, { studentId: student.id }),
      getStudentBilling(actor, student.id),
      getStudentRates(actor, student.id),
      getSpeakingClub(actor, student.id),
      listSubjectLevels(actor),
    ]);
  const payments = await getLessonPaymentStates(
    actor,
    lessons.map((lesson) => lesson.id)
  );

  return (
    <>
      <PageHeader
        title={student.fullName}
        description={
          student.languageLevel
            ? `Poziom językowy: ${student.languageLevel}`
            : "Karta ucznia"
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

              <SelectField
                label="Tryb rozliczeń"
                name="billingMode"
                defaultValue={student.billingMode ?? "POSTPAID"}
                options={BILLING_MODE_OPTIONS}
                hint="Decyduje, jak wystawiamy rachunki temu uczniowi."
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
              <StudentContactFields student={student} />
              <Field
                label="Poziom językowy"
                name="languageLevel"
                defaultValue={student.languageLevel}
                hint="Opisowy, np. A2. Przedmiot i poziom wybiera się przy lekcji."
              />
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

          <StudentReminderCard student={student} canDisconnect />

          <div className="card p-5">
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              Ceny ucznia
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Cena za lekcję, osobno dla każdego przedmiotu i poziomu.
              Widoczna wyłącznie w panelu administratora.
            </p>
            <RateEditor kind="student" ownerId={student.id} rates={rates.rates} />
          </div>

          <SpeakingClubCard studentId={student.id} club={speakingClub} canUndo />

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

        <section className="space-y-6">
          <StudentBillingCard
            studentId={student.id}
            billingMode={student.billingMode ?? "POSTPAID"}
            billing={billing}
            levels={levels.map((level) => ({ id: level.id, label: level.label }))}
          />

          <StudentSubjects lessons={lessons} rates={rates.rates} />

          <div>
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              Historia lekcji ({lessons.length})
            </h2>
            <LessonHistory
              lessons={lessons}
              payments={payments}
              filter={filter}
              hrefFor={(key) => `/admin/uczniowie/${student.id}?historia=${key}`}
              showTeacher
              isAdmin
            />
          </div>
        </section>
      </div>
    </>
  );
}
