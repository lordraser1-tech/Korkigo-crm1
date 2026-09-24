import { requirePage } from "@/lib/auth";
import { getBillingSettings } from "@/lib/services/billing";
import { updateBillingSettingsAction } from "@/app/actions/billing";
import { changeOwnPasswordAction } from "@/app/actions/teachers";
import { ActionForm, Field } from "@/components/forms";
import { PageHeader } from "@/components/ui";

export default async function AdminSettingsPage() {
  const actor = await requirePage("ADMIN");
  const settings = await getBillingSettings(actor);

  return (
    <>
      <PageHeader
        title="Ustawienia"
        description="Dane wystawcy drukowane na rachunkach i domyślny termin płatności."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Dane do rachunków
          </h2>
          <ActionForm
            action={updateBillingSettingsAction}
            submitLabel="Zapisz dane"
          >
            <Field
              label="Nazwa wystawcy"
              name="sellerName"
              defaultValue={settings.sellerName}
              placeholder="Imię i nazwisko"
            />
            <Field
              label="Adres"
              name="sellerAddress"
              defaultValue={settings.sellerAddress}
              placeholder="ul. Przykładowa 1, 00-000 Miasto"
            />
            <Field
              label="Kontakt"
              name="sellerContact"
              defaultValue={settings.sellerContact}
              placeholder="e-mail, telefon"
            />
            <Field
              label="Numer konta"
              name="bankAccount"
              defaultValue={settings.bankAccount}
              placeholder="PL00 0000 0000 0000 0000 0000 0000"
            />
            <Field
              label="Adnotacja podatkowa"
              name="sellerTaxNote"
              defaultValue={settings.sellerTaxNote}
              hint="Drukowana w stopce rachunku."
            />
            <Field
              label="Domyślny termin płatności (dni)"
              name="paymentTermDays"
              type="number"
              min={0}
              max={120}
              defaultValue={settings.paymentTermDays}
              required
            />
            <Field
              label="Dodatkowa stopka"
              name="invoiceFooter"
              defaultValue={settings.invoiceFooter}
            />
          </ActionForm>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Dane wystawcy są kopiowane na rachunek w chwili wystawienia —
            późniejsza zmiana nie zmienia dokumentów już wydanych uczniom.
          </p>
        </div>

        <div className="card h-fit p-5">
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
    </>
  );
}
