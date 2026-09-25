import {
  clearAvailabilityDayAction,
  copyAvailabilityMonthAction,
  copyAvailabilityWeekAction,
  createAvailabilityAction,
  deleteAvailabilityAction,
} from "@/app/actions/teachers";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { shiftWeek } from "@/lib/datetime";

export type DayWindows = {
  dateKey: string;
  label: string;
  weekday: string;
  windows: Array<{ id: string; startTime: string; endTime: string }>;
};

/**
 * Dyspozycyjność ustawiana na KONKRETNE dni. Żeby nie klikać dzień po dniu,
 * obok stoją skróty: powtórzenie układu z zeszłego tygodnia i skopiowanie
 * tygodnia na cały miesiąc.
 */
export function AvailabilityDayEditor({
  days,
  weekKey,
  monthKey,
  teacherId,
}: {
  days: DayWindows[];
  weekKey: string;
  monthKey: string;
  /** Admin ustawia okna wskazanemu nauczycielowi. */
  teacherId?: string;
}) {
  return (
    <div className="card p-5">
      <h2 className="mb-1 text-base font-semibold text-slate-900">
        Dyspozycyjność w tym tygodniu
      </h2>
      <p className="mb-4 text-xs text-slate-500">
        Okna dotyczą konkretnych dni — nie powtarzają się same z siebie.
        Skorzystaj ze skrótów poniżej, żeby nie wpisywać ich dzień po dniu.
      </p>

      <ul className="mb-4 space-y-2">
        {days.map((day) => (
          <li key={day.dateKey} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-800">
                {day.weekday}
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {day.label}
                </span>
              </span>
              {day.windows.length > 0 ? (
                <form action={clearAvailabilityDayAction}>
                  <input type="hidden" name="date" value={day.dateKey} />
                  {teacherId ? (
                    <input type="hidden" name="teacherId" value={teacherId} />
                  ) : null}
                  <ConfirmButton message={`Usunąć całą dyspozycyjność: ${day.label}?`}>
                    Wyczyść dzień
                  </ConfirmButton>
                </form>
              ) : null}
            </div>

            {day.windows.length > 0 ? (
              <ul className="mb-2 flex flex-wrap gap-1.5">
                {day.windows.map((window) => (
                  <li
                    key={window.id}
                    className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-900"
                  >
                    {window.startTime}–{window.endTime}
                    <form action={deleteAvailabilityAction}>
                      <input type="hidden" name="id" value={window.id} />
                      <ConfirmButton message="Usunąć to okno?">×</ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-2 text-xs text-slate-400">brak okien</p>
            )}

            <form action={createAvailabilityAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="date" value={day.dateKey} />
              {teacherId ? (
                <input type="hidden" name="teacherId" value={teacherId} />
              ) : null}
              <label className="text-xs text-slate-500">
                od
                <input
                  name="startTime"
                  type="time"
                  defaultValue="16:00"
                  required
                  className="input mt-0.5 w-28 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-500">
                do
                <input
                  name="endTime"
                  type="time"
                  defaultValue="20:00"
                  required
                  className="input mt-0.5 w-28 px-2 py-1 text-sm"
                />
              </label>
              <SubmitButton variant="secondary" small>
                Dodaj okno
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <ActionForm
          action={copyAvailabilityWeekAction}
          submitLabel="Powtórz z zeszłego tygodnia"
          className="space-y-2"
        >
          {teacherId ? (
            <input type="hidden" name="teacherId" value={teacherId} />
          ) : null}
          <input type="hidden" name="sourceWeek" value={shiftWeek(weekKey, -1)} />
          <input type="hidden" name="targetWeek" value={weekKey} />
          <p className="text-xs text-slate-500">
            Kopiuje układ okien z poprzedniego tygodnia na ten. Istniejące okna
            zostają nietknięte.
          </p>
        </ActionForm>

        <ActionForm
          action={copyAvailabilityMonthAction}
          submitLabel="Skopiuj ten tydzień na cały miesiąc"
          className="space-y-2"
        >
          {teacherId ? (
            <input type="hidden" name="teacherId" value={teacherId} />
          ) : null}
          <input type="hidden" name="sourceWeek" value={weekKey} />
          <input type="hidden" name="month" value={monthKey} />
          <p className="text-xs text-slate-500">
            Powiela układ z tego tygodnia na wszystkie dni miesiąca{" "}
            {monthKey}.
          </p>
        </ActionForm>
      </div>
    </div>
  );
}
