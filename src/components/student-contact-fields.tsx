import { Field, SelectField } from "@/components/forms";

export const REMINDER_CHANNEL_OPTIONS = [
  { value: "NONE", label: "Brak przypomnień" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "SMS", label: "SMS" },
];

/**
 * Kontakt i kanał przypomnień — ten sam zestaw pól w obu panelach.
 * Instagram i Telegram mają tę samą widoczność co e-mail i telefon;
 * `meetingLink` jest celowo edytowalny także przez nauczyciela, bo to on
 * najczęściej zakłada pokój na lekcję.
 */
export function StudentContactFields({
  student,
}: {
  student: {
    contactPhone: string | null;
    contactEmail: string | null;
    contactInstagram: string | null;
    contactTelegram: string | null;
    meetingLink: string | null;
    reminderChannel: string;
  };
}) {
  return (
    <>
      <Field label="Telefon" name="contactPhone" defaultValue={student.contactPhone} />
      <Field
        label="E-mail"
        name="contactEmail"
        type="email"
        defaultValue={student.contactEmail}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Instagram"
          name="contactInstagram"
          defaultValue={student.contactInstagram}
          hint="np. @nazwa"
        />
        <Field
          label="Telegram"
          name="contactTelegram"
          defaultValue={student.contactTelegram}
          hint="np. @nazwa"
        />
      </div>
      <Field
        label="Link do pokoju"
        name="meetingLink"
        defaultValue={student.meetingLink}
        hint="Meet, Zoom albo inny — pokazujemy go przy lekcjach tego ucznia."
      />
      <SelectField
        label="Przypomnienia o lekcji"
        name="reminderChannel"
        defaultValue={student.reminderChannel}
        options={REMINDER_CHANNEL_OPTIONS}
        hint="Wysyłamy je dobę przed lekcją."
      />
    </>
  );
}
