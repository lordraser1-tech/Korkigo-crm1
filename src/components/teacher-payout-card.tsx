import type { PayoutDto, PayoutDueDto } from "@/lib/services/payouts";
import { deletePayoutAction, recordPayoutAction } from "@/app/actions/payouts";
import { ActionForm, ConfirmButton, Field } from "@/components/forms";
import { formatDate, toWallClockInput } from "@/lib/datetime";
import { formatPLN } from "@/lib/money";
import { Badge } from "@/components/ui";

/**
 * Rozliczenie z nauczycielem: ile się należy za lekcje jeszcze nieujęte
 * w żadnej wypłacie, przycisk oznaczenia wypłaty i historia.
 */
export function TeacherPayoutCard({
  teacherId,
  bankAccount,
  due,
  payouts,
}: {
  teacherId: string;
  bankAccount: string | null;
  due: PayoutDueDto;
  payouts: PayoutDto[];
}) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Wypłaty</h2>
        {due.lessons > 0 ? (
          <Badge tone="amber">{due.lessons} lekcji do rozliczenia</Badge>
        ) : (
          <Badge tone="green">wszystko rozliczone</Badge>
        )}
      </div>

      <div className="mb-4 rounded-lg bg-slate-50 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Do wypłaty
        </p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">
          {formatPLN(due.amount)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {due.oldestLessonAt
            ? `najstarsza nierozliczona lekcja: ${formatDate(new Date(due.oldestLessonAt))}`
            : "brak lekcji czekających na rozliczenie"}
        </p>
        {bankAccount ? (
          <p className="mt-2 text-xs text-slate-600">Konto: {bankAccount}</p>
        ) : (
          <p className="mt-2 text-xs text-amber-700">
            Nauczyciel nie podał numeru konta.
          </p>
        )}
      </div>

      {due.lessons > 0 ? (
        <ActionForm
          action={recordPayoutAction}
          submitLabel="Oznacz jako wypłacone"
          className="space-y-3"
        >
          <input type="hidden" name="teacherId" value={teacherId} />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Kwota"
              name="amount"
              inputMode="decimal"
              defaultValue={due.amount.toFixed(2)}
              required
              hint="Edytowalna — np. przy wypłacie częściowej."
            />
            <Field
              label="Data wypłaty"
              name="paidAt"
              type="date"
              defaultValue={toWallClockInput(new Date()).slice(0, 10)}
            />
          </div>
          <Field label="Notatka" name="note" />
        </ActionForm>
      ) : null}

      {payouts.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            Historia wypłat ({payouts.length})
          </h3>
          <ul className="space-y-1.5 text-sm">
            {payouts.map((payout) => (
              <li
                key={payout.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
              >
                <span className="text-slate-700">
                  {formatDate(new Date(payout.paidAt))} ·{" "}
                  <strong>{formatPLN(payout.amount)}</strong> ·{" "}
                  {payout.lessonCount} lekcji
                  {payout.paidByEmail ? (
                    <span className="block text-xs text-slate-500">
                      oznaczył: {payout.paidByEmail}
                      {payout.note ? ` · ${payout.note}` : ""}
                    </span>
                  ) : null}
                </span>
                <form action={deletePayoutAction}>
                  <input type="hidden" name="id" value={payout.id} />
                  <ConfirmButton message="Cofnąć tę wypłatę? Lekcje wrócą do nierozliczonych.">
                    Cofnij
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
