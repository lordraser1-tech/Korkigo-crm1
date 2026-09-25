import { requirePage } from "@/lib/auth";
import { getMyTeacherProfile, listAvailability } from "@/lib/services/teachers";
import { getTeacherRates } from "@/lib/services/subjects";
import {
  changeOwnPasswordAction,
  createAvailabilityAction,
  deleteAvailabilityAction,
  updateTeacherAction,
} from "@/app/actions/teachers";
import { ActionForm, ConfirmButton, Field, SelectField } from "@/components/forms";
import { formatPLN } from "@/lib/money";
import { PageHeader, WEEKDAY_LABEL } from "@/components/ui";

export default async function TeacherSettingsPage() {
  const actor = await requirePage("TEACHER");
  const [profile, availability, rates] = await Promise.all([
    getMyTeacherProfile(actor),
    listAvailability(actor),
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
            <p className="mb-4 text-xs text-slate-500">
              Powtarzalne okna, w których możesz prowadzić lekcje. Widok
              tygodnia i zapisy uczniów znajdziesz w zakładce „Grafik
              i dyspozycja”.
            </p>

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
              <p className="mb-4 text-sm text-slate-500">
                Nie masz jeszcze zdefiniowanych okien.
              </p>
            )}

            <ActionForm
              action={createAvailabilityAction}
              submitLabel="Dodaj okno"
              resetOnSuccess
            >
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
