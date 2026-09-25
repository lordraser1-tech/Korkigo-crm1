"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { IDLE, type ActionState } from "@/lib/action-result";
import { formatPLN } from "@/lib/money";

export type ComposerSubject = {
  id: string;
  name: string;
  levels: Array<{ id: string; name: string }>;
};

export type ComposerStudent = {
  id: string;
  fullName: string;
  teacherId: string | null;
};

export type ComposerTeacher = { id: string; fullName: string };

/** `{ [ownerId]: { [subjectLevelId]: kwota } }` */
export type RateMap = Record<string, Record<string, number>>;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Zapisywanie…" : label}
    </button>
  );
}

/**
 * Dodanie lekcji: uczeń → przedmiot → poziom → nauczyciel. Po skompletowaniu
 * wyboru pokazuje stawki obowiązujące dla tej kombinacji i mówi wprost, gdy
 * którejś brakuje — bo wtedy serwer i tak odmówi zapisu.
 *
 * Nauczycielowi przekazujemy wyłącznie jego własne stawki; mapa cen uczniów
 * trafia tu tylko w panelu admina.
 */
export function LessonComposer({
  action,
  subjects,
  students,
  teachers,
  teacherRates,
  studentRates,
  fixedTeacherId,
  slots = [],
  defaultWallClock,
  submitLabel = "Dodaj do kalendarza",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  subjects: ComposerSubject[];
  students: ComposerStudent[];
  teachers?: ComposerTeacher[];
  teacherRates: RateMap;
  studentRates?: RateMap;
  fixedTeacherId?: string;
  slots?: Array<{ wallClock: string; label: string }>;
  defaultWallClock: string;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, IDLE);
  const formRef = useRef<HTMLFormElement>(null);

  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [levelId, setLevelId] = useState(subjects[0]?.levels[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState(
    fixedTeacherId ?? students[0]?.teacherId ?? teachers?.[0]?.id ?? ""
  );
  const [wallClock, setWallClock] = useState(defaultWallClock);

  const levels = useMemo(
    () => subjects.find((subject) => subject.id === subjectId)?.levels ?? [],
    [subjects, subjectId]
  );

  useEffect(() => {
    if (levels.length > 0 && !levels.some((level) => level.id === levelId)) {
      setLevelId(levels[0].id);
    }
  }, [levels, levelId]);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  // Wybór ucznia podpowiada jego nauczyciela (admin może to zmienić).
  useEffect(() => {
    if (fixedTeacherId) return;
    const student = students.find((item) => item.id === studentId);
    if (student?.teacherId) setTeacherId(student.teacherId);
  }, [studentId, students, fixedTeacherId]);

  const teacherAmount =
    teacherId && levelId ? (teacherRates[teacherId]?.[levelId] ?? null) : null;
  const studentAmount =
    studentRates && studentId && levelId
      ? (studentRates[studentId]?.[levelId] ?? null)
      : null;

  const missing: string[] = [];
  if (teacherId && levelId && teacherAmount === null) {
    missing.push("stawki nauczyciela");
  }
  if (studentRates && studentId && levelId && studentAmount === null) {
    missing.push("ceny dla ucznia");
  }

  if (students.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Najpierw dodaj ucznia — wtedy zaplanujesz dla niego lekcje.
      </p>
    );
  }
  if (subjects.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nie ma jeszcze żadnego przedmiotu. Dodaj go w zakładce „Przedmioty”.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="studentId">
          Uczeń <span className="text-red-500">*</span>
        </label>
        <select
          id="studentId"
          name="studentId"
          required
          className="input"
          value={studentId}
          onChange={(event) => setStudentId(event.target.value)}
        >
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.fullName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="subjectId">
            Przedmiot <span className="text-red-500">*</span>
          </label>
          <select
            id="subjectId"
            className="input"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="subjectLevelId">
            Poziom <span className="text-red-500">*</span>
          </label>
          <select
            id="subjectLevelId"
            name="subjectLevelId"
            required
            className="input"
            value={levelId}
            onChange={(event) => setLevelId(event.target.value)}
          >
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {teachers ? (
        <div>
          <label className="label" htmlFor="teacherId">
            Nauczyciel <span className="text-red-500">*</span>
          </label>
          <select
            id="teacherId"
            name="teacherId"
            required
            className="input"
            value={teacherId}
            onChange={(event) => setTeacherId(event.target.value)}
          >
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.fullName}
              </option>
            ))}
          </select>
        </div>
      ) : fixedTeacherId ? (
        <input type="hidden" name="teacherId" value={fixedTeacherId} />
      ) : null}

      {/* Podpowiedź stawek dla wybranej kombinacji */}
      <div
        className={`rounded-lg px-3 py-2 text-xs ${
          missing.length > 0
            ? "bg-amber-50 text-amber-900"
            : "bg-slate-50 text-slate-600"
        }`}
      >
        {missing.length > 0 ? (
          <>
            Brak {missing.join(" i ")} dla tej kombinacji — ustal ją w zakładce
            „Przedmioty”, inaczej zapis zostanie odrzucony.
          </>
        ) : (
          <>
            {teacherAmount !== null ? (
              <span>
                Stawka nauczyciela: <strong>{formatPLN(teacherAmount)}</strong>
              </span>
            ) : null}
            {studentAmount !== null ? (
              <span className="ml-3">
                Cena dla ucznia: <strong>{formatPLN(studentAmount)}</strong>
              </span>
            ) : null}
          </>
        )}
      </div>

      {slots.length > 0 ? (
        <div>
          <label className="label" htmlFor="slot">
            Wolny termin w dyspozycyjności
          </label>
          <select
            id="slot"
            className="input"
            value={slots.some((slot) => slot.wallClock === wallClock) ? wallClock : ""}
            onChange={(event) => setWallClock(event.target.value)}
          >
            <option value="">— wybierz z listy —</option>
            {slots.map((slot) => (
              <option key={slot.wallClock} value={slot.wallClock}>
                {slot.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

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
          value={wallClock}
          onChange={(event) => setWallClock(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="durationMinutes">
            Czas trwania (min) <span className="text-red-500">*</span>
          </label>
          <input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={15}
            max={480}
            step={5}
            defaultValue={60}
            required
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="type">
            Typ
          </label>
          <select id="type" name="type" defaultValue="ONE_OFF" className="input">
            <option value="ONE_OFF">Jednorazowa</option>
            <option value="RECURRING">Cykliczna (co tydzień)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="repeatWeeks">
          Liczba tygodni (dla cyklicznej)
        </label>
        <input
          id="repeatWeeks"
          name="repeatWeeks"
          type="number"
          min={1}
          max={52}
          defaultValue={1}
          className="input"
        />
        <p className="mt-1 text-xs text-slate-500">
          Np. 12 zapisze ucznia na 12 kolejnych tygodni o tej samej porze.
        </p>
      </div>

      {state.message ? (
        <div
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${
            state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </div>
      ) : null}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
