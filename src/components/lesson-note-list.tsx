import Link from "next/link";
import type {
  LessonAwaitingNoteDto,
  LessonNoteDto,
} from "@/lib/services/lesson-notes";
import { LessonNoteForm } from "@/components/lesson-note-form";
import { formatDate, formatTime, formatWeekday } from "@/lib/datetime";
import { EmptyState, LessonStatusBadge } from "@/components/ui";
import type { LessonStatus } from "@prisma/client";

/** Nagłówek wspólny dla notatki i dla lekcji czekającej na notatkę. */
function LessonHeading({
  lessonAt,
  studentId,
  studentName,
  teacherName,
  subjectLabel,
  lessonStatus,
  topic,
  studentHref,
}: {
  lessonAt: string;
  studentId: string;
  studentName: string;
  teacherName: string;
  subjectLabel: string;
  lessonStatus: string;
  topic: string | null;
  /** Prefiks ścieżki do karty ucznia — inny w każdym panelu. */
  studentHref: string;
}) {
  const date = new Date(lessonAt);
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-slate-900">
          <Link
            href={`${studentHref}/${studentId}`}
            className="hover:text-brand-700 hover:underline"
          >
            {studentName}
          </Link>
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {formatWeekday(date)}, {formatDate(date)}, {formatTime(date)} ·{" "}
          {subjectLabel} · {teacherName}
          {topic ? ` · ${topic}` : ""}
        </p>
      </div>
      <LessonStatusBadge status={lessonStatus as LessonStatus} />
    </div>
  );
}

export function LessonNoteList({
  notes,
  studentHref,
  emptyText,
}: {
  notes: LessonNoteDto[];
  studentHref: string;
  emptyText: string;
}) {
  if (notes.length === 0) return <EmptyState>{emptyText}</EmptyState>;

  return (
    <ul className="space-y-3">
      {notes.map((note) => (
        <li key={note.id} className="card p-5">
          <LessonHeading
            lessonAt={note.lessonAt}
            studentId={note.studentId}
            studentName={note.studentName}
            teacherName={note.teacherName}
            subjectLabel={note.subjectLabel}
            lessonStatus={note.lessonStatus}
            topic={note.topic}
            studentHref={studentHref}
          />
          <LessonNoteForm lessonId={note.lessonId} note={note} />
        </li>
      ))}
    </ul>
  );
}

export function LessonsAwaitingNoteList({
  lessons,
  studentHref,
}: {
  lessons: LessonAwaitingNoteDto[];
  studentHref: string;
}) {
  if (lessons.length === 0) {
    return <EmptyState>Wszystkie odbyte lekcje mają notatkę.</EmptyState>;
  }

  return (
    <ul className="space-y-3">
      {lessons.map((lesson) => (
        <li key={lesson.lessonId} className="card border-dashed p-5">
          <LessonHeading
            lessonAt={lesson.lessonAt}
            studentId={lesson.studentId}
            studentName={lesson.studentName}
            teacherName={lesson.teacherName}
            subjectLabel={lesson.subjectLabel}
            lessonStatus={lesson.lessonStatus}
            topic={lesson.topic}
            studentHref={studentHref}
          />
          <LessonNoteForm lessonId={lesson.lessonId} note={null} />
        </li>
      ))}
    </ul>
  );
}
