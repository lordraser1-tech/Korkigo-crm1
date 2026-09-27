import type { CalendarLinkDto } from "@/lib/services/calendar-sync";
import {
  disconnectCalendarAction,
  toggleCalendarAction,
} from "@/app/actions/calendar";
import { CalendarSyncButton } from "@/components/calendar-sync-button";
import { ConfirmButton, SubmitButton } from "@/components/forms";
import { formatDateTime } from "@/lib/datetime";
import { Badge } from "@/components/ui";

/**
 * Stan synchronizacji z Google Calendar. Jednokierunkowa: CRM wypycha lekcje,
 * zmiany zrobione w Google nie wracają — i UI musi to mówić wprost, żeby nikt
 * nie przesuwał zajęć w telefonie, licząc że CRM to zobaczy.
 */
export function GoogleCalendarCard({
  link,
  configured,
  teacherId,
  canConnect,
}: {
  link: CalendarLinkDto | null;
  /** Czy w środowisku są klucze Google. */
  configured: boolean;
  /** Potrzebny adminowi, który działa na cudzym połączeniu. */
  teacherId?: string;
  /** Podłączyć konto może tylko jego właściciel — admin nie zaloguje się za kogoś. */
  canConnect: boolean;
}) {
  const connectHref = teacherId
    ? `/api/google/connect?teacherId=${teacherId}`
    : "/api/google/connect";

  return (
    <div className="card p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Kalendarz Google</h2>
        {link ? (
          link.enabled ? (
            <Badge tone="green">połączony</Badge>
          ) : (
            <Badge tone="slate">wstrzymany</Badge>
          )
        ) : (
          <Badge tone="slate">niepołączony</Badge>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Lekcje trafiają do kalendarza jednokierunkowo — CRM wypycha grafik.
        Zmiany zrobione w Google <strong>nie wracają</strong> do systemu, więc
        terminy przestawiaj tutaj. Kalendarz nie zawiera żadnych kwot.
      </p>

      {/*
        Ostrzeżenie o brakującej konfiguracji NIE zasłania stanu połączenia:
        gdyby klucze zniknęły (rotacja, zła zmienna), nauczyciel straciłby
        dostęp do „Rozłącz" i zostałby z kalendarzem, którego nie da się odpiąć.
      */}
      {!configured ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Brakuje kluczy Google w zmiennych środowiskowych (patrz{" "}
          <code>.env.example</code>) — nowego konta nie podłączysz, a wysyłka
          może się nie odświeżyć.
        </p>
      ) : null}

      {!link ? (
        !configured ? null : canConnect ? (
          <a href={connectHref} className="btn-primary inline-block">
            Połącz z Google
          </a>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Konto Google podłącza sam nauczyciel w swoich ustawieniach.
          </p>
        )
      ) : (
        <div className="space-y-3">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Konto</dt>
              <dd className="font-medium text-slate-900">{link.googleEmail}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Ostatnia wysyłka</dt>
              <dd className="text-slate-700">
                {link.lastSyncAt
                  ? formatDateTime(new Date(link.lastSyncAt))
                  : "jeszcze nie było"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Czeka na wysłanie</dt>
              <dd className="text-slate-700">{link.pending} lekcji</dd>
            </div>
          </dl>

          {link.lastSyncError ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              Ostatni błąd: {link.lastSyncError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <CalendarSyncButton teacherId={teacherId} />

            <form action={toggleCalendarAction}>
              {teacherId ? (
                <input type="hidden" name="teacherId" value={teacherId} />
              ) : null}
              <input
                type="hidden"
                name="enabled"
                value={link.enabled ? "false" : "true"}
              />
              <SubmitButton variant="secondary" small>
                {link.enabled ? "Wstrzymaj" : "Wznów"}
              </SubmitButton>
            </form>

            <form action={disconnectCalendarAction}>
              {teacherId ? (
                <input type="hidden" name="teacherId" value={teacherId} />
              ) : null}
              <ConfirmButton message="Rozłączyć kalendarz? Wysłane zdarzenia zostaną usunięte z Google.">
                Rozłącz
              </ConfirmButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
