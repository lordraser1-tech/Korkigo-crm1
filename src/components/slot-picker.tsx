"use client";

import { useState } from "react";

/**
 * Wybór terminu lekcji: lista wolnych godzin z dyspozycyjności podstawia
 * wartość do jednego pola, więc można też wpisać termin spoza okien.
 */
export function SlotPicker({
  slots,
  defaultValue,
}: {
  slots: Array<{ wallClock: string; label: string }>;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="space-y-2">
      {slots.length > 0 ? (
        <div>
          <label className="label" htmlFor="slot">
            Wolny termin w dyspozycyjności
          </label>
          <select
            id="slot"
            className="input"
            value={slots.some((slot) => slot.wallClock === value) ? value : ""}
            onChange={(event) => setValue(event.target.value)}
          >
            <option value="">— wybierz z listy —</option>
            {slots.map((slot) => (
              <option key={slot.wallClock} value={slot.wallClock}>
                {slot.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          W tym tygodniu nie ma wolnych godzin w dyspozycyjności — podaj termin
          ręcznie.
        </p>
      )}

      <div>
        <label className="label" htmlFor="scheduledAt">
          Data i godzina <span className="text-red-500">*</span>
        </label>
        <input
          id="scheduledAt"
          name="scheduledAt"
          type="datetime-local"
          required
          className="input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
    </div>
  );
}
