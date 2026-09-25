import type { SpeakingClubDto } from "@/lib/services/speaking-club";
import { LESSONS_PER_SPEAKING_CLUB } from "@/lib/services/speaking-club";
import {
  undoSpeakingClubAction,
  redeemSpeakingClubAction,
} from "@/app/actions/speaking-club";
import { ActionForm, ConfirmButton, Field } from "@/components/forms";
import { formatDate } from "@/lib/datetime";
import { Badge } from "@/components/ui";

/**
 * Speaking Club: jeden darmowy udział za każde 10 lekcji zrealizowanych.
 * Widok bez kwot, więc działa tak samo w panelu admina i nauczyciela.
 */
export function SpeakingClubCard({
  studentId,
  club,
  canUndo = false,
}: {
  studentId: string;
  club: SpeakingClubDto;
  /** Cofnięcie pomyłkowego odznaczenia — w panelu admina. */
  canUndo?: boolean;
}) {
  const progress =
    ((LESSONS_PER_SPEAKING_CLUB - club.lessonsToNext) /
      LESSONS_PER_SPEAKING_CLUB) *
    100;

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Speaking Club</h2>
          <p className="text-xs text-slate-500">
            1 darmowy udział za każde {LESSONS_PER_SPEAKING_CLUB} lekcji
            zrealizowanych (niezależnie od przedmiotu).
          </p>
        </div>
        {club.available > 0 ? (
          <Badge tone="green">Dostępne: {club.available}</Badge>
        ) : (
          <Badge tone="slate">Brak dostępnych</Badge>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Lekcje zrealizowane
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {club.completedLessons}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Wypracowane
          </p>
          <p className="text-lg font-semibold text-slate-900">{club.earned}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Wykorzystane
          </p>
          <p className="text-lg font-semibold text-slate-900">{club.used}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Do kolejnego
          </p>
          <p className="text-lg font-semibold text-slate-900">
            {club.lessonsToNext} lekcji
          </p>
        </div>
      </div>

      <div
        className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`Do kolejnego Speaking Clubu brakuje ${club.lessonsToNext} lekcji`}
      >
        <div
          className="h-full rounded-full bg-brand-600"
          style={{ width: `${progress}%` }}
        />
      </div>

      {club.available > 0 ? (
        <ActionForm
          action={redeemSpeakingClubAction}
          submitLabel="Uczestniczył"
          className="space-y-3"
        >
          <input type="hidden" name="studentId" value={studentId} />
          <Field label="Notatka (opcjonalnie)" name="note" />
        </ActionForm>
      ) : (
        <p className="text-sm text-slate-500">
          Kolejny darmowy udział po {club.lessonsToNext} lekcjach.
        </p>
      )}

      {club.history.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            Historia ({club.history.length})
          </h3>
          <ul className="space-y-1.5 text-sm">
            {club.history.slice(0, 8).map((use) => (
              <li
                key={use.id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-slate-600">
                  {formatDate(new Date(use.usedAt))} · {use.markedByEmail}
                  {use.note ? ` · ${use.note}` : ""}
                </span>
                {canUndo ? (
                  <form action={undoSpeakingClubAction}>
                    <input type="hidden" name="id" value={use.id} />
                    <ConfirmButton message="Cofnąć to odznaczenie?">
                      Cofnij
                    </ConfirmButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
