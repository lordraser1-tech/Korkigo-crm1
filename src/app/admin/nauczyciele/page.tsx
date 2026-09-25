import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { listTeachers } from "@/lib/services/teachers";
import { createTeacherAction } from "@/app/actions/teachers";
import { ActionForm, Field } from "@/components/forms";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export default async function AdminTeachersPage() {
  const actor = await requirePage("ADMIN");
  const teachers = await listTeachers(actor, { includeInactive: true });

  return (
    <>
      <PageHeader
        title="Nauczyciele"
        description="Konta nauczycieli i ich stawki. Stawkę ustala wyłącznie administrator."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          {teachers.length === 0 ? (
            <EmptyState>
              Nie ma jeszcze żadnego nauczyciela. Utwórz pierwsze konto po prawej.
            </EmptyState>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-2.5">Nauczyciel</th>
                    <th className="px-4 py-2.5">E-mail</th>
                    <th className="px-4 py-2.5">Poziom</th>
                    <th className="px-4 py-2.5">Uczniowie</th>
                    <th className="px-4 py-2.5">Stawki</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teachers.map((teacher) => (
                    <tr key={teacher.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/admin/nauczyciele/${teacher.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {teacher.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{teacher.email}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {teacher.level ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {teacher.studentCount}
                      </td>
                      <td className="px-4 py-2.5">
                        {teacher.rateCount === 0 ? (
                          <Link
                            href="/admin/przedmioty"
                            className="font-medium text-amber-700 underline"
                          >
                            brak stawek
                          </Link>
                        ) : (
                          <span className="text-slate-600">
                            {teacher.rateCount}{" "}
                            {teacher.rateCount === 1 ? "stawka" : "ustalonych"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {teacher.active ? (
                          <Badge tone="green">Aktywny</Badge>
                        ) : (
                          <Badge tone="slate">Nieaktywny</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card h-fit p-5">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            Nowe konto nauczyciela
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Hasło przekaż nauczycielowi — będzie mógł je zmienić w swoich
            ustawieniach.
          </p>
          <ActionForm
            action={createTeacherAction}
            submitLabel="Utwórz konto"
            resetOnSuccess
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Imię" name="firstName" required />
              <Field label="Nazwisko" name="lastName" required />
            </div>
            <Field label="E-mail (login)" name="email" type="email" required />
            <Field
              label="Hasło startowe"
              name="password"
              type="password"
              required
              hint="Min. 8 znaków."
            />
            <Field label="Telefon" name="phone" />
            <Field label="Poziom / certyfikaty" name="level" placeholder="np. C1" />
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Stawki ustalisz po utworzeniu konta — w zakładce „Przedmioty”,
              osobno dla każdego przedmiotu i poziomu.
            </p>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
