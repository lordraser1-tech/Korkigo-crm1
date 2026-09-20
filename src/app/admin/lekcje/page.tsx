import { requirePage } from "@/lib/auth";
import { listLessons } from "@/lib/services/lessons";
import { listStudentOptions } from "@/lib/services/students";
import { listTeachers } from "@/lib/services/teachers";
import {
  currentMonthKey,
  monthRange,
  toWallClockInput,
} from "@/lib/datetime";
import { LessonForm } from "@/components/lesson-form";
import { LessonList } from "@/components/lesson-list";
import { MonthNav } from "@/components/month-nav";
import { PageHeader } from "@/components/ui";

export default async function AdminLessonsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; teacherId?: string }>;
}) {
  const actor = await requirePage("ADMIN");
  const { m, teacherId } = await searchParams;
  const monthKey = /^\d{4}-\d{2}$/.test(m ?? "") ? m! : currentMonthKey();
  const { from, to } = monthRange(monthKey);

  const [lessons, students, teachers] = await Promise.all([
    listLessons(actor, { from, to, teacherId: teacherId ?? null }),
    listStudentOptions(actor),
    listTeachers(actor, { includeInactive: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Kalendarz lekcji"
        description="Wszystkie lekcje w systemie."
        actions={
          <MonthNav
            monthKey={monthKey}
            basePath="/admin/lekcje"
            extraQuery={{ teacherId }}
          />
        }
      />

      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4" method="get">
        <input type="hidden" name="m" value={monthKey} />
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
          Filtruj
        </button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <LessonList
            lessons={lessons}
            showTeacher
            studentHrefBase="/admin/uczniowie"
            emptyText="Brak lekcji w tym miesiącu."
          />
        </div>
        <div className="card h-fit p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">
            Nowa lekcja
          </h2>
          <LessonForm
            students={students}
            teachers={teachers}
            defaultWallClock={`${toWallClockInput(from).slice(0, 10)}T16:00`}
          />
        </div>
      </div>
    </>
  );
}
