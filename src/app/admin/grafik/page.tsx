import { requirePage } from "@/lib/auth";
import { getSchedule } from "@/lib/services/schedule";
import { listTeachers } from "@/lib/services/teachers";
import { listStudentOptions } from "@/lib/services/students";
import { createAvailabilityAction } from "@/app/actions/teachers";
import { ActionForm, Field, SelectField } from "@/components/forms";
import { BookingForm } from "@/components/booking-form";
import { ScheduleWeek } from "@/components/schedule-week";
import { WeekNav } from "@/components/week-nav";
import { PageHeader, StatCard, WEEKDAY_LABEL } from "@/components/ui";

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; teacherId?: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { w, teacherId } = await searchParams;

  const [schedule, teachers] = await Promise.all([
    getSchedule(actor, { weekKey: w, teacherId }),
    listTeachers(actor),
  ]);
  const selected = teachers.find((teacher) => teacher.id === schedule.teacherId);
  const students = selected
    ? await listStudentOptions(actor, selected.id)
    : [];

  const slots = schedule.days.flatMap((day) => day.freeSlots);

  return (
    <>
      <PageHeader
        title="Grafik i dyspozycja"
        description={
          selected
            ? `Grafik: ${selected.fullName}`
            : "Dyspozycyjność i zajęcia wszystkich nauczycieli."
        }
        actions={
          <WeekNav
            weekKey={schedule.weekKey}
            weekLabel={schedule.weekLabel}
            basePath="/admin/grafik"
            extraQuery={{ teacherId }}
          />
        }
      />

      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4" method="get">
        <input type="hidden" name="w" value={schedule.weekKey} />
        <div className="w-64">
          <label className="label" htmlFor="teacherId">
            Nauczyciel
          </label>
          <select
            id="teacherId"
            name="teacherId"
            defaultValue={teacherId ?? ""}
            className="input"
          >
            <option value="">Wszyscy</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.fullName}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Pokaż grafik
        </button>
      </form>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Lekcje w tygodniu"
          value={String(schedule.totals.lessons)}
          hint="bez odwołanych"
        />
        <StatCard
          label="Bez opłaty"
          value={String(schedule.totals.unpaidLessons)}
          hint="lekcje nieopłacone lub bez rachunku"
        />
        <StatCard
          label="Dyspozycyjność"
          value={`${schedule.totals.availabilityHours} h`}
          hint={selected ? "okna nauczyciela" : "suma wszystkich nauczycieli"}
        />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
        <ScheduleWeek
          schedule={schedule}
          showTeacher={!selected}
          canManageWindows
          studentHrefBase="/admin/uczniowie"
        />

        <div className="space-y-4">
          {selected ? (
            <>
              <div className="card p-5">
                <h2 className="mb-1 text-base font-semibold text-slate-900">
                  Zapisz ucznia na lekcję
                </h2>
                <p className="mb-4 text-xs text-slate-500">
                  Lekcja zostanie przypisana nauczycielowi {selected.fullName}.
                </p>
                <BookingForm
                  students={students}
                  slots={slots}
                  defaultWallClock={
                    slots[0]?.wallClock ?? `${schedule.weekKey}T16:00`
                  }
                  teacherId={selected.id}
                />
              </div>

              <div className="card p-5">
                <h2 className="mb-1 text-base font-semibold text-slate-900">
                  Dodaj okno dyspozycyjności
                </h2>
                <p className="mb-4 text-xs text-slate-500">
                  Okno zostanie dopisane do grafiku {selected.fullName}.
                </p>
                <ActionForm
                  action={createAvailabilityAction}
                  submitLabel="Dodaj okno"
                  resetOnSuccess
                >
                  <input type="hidden" name="teacherId" value={selected.id} />
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
            </>
          ) : (
            <div className="card p-5 text-sm text-slate-600">
              <h2 className="mb-2 text-base font-semibold text-slate-900">
                Widok zbiorczy
              </h2>
              <p>
                Widzisz dyspozycyjność i lekcje wszystkich nauczycieli. Wybierz
                nauczyciela powyżej, żeby zapisać ucznia na lekcję, dodać okno
                dyspozycyjności i zobaczyć wolne godziny.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
