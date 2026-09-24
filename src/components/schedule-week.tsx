import Link from "next/link";
import type { ScheduleView } from "@/lib/services/schedule";
import { deleteAvailabilityAction } from "@/app/actions/teachers";
import { ConfirmButton } from "@/components/forms";
import { LessonPaymentBadge } from "@/components/billing";
import { formatTime } from "@/lib/datetime";
import { LessonStatusBadge, WEEKDAY_LABEL } from "@/components/ui";

/**
 * Tydzień grafiku: w każdej kolumnie okna dyspozycyjności i zapisane lekcje.
 * `showTeacher` włączamy w widoku admina bez filtra — wtedy przy każdym wpisie
 * widać, czyj jest.
 */
export function ScheduleWeek({
  schedule,
  showTeacher = false,
  canManageWindows = false,
  studentHrefBase,
}: {
  schedule: ScheduleView;
  showTeacher?: boolean;
  canManageWindows?: boolean;
  studentHrefBase?: string;
}) {
  return (
    <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
      {schedule.days.map((day) => (
        <section
          key={day.dateKey}
          className={`card flex flex-col p-3 ${
            day.isToday ? "ring-2 ring-brand-300" : ""
          }`}
        >
          <header className="mb-2 border-b border-slate-100 pb-2">
            <p className="text-sm font-semibold text-slate-900">
              {WEEKDAY_LABEL[day.dayOfWeek]}
            </p>
            <p className="text-xs text-slate-500">{day.label}</p>
          </header>

          <div className="mb-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Dyspozycyjność
            </p>
            {day.windows.length === 0 ? (
              <p className="text-xs text-slate-400">brak okien</p>
            ) : (
              <ul className="space-y-1">
                {day.windows.map((window) => (
                  <li
                    key={window.id}
                    className="flex items-center justify-between gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-900"
                  >
                    <span>
                      {window.startTime}–{window.endTime}
                      {showTeacher ? (
                        <span className="block text-[11px] text-emerald-700">
                          {window.teacherName}
                        </span>
                      ) : null}
                    </span>
                    {canManageWindows ? (
                      <form action={deleteAvailabilityAction}>
                        <input type="hidden" name="id" value={window.id} />
                        <ConfirmButton message="Usunąć to okno dyspozycyjności?">
                          ×
                        </ConfirmButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex-1">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Lekcje ({day.lessons.length})
            </p>
            {day.lessons.length === 0 ? (
              <p className="text-xs text-slate-400">brak zapisów</p>
            ) : (
              <ul className="space-y-2">
                {day.lessons.map((lesson) => (
                  <li
                    key={lesson.id}
                    className="rounded-lg border border-slate-200 p-2 text-xs"
                  >
                    <p className="font-semibold text-slate-900">
                      {formatTime(new Date(lesson.scheduledAt))}
                      <span className="ml-1 font-normal text-slate-500">
                        {lesson.durationMinutes} min
                      </span>
                    </p>
                    <p className="mt-0.5 text-slate-700">
                      {studentHrefBase ? (
                        <Link
                          href={`${studentHrefBase}/${lesson.studentId}`}
                          className="text-brand-700 hover:underline"
                        >
                          {lesson.studentName}
                        </Link>
                      ) : (
                        lesson.studentName
                      )}
                    </p>
                    {showTeacher ? (
                      <p className="text-[11px] text-slate-500">{lesson.teacherName}</p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <LessonStatusBadge status={lesson.status} />
                      <LessonPaymentBadge payment={lesson.payment} />
                    </div>
                    {lesson.payment.invoiceId ? (
                      <Link
                        href={`/admin/rachunki/${lesson.payment.invoiceId}`}
                        className="mt-1 block text-[11px] text-brand-700 hover:underline"
                      >
                        rachunek {lesson.payment.invoiceNumber}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {day.freeSlots.length > 0 ? (
            <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
              Wolne godziny: {day.freeSlots.length}
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
