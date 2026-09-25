import { requirePage } from "@/lib/auth";
import { listLessons } from "@/lib/services/lessons";
import { listStudentOptions } from "@/lib/services/students";
import { listTeachers } from "@/lib/services/teachers";
import { getLessonPaymentStates } from "@/lib/services/billing";
import {
  currentMonthKey,
  monthRange,
  toWallClockInput,
} from "@/lib/datetime";
import { LessonComposer } from "@/components/lesson-composer";
import { getLessonComposerData } from "@/lib/services/subjects";
import { createLessonsAction } from "@/app/actions/lessons";
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

  const [lessons, students, teachers, composer] = await Promise.all([
    listLessons(actor, { from, to, teacherId: teacherId ?? null }),
    listStudentOptions(actor),
    listTeachers(actor, { includeInactive: true }),
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
            payments={payments}
            showTeacher
            studentHrefBase="/admin/uczniowie"
            emptyText="Brak lekcji w tym miesiącu."
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
            teachers={teachers.map((teacher) => ({
              id: teacher.id,
              fullName: teacher.fullName,
            }))}
            teacherRates={composer.teacherRates}
            studentRates={composer.studentRates}
            defaultWallClock={`${toWallClockInput(from).slice(0, 10)}T16:00`}
          />
        </div>
      </div>
    </>
  );
}
