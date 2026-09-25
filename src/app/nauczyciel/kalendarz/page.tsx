import { requirePage } from "@/lib/auth";
import { listLessons } from "@/lib/services/lessons";
import { listStudentOptions } from "@/lib/services/students";
import { getLessonPaymentStates } from "@/lib/services/billing";
import {
  currentMonthKey,
  monthRange,
  toWallClockInput,
} from "@/lib/datetime";
import { LessonComposer } from "@/components/lesson-composer";
import { getLessonComposerData } from "@/lib/services/subjects";
import { createLessonsAction } from "@/app/actions/lessons";
import { CalendarView } from "@/components/calendar-view";
import { LessonList } from "@/components/lesson-list";
import { LessonMonth } from "@/components/lesson-month";
import { MonthNav } from "@/components/month-nav";
import { PageHeader } from "@/components/ui";

export default async function TeacherCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const actor = await requirePage("TEACHER");
  const { m } = await searchParams;
  const monthKey = /^\d{4}-\d{2}$/.test(m ?? "") ? m! : currentMonthKey();
  const { from, to } = monthRange(monthKey);

  const [lessons, students, composer] = await Promise.all([
    listLessons(actor, { from, to }),
    listStudentOptions(actor),
    getLessonComposerData(actor),
  ]);
  const payments = await getLessonPaymentStates(
    actor,
    lessons.map((lesson) => lesson.id)
  );

  return (
    <>
      <PageHeader
        title="Kalendarz lekcji"
        description="Planuj lekcje i odznaczaj ich realizację."
        actions={<MonthNav monthKey={monthKey} basePath="/nauczyciel/kalendarz" />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <CalendarView
            list={
              <LessonList
                lessons={lessons}
                payments={payments}
                studentHrefBase="/nauczyciel/uczniowie"
                emptyText="Brak lekcji w tym miesiącu."
              />
            }
            month={
              <LessonMonth
                monthKey={monthKey}
                lessons={lessons}
                payments={payments}
              />
            }
          />
        </div>
        <div className="card h-fit p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Nowa lekcja
          </h2>
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
            defaultWallClock={`${toWallClockInput(from).slice(0, 10)}T16:00`}
          />
        </div>
      </div>
    </>
  );
}
