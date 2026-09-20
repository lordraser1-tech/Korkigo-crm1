import type { ReactNode } from "react";
import type { LessonStatus, StudentStatus } from "@prisma/client";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "blue";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    blue: "bg-brand-100 text-brand-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export const LESSON_STATUS_LABEL: Record<LessonStatus, string> = {
  SCHEDULED: "Zaplanowana",
  COMPLETED: "Zrealizowana",
  CANCELLED: "Odwołana",
  NO_SHOW: "Nieobecność",
};

export function LessonStatusBadge({ status }: { status: LessonStatus }) {
  const tone = {
    SCHEDULED: "blue",
    COMPLETED: "green",
    CANCELLED: "slate",
    NO_SHOW: "red",
  }[status] as "blue" | "green" | "slate" | "red";
  return <Badge tone={tone}>{LESSON_STATUS_LABEL[status]}</Badge>;
}

export const STUDENT_STATUS_LABEL: Record<StudentStatus, string> = {
  ACTIVE: "Aktywny",
  PAUSED: "Wstrzymany",
  ENDED: "Zakończony",
};

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  const tone = {
    ACTIVE: "green",
    PAUSED: "amber",
    ENDED: "slate",
  }[status] as "green" | "amber" | "slate";
  return <Badge tone={tone}>{STUDENT_STATUS_LABEL[status]}</Badge>;
}

export const WEEKDAY_LABEL = [
  "Niedziela",
  "Poniedziałek",
  "Wtorek",
  "Środa",
  "Czwartek",
  "Piątek",
  "Sobota",
];
