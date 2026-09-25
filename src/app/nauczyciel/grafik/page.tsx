import { requirePage } from "@/lib/auth";
import { getSchedule } from "@/lib/services/schedule";
import { listAvailability } from "@/lib/services/teachers";
import { listStudentOptions } from "@/lib/services/students";
import { createAvailabilityAction } from "@/app/actions/teachers";
import { ActionForm, Field, SelectField } from "@/components/forms";
import { LessonComposer } from "@/components/lesson-composer";
import { getLessonComposerData } from "@/lib/services/subjects";
import { createLessonsAction } from "@/app/actions/lessons";
import { ScheduleWeek } from "@/components/schedule-week";
import { WeekNav } from "@/components/week-nav";
import { PageHeader, StatCard, WEEKDAY_LABEL } from "@/components/ui";

export default async function TeacherSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const actor = await requirePage("TEACHER");
  const { w } = await searchParams;

  const [schedule, students, availability, composer] = await Promise.all([
    getSchedule(actor, { weekKey: w }),
    listStudentOptions(actor),
    listAvailability(actor),
    getLessonComposerData(actor),
  ]);

  const firstSlot = schedule.days.flatMap((day) => day.freeSlots)[0];

  return (
    <>
      <PageHeader
        title="Grafik i dyspozycja"
        description="Twoje okna dyspozycyjności, zapisani uczniowie i status płatności za każdą lekcję."
        actions={
          <WeekNav
            weekKey={schedule.weekKey}
            weekLabel={schedule.weekLabel}
            basePath="/nauczyciel/grafik"
          />
        }
      />

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
          hint="suma okien w tygodniu"
        />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1fr_340px]">
        <ScheduleWeek
          schedule={schedule}
          canManageWindows
          studentHrefBase="/nauczyciel/uczniowie"
        />

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              Zapisz ucznia na lekcję
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Lista podpowiada wolne godziny z Twojej dyspozycyjności w tym
              tygodniu.
            </p>
            <LessonComposer
              action={createLessonsAction}
              subjects={composer.subjects.map((subject) => ({
              id: subject.id,
              name: subject.name,
              levels: subject.levels.map((level) => ({
                id: level.id,
                name: level.name,
              })),
            }))}
              students={students.map((student) => ({
                id: student.id,
                fullName: student.fullName,
                teacherId: student.teacherId,
              }))}
              teacherRates={composer.teacherRates}
              fixedTeacherId={actor.teacherProfileId}
              slots={schedule.days.flatMap((day) => day.freeSlots)}
              defaultWallClock={firstSlot?.wallClock ?? `${schedule.weekKey}T16:00`}
              submitLabel="Zapisz na lekcję"
            />
          </div>

          <div className="card p-5">
            <h2 className="mb-1 text-base font-semibold text-slate-900">
              Dodaj okno dyspozycyjności
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Okna powtarzają się co tydzień. Masz ich teraz {availability.length}.
            </p>
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
        </div>
      </div>
    </>
  );
}
