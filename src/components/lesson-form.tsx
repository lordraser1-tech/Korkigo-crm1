import { createLessonsAction } from "@/app/actions/lessons";
import { ActionForm, Field, SelectField } from "@/components/forms";

export function LessonForm({
  students,
  teachers,
  defaultWallClock,
}: {
  students: Array<{ id: string; fullName: string }>;
  /** Tylko panel admina wybiera nauczyciela — nauczyciel planuje zawsze sobie. */
  teachers?: Array<{ id: string; fullName: string }>;
  defaultWallClock: string;
}) {
  if (students.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Najpierw dodaj ucznia — wtedy zaplanujesz dla niego lekcje.
      </p>
    );
  }

  return (
    <ActionForm
      action={createLessonsAction}
      submitLabel="Dodaj do kalendarza"
      resetOnSuccess
    >
      <SelectField
        label="Uczeń"
        name="studentId"
        required
        options={students.map((s) => ({ value: s.id, label: s.fullName }))}
      />
      {teachers ? (
        <SelectField
          label="Nauczyciel"
          name="teacherId"
          hint="Puste = nauczyciel przypisany do ucznia."
          options={[
            { value: "", label: "— przypisany do ucznia —" },
            ...teachers.map((t) => ({ value: t.id, label: t.fullName })),
          ]}
        />
      ) : null}
      <Field
        label="Data i godzina"
        name="scheduledAt"
        type="datetime-local"
        defaultValue={defaultWallClock}
        required
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
        hint="Np. 12 utworzy 12 lekcji w tym samym dniu tygodnia i o tej samej godzinie."
      />
    </ActionForm>
  );
}
