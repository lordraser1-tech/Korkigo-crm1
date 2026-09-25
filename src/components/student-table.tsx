import Link from "next/link";
import type { StudentDto } from "@/lib/services/students";
import { PaymentFlagBadge } from "@/components/billing";
import { EmptyState, StudentStatusBadge } from "@/components/ui";

export function StudentTable({
  students,
  hrefBase,
  showRate = false,
  showTeacher = false,
}: {
  students: StudentDto[];
  hrefBase: string;
  /** Kolumna ze stawką ucznia istnieje wyłącznie w panelu admina. */
  showRate?: boolean;
  showTeacher?: boolean;
}) {
  if (students.length === 0) {
    return <EmptyState>Brak uczniów do wyświetlenia.</EmptyState>;
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-4 py-2.5">Uczeń</th>
            <th className="px-4 py-2.5">Poziom</th>
            <th className="px-4 py-2.5">Kontakt</th>
            {showTeacher ? <th className="px-4 py-2.5">Nauczyciel</th> : null}
            {showRate ? <th className="px-4 py-2.5">Ceny</th> : null}
            <th className="px-4 py-2.5">Rozliczenia</th>
            <th className="px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {students.map((student) => (
            <tr key={student.id} className="hover:bg-slate-50">
              <td className="px-4 py-2.5">
                <Link
                  href={`${hrefBase}/${student.id}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {student.fullName}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-slate-600">
                {student.languageLevel ?? "—"}
              </td>
              <td className="px-4 py-2.5 text-slate-600">
                {student.contactPhone ?? student.contactEmail ?? "—"}
              </td>
              {showTeacher ? (
                <td className="px-4 py-2.5 text-slate-600">
                  {student.teacherName ?? "— brak —"}
                </td>
              ) : null}
              {showRate ? (
                <td className="px-4 py-2.5">
                  {(student.rateCount ?? 0) === 0 ? (
                    <span className="font-medium text-amber-700">do ustalenia</span>
                  ) : (
                    <span className="text-slate-600">
                      {student.rateCount} ustalonych
                    </span>
                  )}
                </td>
              ) : null}
              <td className="px-4 py-2.5">
                {student.paymentFlag ? (
                  <PaymentFlagBadge flag={student.paymentFlag} />
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <StudentStatusBadge status={student.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
