import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { getTeacher } from "@/lib/services/teachers";
import { getTeacherRates } from "@/lib/services/subjects";
import { getPayoutDue, listPayouts } from "@/lib/services/payouts";
import { TeacherPayoutCard } from "@/components/teacher-payout-card";
import { RateEditor } from "@/components/rate-editor";
import { listStudents } from "@/lib/services/students";
import { getTeacherEarnings } from "@/lib/services/finance";
import { NotFoundError } from "@/lib/errors";
import {
  resetTeacherPasswordAction,
  updateTeacherAction,
} from "@/app/actions/teachers";
import { ActionForm, Field, SelectField } from "@/components/forms";
import { StudentTable } from "@/components/student-table";
import { currentMonthKey, formatMonthLabel } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";
import { PageHeader, StatCard } from "@/components/ui";

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
  const [students, earnings, rates, payoutDue, payouts] = await Promise.all([
    listStudents(actor, { teacherId: teacher.id }),
    getTeacherEarnings(actor, teacher.id, monthKey),
    getTeacherRates(actor, teacher.id),
    getPayoutDue(actor, teacher.id),
    listPayouts(actor, teacher.id),
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
        <StatCard
          label="Ustalone stawki"
          value={String(teacher.rateCount)}
          hint="przedmiotów/poziomów"
        />
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
                label="Numer konta bankowego"
                name="bankAccount"
                defaultValue={teacher.bankAccount}
                hint="Do wypłat."
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
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              Stawki nauczyciela
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Kwota wypłacana za zrealizowaną lekcję, osobno dla każdego
              przedmiotu i poziomu. Puste pole = brak stawki, czyli blokada
              zapisu lekcji.
            </p>
            <RateEditor kind="teacher" ownerId={teacher.id} rates={rates.rates} />
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
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              Dyspozycyjność
            </h2>
            <p className="text-sm text-slate-600">
              Okna ustawiasz na konkretne dni w{" "}
              <Link
                href={`/admin/grafik?teacherId=${teacher.id}`}
                className="font-medium text-brand-700 hover:underline"
              >
                Grafiku
              </Link>
              .
            </p>
          </div>

          <TeacherPayoutCard
            teacherId={teacher.id}
            bankAccount={teacher.bankAccount}
            due={payoutDue}
            payouts={payouts}
          />
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
