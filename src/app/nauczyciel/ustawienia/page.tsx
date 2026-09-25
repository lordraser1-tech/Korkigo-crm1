import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { getMyTeacherProfile } from "@/lib/services/teachers";
import { getTeacherRates } from "@/lib/services/subjects";
import {
  changeOwnPasswordAction,
  updateTeacherAction,
} from "@/app/actions/teachers";
import { ActionForm, Field } from "@/components/forms";
import { formatPLN } from "@/lib/money";
import { PageHeader } from "@/components/ui";

export default async function TeacherSettingsPage() {
  const actor = await requirePage("TEACHER");
  const [profile, rates] = await Promise.all([
    getMyTeacherProfile(actor),
    getTeacherRates(actor, actor.teacherProfileId),
  ]);

  return (
    <>
      <PageHeader
        title="Ustawienia"
        description="Twoje dane, dyspozycyjność i hasło."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Moje dane</h2>
          <ActionForm action={updateTeacherAction} submitLabel="Zapisz dane">
            <input type="hidden" name="id" value={profile.id} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Imię" name="firstName" defaultValue={profile.firstName} required />
              <Field label="Nazwisko" name="lastName" defaultValue={profile.lastName} required />
            </div>
            <Field label="Telefon" name="phone" defaultValue={profile.phone} />
            <Field
              label="Poziom / certyfikaty"
              name="level"
              defaultValue={profile.level}
              placeholder="np. C1, certyfikat glottodydaktyczny"
            />
            <Field
              label="Numer konta bankowego"
              name="bankAccount"
              defaultValue={profile.bankAccount}
              placeholder="PL00 0000 0000 0000 0000 0000 0000"
              hint="Do wypłat. Widzisz go tylko Ty i administrator."
            />
          </ActionForm>
          <div className="mt-5 rounded-lg bg-slate-50 p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Twoje stawki za lekcję
            </p>
            {rates.rates.filter((rate) => rate.amount !== null).length === 0 ? (
              <p className="text-sm text-slate-600">
                Nie masz jeszcze ustalonych stawek.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {rates.rates
                  .filter((rate) => rate.amount !== null)
                  .map((rate) => (
                    <li
                      key={rate.subjectLevelId}
                      className="flex justify-between gap-3"
                    >
                      <span className="text-slate-700">{rate.label}</span>
                      <span className="font-semibold text-slate-900">
                        {formatPLN(rate.amount ?? 0)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Stawki ustala administrator — w razie pytań skontaktuj się z nim.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              Dyspozycyjność
            </h2>
            <p className="text-sm text-slate-600">
              Dyspozycyjność ustawiasz teraz na konkretne dni, w zakładce{" "}
              <Link
                href="/nauczyciel/grafik"
                className="font-medium text-brand-700 hover:underline"
              >
                Grafik i dyspozycja
              </Link>
              .
            </p>
          </div>

          <div className="card p-5">
            <h2 className="mb-4 text-base font-semibold text-slate-900">
              Zmiana hasła
            </h2>
            <ActionForm
              action={changeOwnPasswordAction}
              submitLabel="Zmień hasło"
              resetOnSuccess
            >
              <Field label="Obecne hasło" name="currentPassword" type="password" required />
              <Field label="Nowe hasło" name="newPassword" type="password" required />
              <Field label="Powtórz nowe hasło" name="confirmPassword" type="password" required />
            </ActionForm>
          </div>
        </div>
      </div>
    </>
  );
}
