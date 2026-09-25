import Link from "next/link";
import type { LessonDto } from "@/lib/services/lessons";
import type { LessonPaymentInfo } from "@/lib/services/billing";
import { LessonList } from "@/components/lesson-list";

export type HistoryFilter = "ALL" | "PLANNED" | "UNPAID" | "PAID";

const FILTERS: Array<{ key: HistoryFilter; label: string }> = [
  { key: "ALL", label: "Wszystkie" },
  { key: "PLANNED", label: "Zaplanowane" },
  { key: "UNPAID", label: "Zrealizowane — nieopłacone" },
  { key: "PAID", label: "Zrealizowane — opłacone" },
];

export function parseHistoryFilter(value?: string): HistoryFilter {
  return value === "PLANNED" || value === "UNPAID" || value === "PAID"
    ? value
    : "ALL";
}

/** Historia lekcji ucznia z filtrami opartymi o status płatności. */
export function LessonHistory({
  lessons,
  payments,
  filter,
  hrefFor,
  showTeacher = false,
  canEditTopic = true,
  isAdmin = false,
}: {
  lessons: LessonDto[];
  payments: Map<string, LessonPaymentInfo>;
  filter: HistoryFilter;
  hrefFor: (filter: HistoryFilter) => string;
  showTeacher?: boolean;
  canEditTopic?: boolean;
  isAdmin?: boolean;
}) {
  const visible = lessons.filter((lesson) => {
    const state = payments.get(lesson.id)?.state;
    switch (filter) {
      case "PLANNED":
        return lesson.status === "SCHEDULED";
      case "UNPAID":
        return lesson.status !== "SCHEDULED" && state !== "PAID" && state !== "NOT_CHARGED";
      case "PAID":
        return lesson.status !== "SCHEDULED" && state === "PAID";
      default:
        return true;
    }
  });

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {FILTERS.map((option) => (
          <Link
            key={option.key}
            href={hrefFor(option.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              option.key === filter
                ? "bg-brand-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <LessonList
        lessons={visible}
        payments={payments}
        showTeacher={showTeacher}
        canEditTopic={canEditTopic}
        isAdmin={isAdmin}
        emptyText="Brak lekcji w tym filtrze."
      />
    </>
  );
}
