/**
 * Grafik: dyspozycyjność nauczycieli + zapisane lekcje w układzie tygodnia,
 * razem ze statusem płatności każdej lekcji.
 *
 * Zakres widoczności jest ten sam co wszędzie: admin widzi wszystkich i może
 * filtrować po nauczycielu, nauczyciel wyłącznie siebie — również wtedy, gdy
 * poda w parametrze cudze `teacherId`.
 */
import { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/lib/errors";
import {
  formatDate,
  formatWeekLabel,
  minutesToTime,
  timeToMinutes,
  toWallClockInput,
  wallClockToUtc,
  weekDays,
  weekRange,
  weekStartKey,
} from "@/lib/datetime";
import {
  getLessonPaymentStates,
  type LessonPaymentInfo,
} from "@/lib/services/billing";
import { listLessons, type LessonDto } from "@/lib/services/lessons";

export type ScheduleWindow = {
  id: string;
  teacherId: string;
  teacherName: string;
  startTime: string;
  endTime: string;
};

export type ScheduleLesson = LessonDto & { payment: LessonPaymentInfo };

export type ScheduleSlot = {
  /** Wartość gotowa do pola `datetime-local`: "2026-09-22T16:00". */
  wallClock: string;
  label: string;
  teacherId: string;
};

export type ScheduleDay = {
  dateKey: string;
  dayOfWeek: number;
  label: string;
  isToday: boolean;
  windows: ScheduleWindow[];
  lessons: ScheduleLesson[];
  freeSlots: ScheduleSlot[];
};

export type ScheduleView = {
  weekKey: string;
  weekLabel: string;
  teacherId: string | null;
  days: ScheduleDay[];
  totals: {
    lessons: number;
    unpaidLessons: number;
    availabilityHours: number;
  };
};

const SLOT_MINUTES = 60;

/** Nauczyciel zawsze ogląda własny grafik, niezależnie od parametrów. */
function resolveScope(
  actor: Actor,
  requestedTeacherId?: string | null
): string | null {
  if (actor.role === "TEACHER") return actor.teacherProfileId;
  return requestedTeacherId || null;
}

function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && startB < endA;
}

export async function getSchedule(
  actor: Actor,
  options: { weekKey?: string | null; teacherId?: string | null } = {},
  now = new Date()
): Promise<ScheduleView> {
  const weekKey = weekStartKey(
    options.weekKey && /^\d{4}-\d{2}-\d{2}$/.test(options.weekKey)
      ? options.weekKey
      : toWallClockInput(now).slice(0, 10)
  );
  const teacherId = resolveScope(actor, options.teacherId);
  const { from, to } = weekRange(weekKey);

  const availabilityWhere: Prisma.AvailabilityWhereInput = teacherId
    ? { teacherId }
    : {};
  const [windows, lessons] = await Promise.all([
    prisma.availability.findMany({
      where: availabilityWhere,
      select: {
        id: true,
        teacherId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        teacher: { select: { firstName: true, lastName: true, active: true } },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    listLessons(actor, { from, to, teacherId }),
  ]);

  const payments = await getLessonPaymentStates(
    actor,
    lessons.map((lesson) => lesson.id),
    now
  );
  const withPayments: ScheduleLesson[] = lessons.map((lesson) => ({
    ...lesson,
    payment: payments.get(lesson.id) ?? {
      state: "NOT_INVOICED",
      fromPackage: false,
      invoiceNumber: null,
      invoiceId: null,
    },
  }));

  const todayKey = toWallClockInput(now).slice(0, 10);

  const days: ScheduleDay[] = weekDays(weekKey).map(({ dateKey, dayOfWeek }) => {
    const dayWindows: ScheduleWindow[] = windows
      .filter((window) => window.dayOfWeek === dayOfWeek && window.teacher.active)
      .map((window) => ({
        id: window.id,
        teacherId: window.teacherId,
        teacherName: `${window.teacher.firstName} ${window.teacher.lastName}`,
        startTime: window.startTime,
        endTime: window.endTime,
      }));

    const dayLessons = withPayments
      .filter(
        (lesson) => toWallClockInput(new Date(lesson.scheduledAt)).slice(0, 10) === dateKey
      )
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

    // Wolne terminy proponujemy tylko dla jednego nauczyciela — inaczej
    // zestawienie robi się nieczytelne.
    const freeSlots: ScheduleSlot[] = [];
    if (teacherId) {
      const busy = dayLessons
        .filter((lesson) => lesson.status !== "CANCELLED")
        .map((lesson) => {
          const start = timeToMinutes(
            toWallClockInput(new Date(lesson.scheduledAt)).slice(11)
          );
          return { start, end: start + lesson.durationMinutes };
        });

      for (const window of dayWindows) {
        const windowStart = timeToMinutes(window.startTime);
        const windowEnd = timeToMinutes(window.endTime);
        for (
          let start = windowStart;
          start + SLOT_MINUTES <= windowEnd;
          start += SLOT_MINUTES
        ) {
          const end = start + SLOT_MINUTES;
          const taken = busy.some((slot) =>
            overlaps(start, end, slot.start, slot.end)
          );
          if (taken) continue;
          freeSlots.push({
            wallClock: `${dateKey}T${minutesToTime(start)}`,
            label: `${formatDate(wallClockToUtc(`${dateKey}T12:00`))}, ${minutesToTime(
              start
            )}–${minutesToTime(end)}`,
            teacherId: window.teacherId,
          });
        }
      }
    }

    return {
      dateKey,
      dayOfWeek,
      label: formatDate(wallClockToUtc(`${dateKey}T12:00`)),
      isToday: dateKey === todayKey,
      windows: dayWindows,
      lessons: dayLessons,
      freeSlots,
    };
  });

  const availabilityMinutes = days.reduce(
    (sum, day) =>
      sum +
      day.windows.reduce(
        (daySum, window) =>
          daySum + (timeToMinutes(window.endTime) - timeToMinutes(window.startTime)),
        0
      ),
    0
  );

  return {
    weekKey,
    weekLabel: formatWeekLabel(weekKey),
    teacherId,
    days,
    totals: {
      lessons: withPayments.filter((lesson) => lesson.status !== "CANCELLED").length,
      unpaidLessons: withPayments.filter(
        (lesson) =>
          lesson.status !== "CANCELLED" && lesson.payment.state !== "PAID"
      ).length,
      availabilityHours: Math.round((availabilityMinutes / 60) * 10) / 10,
    },
  };
}

/** Pełny przegląd dyspozycyjności wszystkich nauczycieli — tylko admin. */
export async function listAllAvailability(actor: Actor): Promise<ScheduleWindow[]> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Dyspozycyjność wszystkich widzi tylko administrator.");
  }
  const rows = await prisma.availability.findMany({
    select: {
      id: true,
      teacherId: true,
      startTime: true,
      endTime: true,
      dayOfWeek: true,
      teacher: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    teacherId: row.teacherId,
    teacherName: `${row.teacher.firstName} ${row.teacher.lastName}`,
    startTime: row.startTime,
    endTime: row.endTime,
  }));
}
