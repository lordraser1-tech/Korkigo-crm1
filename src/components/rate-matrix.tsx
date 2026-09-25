import type { RateCell, SubjectLevelDto } from "@/lib/services/subjects";
import { RateCellForm } from "@/components/rate-cell-form";
import { EmptyState } from "@/components/ui";

type MatrixRow = {
  teacherId?: string;
  studentId?: string;
  teacherName?: string;
  studentName?: string;
  rates: RateCell[];
};

/** Macierz osoba × przedmiot/poziom; każda komórka zapisuje się osobno. */
export function RateMatrix({
  kind,
  levels,
  rows,
}: {
  kind: "teacher" | "student";
  levels: SubjectLevelDto[];
  rows: MatrixRow[];
}) {
  if (levels.length === 0) {
    return <EmptyState>Dodaj najpierw przedmiot i poziom.</EmptyState>;
  }
  if (rows.length === 0) {
    return (
      <EmptyState>
        {kind === "teacher" ? "Brak aktywnych nauczycieli." : "Brak uczniów."}
      </EmptyState>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="table-head">
          <tr>
            <th className="px-4 py-2.5">
              {kind === "teacher" ? "Nauczyciel" : "Uczeń"}
            </th>
            {levels.map((level) => (
              <th key={level.id} className="px-3 py-2.5 whitespace-nowrap">
                {level.subjectName}
                <span className="block font-normal normal-case text-slate-400">
                  {level.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const ownerId = (row.teacherId ?? row.studentId)!;
            return (
              <tr
                key={ownerId}
                className="hover:bg-slate-50"
                data-search={row.teacherName ?? row.studentName}
              >
                <td className="px-4 py-2 font-medium text-slate-800">
                  {row.teacherName ?? row.studentName}
                </td>
                {row.rates.map((cell) => (
                  <td key={cell.subjectLevelId} className="px-3 py-2">
                    <RateCellForm kind={kind} ownerId={ownerId} cell={cell} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
