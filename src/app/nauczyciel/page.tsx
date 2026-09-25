import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { countLessonsByStatus, upcomingLessons } from "@/lib/services/lessons";
import { listStudents } from "@/lib/services/students";
import { getTeacherEarnings } from "@/lib/services/finance";
import { currentMonthKey, formatMonthLabel, monthRange } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";
import { LessonList } from "@/components/lesson-list";
import { PageHeader, StatCard } from "@/components/ui";

export default async function TeacherDashboard() {
  const actor = await requirePage("TEACHER");
  const monthKey = currentMonthKey();
  const { from, to } = monthRange(monthKey);

  const [counts, upcoming, students, earnings] = await Promise.all([
    countLessonsByStatus(actor, { from, to }),
    upcomingLessons(actor, 6),
    listStudents(actor, { status: "ACTIVE" }),
    getTeacherEarnings(actor, actor.teacherProfileId, monthKey),
  ]);

  return (
    <>
      <PageHeader
        title="Pulpit"
        description={`Podsumowanie miesiąca: ${formatMonthLabel(monthKey)}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Aktywni uczniowie" value={String(students.length)} />
        <StatCard
          label="Lekcje zaplanowane"
          value={String(counts.SCHEDULED)}
          hint="w tym miesiącu"
        />
        <StatCard
          label="Lekcje zrealizowane"
          value={String(counts.COMPLETED)}
          hint={`odwołane: ${counts.CANCELLED} • nieobecności: ${counts.NO_SHOW}`}
        />
        <StatCard
          label="Zarobek (miesiąc)"
          value={formatPLN(earnings.total)}
          hint={`${earnings.completedLessons} lekcji zrealizowanych`}
        />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Najbliższe lekcje
          </h2>
          <Link
            href="/nauczyciel/kalendarz"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Cały kalendarz →
          </Link>
        </div>
        <LessonList
          lessons={upcoming}
          studentHrefBase="/nauczyciel/uczniowie"
          emptyText="Nie masz zaplanowanych lekcji. Dodaj je w kalendarzu."
        />
      </section>
    </>
  );
}
