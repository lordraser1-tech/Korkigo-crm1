import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { getTeacher, listAvailability } from "@/lib/services/teachers";
import { listStudents } from "@/lib/services/students";
import { getTeacherEarnings } from "@/lib/services/finance";
import { NotFoundError } from "@/lib/errors";
import {
  createAvailabilityAction,
  deleteAvailabilityAction,
  resetTeacherPasswordAction,
  updateTeacherAction,
} from "@/app/actions/teachers";
import { ActionForm, ConfirmButton, Field, SelectField } from "@/components/forms";
import { StudentTable } from "@/components/student-table";
import { currentMonthKey, formatMonthLabel } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";
import { PageHeader, StatCard, WEEKDAY_LABEL } from "@/components/ui";

export default async function AdminTeacherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { id } = await params;

  const teacher = await getTeacher(actor, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  const monthKey = currentMonthKey();
  const [students, availability, earnings] = await Promise.all([
    listStudents(actor, { teacherId: teacher.id }),
    listAvailability(actor, teacher.id),
    getTeacherEarnings(actor, teacher.id, monthKey),
  ]);

  return (
    <>
      <PageHeader
        title={teacher.fullName}
        description={teacher.email}
        actions={
          <Link href="/admin/nauczyciele" className="btn-secondary">
            ← Wróć do listy
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stawka" value={formatPLN(teacher.ratePerLesson)} hint="za lekcję" />
        <StatCard label="Uczniowie" value={String(teacher.studentCount)} />
        <StatCard
          label="Lekcje zrealizowane"
          value={String(earnings.completedLessons)}
          hint={formatMonthLabel(monthKey)}
        />
        <StatCard
          label="Do wypłaty"
          value={formatPLN(earnings.total)}
          hint={formatMonthLabel(monthKey)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Dane i stawka
            </h2>
            <ActionForm action={updateTeacherAction} submitLabel="Zapisz zmiany">
              <input type="hidden" name="id" value={teacher.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Imię" name="firstName" defaultValue={teacher.firstName} required />
                <Field label="Nazwisko" name="lastName" defaultValue={teacher.lastName} required />
              </div>
              <Field label="Telefon" name="phone" defaultValue={teacher.phone} />
              <Field label="Poziom / certyfikaty" name="level" defaultValue={teacher.level} />
              <Field
                label="Stawka nauczyciela (zł / lekcja)"
                name="ratePerLesson"
                inputMode="decimal"
                defaultValue={teacher.ratePerLesson.toFixed(2)}
                required
              />
              <SelectField
                label="Status konta"
                name="active"
                defaultValue={teacher.active ? "true" : "false"}
                options={[
                  { value: "true", label: "Aktywne" },
                  { value: "false", label: "Zablokowane (brak logowania)" },
                ]}
              />
            </ActionForm>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Reset hasła
            </h2>
            <ActionForm
              action={resetTeacherPasswordAction}
              submitLabel="Ustaw nowe hasło"
              resetOnSuccess
            >
              <input type="hidden" name="id" value={teacher.id} />
              <Field
                label="Nowe hasło"
                name="newPassword"
                type="password"
                required
                hint="Min. 8 znaków. Przekaż je nauczycielowi bezpiecznym kanałem."
              />
            </ActionForm>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Dyspozycyjność
            </h2>
            {availability.length > 0 ? (
              <ul className="mb-4 space-y-2">
                {availability.map((slot) => (
                  <li
                    key={slot.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{WEEKDAY_LABEL[slot.dayOfWeek]}</span>{" "}
                      <span className="text-slate-600">
                        {slot.startTime}–{slot.endTime}
                      </span>
                    </span>
                    <form action={deleteAvailabilityAction}>
                      <input type="hidden" name="id" value={slot.id} />
                      <ConfirmButton message="Usunąć to okno dyspozycyjności?">
                        Usuń
                      </ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-slate-500">Brak zdefiniowanych okien.</p>
            )}
            <ActionForm
              action={createAvailabilityAction}
              submitLabel="Dodaj okno"
              resetOnSuccess
            >
              <input type="hidden" name="teacherId" value={teacher.id} />
              <SelectField
                label="Dzień tygodnia"
                name="dayOfWeek"
                defaultValue="1"
                options={WEEKDAY_LABEL.map((label, index) => ({
                  value: String(index),
                  label,
                }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Od" name="startTime" type="time" defaultValue="16:00" required />
                <Field label="Do" name="endTime" type="time" defaultValue="20:00" required />
              </div>
            </ActionForm>
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            Uczniowie nauczyciela ({students.length})
          </h2>
          <StudentTable students={students} hrefBase="/admin/uczniowie" showRate />
        </section>
      </div>
    </>
  );
}
