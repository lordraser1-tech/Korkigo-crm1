import type { LessonDto } from "@/lib/services/lessons";
import type { LessonPaymentInfo } from "@/lib/services/billing";
import { formatTime, monthGridDays, toWallClockInput } from "@/lib/datetime";
import { LESSON_STATUS_LABEL } from "@/components/ui";

const WEEKDAYS = ["pon", "wt", "śr", "czw", "pt", "sob", "ndz"];

const STATUS_DOT: Record<string, string> = {
  SCHEDULED: "bg-slate-400",
  COMPLETED: "bg-[var(--color-status-good)]",
  CANCELLED: "bg-[var(--color-status-serious)]",
  NO_SHOW: "bg-[var(--color-status-critical)]",
};

/**
 * Widok miesięczny — szybkie „co się dzieje w tym miesiącu”. Odznaczanie
 * statusów zostaje w widoku listy; tutaj chodzi o rozkład lekcji w czasie.
 */
export function LessonMonth({
  monthKey,
  lessons,
  payments,
  showTeacher = false,
}: {
  monthKey: string;
  lessons: LessonDto[];
  payments?: Map<string, LessonPaymentInfo>;
  showTeacher?: boolean;
}) {
  const byDay = new Map<string, LessonDto[]>();
  for (const lesson of lessons) {
    const key = toWallClockInput(new Date(lesson.scheduledAt)).slice(0, 10);
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(lesson);
  }

  const today = toWallClockInput(new Date()).slice(0, 10);
  const days = monthGridDays(monthKey);

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(({ dateKey, inMonth }) => {
          const dayLessons = byDay.get(dateKey) ?? [];
          return (
            <div
              key={dateKey}
              className={`min-h-24 border-b border-r border-slate-100 p-1.5 ${
                inMonth ? "" : "bg-slate-50/60"
              }`}
            >
              <p
                className={`mb-1 text-xs font-medium ${
                  dateKey === today
                    ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white"
                    : inMonth
                      ? "text-slate-600"
                      : "text-slate-400"
                }`}
              >
                {Number(dateKey.slice(8))}
              </p>
              <ul className="space-y-1">
                {dayLessons.map((lesson) => (
                  <li
                    key={lesson.id}
                    className="rounded bg-slate-100 px-1.5 py-1 text-[11px] leading-tight text-slate-700"
                    title={`${LESSON_STATUS_LABEL[lesson.status]} · ${lesson.subjectLabel}${
                      lesson.topic ? ` · ${lesson.topic}` : ""
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <span
                        aria-hidden
                        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                          STATUS_DOT[lesson.status] ?? "bg-slate-400"
                        }`}
                      />
                      <span className="font-medium">
                        {formatTime(new Date(lesson.scheduledAt))}
                      </span>
                    </span>
                    <span className="block truncate">{lesson.studentName}</span>
                    {showTeacher ? (
                      <span className="block truncate text-slate-500">
                        {lesson.teacherName}
                      </span>
                    ) : null}
                    {payments?.get(lesson.id)?.state === "OVERDUE" ? (
                      <span className="block text-[10px] font-medium text-[var(--color-status-critical)]">
                        zaległość
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {Object.entries(STATUS_DOT).map(([status, dot]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
            {LESSON_STATUS_LABEL[status as keyof typeof LESSON_STATUS_LABEL]}
          </span>
        ))}
      </div>
    </div>
  );
}
