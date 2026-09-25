import Link from "next/link";
import { deleteLessonAction, setLessonStatusAction } from "@/app/actions/lessons";
import { formatDate, formatTime, formatWeekday } from "@/lib/datetime";
import type { LessonDto } from "@/lib/services/lessons";
import type { LessonPaymentInfo } from "@/lib/services/billing";
import { LessonPaymentBadge } from "@/components/billing";
import { ConfirmButton, SubmitButton } from "@/components/forms";
import { LessonTopicForm } from "@/components/lesson-topic-form";
import { EmptyState, LessonStatusBadge } from "@/components/ui";

function groupByDay(lessons: LessonDto[]): Array<[string, LessonDto[]]> {
  const groups = new Map<string, LessonDto[]>();
  for (const lesson of lessons) {
    const date = new Date(lesson.scheduledAt);
    const key = `${formatWeekday(date)}, ${formatDate(date)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(lesson);
  }
  return [...groups.entries()];
}

function StatusForm({
  lessonId,
  status,
  label,
}: {
  lessonId: string;
  status: "COMPLETED" | "CANCELLED" | "NO_SHOW" | "SCHEDULED";
  label: string;
}) {
  return (
    <form action={setLessonStatusAction}>
      <input type="hidden" name="id" value={lessonId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant="secondary" small>
        {label}
      </SubmitButton>
    </form>
  );
}

export function LessonList({
  lessons,
  showTeacher = false,
  studentHrefBase,
  canDelete = true,
  emptyText = "Brak lekcji w wybranym okresie.",
  payments,
  canEditTopic = true,
}: {
  lessons: LessonDto[];
  showTeacher?: boolean;
  studentHrefBase?: string;
  canDelete?: boolean;
  emptyText?: string;
  /** Status płatności per lekcja — bez kwot, więc bezpieczny też dla nauczyciela. */
  payments?: Map<string, LessonPaymentInfo>;
  /** Temat zajęć wpisywany przy lekcji. */
  canEditTopic?: boolean;
}) {
  if (lessons.length === 0) return <EmptyState>{emptyText}</EmptyState>;

  return (
    <div className="space-y-5">
      {groupByDay(lessons).map(([day, dayLessons]) => (
        <section key={day}>
          <h3 className="mb-2 text-sm font-semibold capitalize text-slate-600">
            {day}
          </h3>
          <ul className="space-y-2">
            {dayLessons.map((lesson) => (
              <li
                key={lesson.id}
                className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-3"
              >
                <div className="min-w-24 text-sm font-semibold text-slate-900">
                  {formatTime(new Date(lesson.scheduledAt))}
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    ({lesson.durationMinutes} min)
                  </span>
                </div>
                <div className="min-w-40 flex-1 text-sm">
                  {studentHrefBase ? (
                    <Link
                      href={`${studentHrefBase}/${lesson.studentId}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {lesson.studentName}
                    </Link>
                  ) : (
                    <span className="font-medium">{lesson.studentName}</span>
                  )}
                  {showTeacher ? (
                    <span className="ml-2 text-xs text-slate-500">
                      • {lesson.teacherName}
                    </span>
                  ) : null}
                  <span className="ml-2 text-xs text-slate-500">
                    {lesson.subjectLabel}
                  </span>
                  {lesson.seriesId ? (
                    <span className="ml-2 text-xs text-slate-400">cykliczna</span>
                  ) : null}
                  {canEditTopic ? (
                    <LessonTopicForm lessonId={lesson.id} topic={lesson.topic} />
                  ) : lesson.topic ? (
                    <p className="mt-1 text-xs text-slate-600">
                      Temat: {lesson.topic}
                    </p>
                  ) : null}
                </div>
                <LessonStatusBadge status={lesson.status} />
                {payments?.get(lesson.id) ? (
                  <LessonPaymentBadge payment={payments.get(lesson.id)!} />
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {lesson.status !== "COMPLETED" ? (
                    <StatusForm
                      lessonId={lesson.id}
                      status="COMPLETED"
                      label="Zrealizowana"
                    />
                  ) : null}
                  {lesson.status !== "CANCELLED" ? (
                    <StatusForm
                      lessonId={lesson.id}
                      status="CANCELLED"
                      label="Odwołana"
                    />
                  ) : null}
                  {lesson.status !== "NO_SHOW" ? (
                    <StatusForm
                      lessonId={lesson.id}
                      status="NO_SHOW"
                      label="Nieobecność"
                    />
                  ) : null}
                  {lesson.status !== "SCHEDULED" ? (
                    <StatusForm
                      lessonId={lesson.id}
                      status="SCHEDULED"
                      label="Cofnij"
                    />
                  ) : null}
                  {canDelete ? (
                    <form action={deleteLessonAction}>
                      <input type="hidden" name="id" value={lesson.id} />
                      <ConfirmButton message="Usunąć tę lekcję z kalendarza?">
                        Usuń
                      </ConfirmButton>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
