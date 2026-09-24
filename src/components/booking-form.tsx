import { createLessonsAction } from "@/app/actions/lessons";
import { ActionForm, Field, SelectField } from "@/components/forms";
import { SlotPicker } from "@/components/slot-picker";
import type { ScheduleSlot } from "@/lib/services/schedule";

/** Zapis ucznia na lekcję w wybranym oknie dyspozycyjności. */
export function BookingForm({
  students,
  slots,
  defaultWallClock,
  teacherId,
}: {
  students: Array<{ id: string; fullName: string }>;
  slots: ScheduleSlot[];
  defaultWallClock: string;
  /** Admin zapisuje w imieniu konkretnego nauczyciela. */
  teacherId?: string | null;
}) {
  if (students.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Najpierw dodaj ucznia — wtedy zapiszesz go na lekcję.
      </p>
    );
  }

  return (
    <ActionForm
      action={createLessonsAction}
      submitLabel="Zapisz na lekcję"
      resetOnSuccess
    >
      {teacherId ? (
        <input type="hidden" name="teacherId" value={teacherId} />
      ) : null}
      <SelectField
        label="Uczeń"
        name="studentId"
        required
        options={students.map((student) => ({
          value: student.id,
          label: student.fullName,
        }))}
      />
      <SlotPicker
        slots={slots.map((slot) => ({
          wallClock: slot.wallClock,
          label: slot.label,
        }))}
        defaultValue={defaultWallClock}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Czas trwania (min)"
          name="durationMinutes"
          type="number"
          min={15}
          max={480}
          step={5}
          defaultValue={60}
          required
        />
        <SelectField
          label="Typ"
          name="type"
          defaultValue="ONE_OFF"
          options={[
            { value: "ONE_OFF", label: "Jednorazowa" },
            { value: "RECURRING", label: "Cykliczna (co tydzień)" },
          ]}
        />
      </div>
      <Field
        label="Liczba tygodni (dla cyklicznej)"
        name="repeatWeeks"
        type="number"
        min={1}
        max={52}
        defaultValue={1}
        hint="Np. 12 zapisze ucznia na 12 kolejnych tygodni o tej samej porze."
      />
    </ActionForm>
  );
}
