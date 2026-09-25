import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { getStudent } from "@/lib/services/students";
import { listLessons } from "@/lib/services/lessons";
import { getSpeakingClub } from "@/lib/services/speaking-club";
import { getLessonPaymentStates } from "@/lib/services/billing";
import { SpeakingClubCard } from "@/components/speaking-club-card";
import { NotFoundError } from "@/lib/errors";
import { updateStudentAction } from "@/app/actions/students";
import { ActionForm, Field, SelectField } from "@/components/forms";
import { LessonHistory, parseHistoryFilter } from "@/components/lesson-history";
import { StudentContactFields } from "@/components/student-contact-fields";
import { StudentReminderCard } from "@/components/student-reminder-card";
import { StudentSubjects } from "@/components/student-subjects";
import { PaymentFlagBadge } from "@/components/billing";
import { PageHeader, StudentStatusBadge } from "@/components/ui";

export default async function TeacherStudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ historia?: string }>;
}) {
  const actor = await requirePage("TEACHER");
  const { id } = await params;
  const filter = parseHistoryFilter((await searchParams).historia);

  const student = await getStudent(actor, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [lessons, speakingClub] = await Promise.all([
    listLessons(actor, { studentId: student.id }),
    getSpeakingClub(actor, student.id),
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
          <Link href="/nauczyciel/uczniowie" className="btn-secondary">
            ← Wróć do listy
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <div className="card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Dane ucznia</h2>
              <div className="flex items-center gap-2">
                <PaymentFlagBadge flag={student.paymentFlag} />
                <StudentStatusBadge status={student.status} />
              </div>
            </div>
            <ActionForm action={updateStudentAction} submitLabel="Zapisz zmiany">
              <input type="hidden" name="id" value={student.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Imię" name="firstName" defaultValue={student.firstName} required />
                <Field label="Nazwisko" name="lastName" defaultValue={student.lastName} required />
              </div>
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
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
              Stawka ucznia i jego rachunki są widoczne wyłącznie dla
              administratora — tutaj widzisz jedynie, czy rozliczenia są na
              bieżąco. Twoje wynagrodzenie znajdziesz w zakładce „Moje wypłaty”.
            </p>
          </div>

          <StudentReminderCard student={student} canDisconnect={false} />
        </div>

        <section className="space-y-6">
          <SpeakingClubCard studentId={student.id} club={speakingClub} />

          <StudentSubjects lessons={lessons} />

          <div>
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              Historia lekcji ({lessons.length})
            </h2>
            <LessonHistory
              lessons={lessons}
              payments={payments}
              filter={filter}
              hrefFor={(key) =>
                `/nauczyciel/uczniowie/${student.id}?historia=${key}`
              }
            />
          </div>
        </section>
      </div>
    </>
  );
}
