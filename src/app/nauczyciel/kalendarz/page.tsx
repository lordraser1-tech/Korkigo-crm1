import { requirePage } from "@/lib/auth";
import { listLessons } from "@/lib/services/lessons";
import { listStudentOptions } from "@/lib/services/students";
import {
  currentMonthKey,
  monthRange,
  toWallClockInput,
} from "@/lib/datetime";
import { LessonForm } from "@/components/lesson-form";
import { LessonList } from "@/components/lesson-list";
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

  const [lessons, students] = await Promise.all([
    listLessons(actor, { from, to }),
    listStudentOptions(actor),
  ]);

  return (
    <>
      <PageHeader
        title="Kalendarz lekcji"
        description="Planuj lekcje i odznaczaj ich realizację."
        actions={<MonthNav monthKey={monthKey} basePath="/nauczyciel/kalendarz" />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <LessonList
            lessons={lessons}
            studentHrefBase="/nauczyciel/uczniowie"
            emptyText="Brak lekcji w tym miesiącu."
          />
        </div>
        <div className="card h-fit p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Nowa lekcja
          </h2>
          <LessonForm
            students={students}
            defaultWallClock={`${toWallClockInput(from).slice(0, 10)}T16:00`}
          />
        </div>
      </div>
    </>
  );
}
