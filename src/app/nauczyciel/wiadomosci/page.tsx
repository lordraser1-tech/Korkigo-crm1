import { requirePage } from "@/lib/auth";
import { listMyMessages } from "@/lib/services/messages";
import {
  markAllMessagesReadAction,
  markMessageReadAction,
} from "@/app/actions/messages";
import { SubmitButton } from "@/components/forms";
import { formatDateTime } from "@/lib/datetime";
import { EmptyState, PageHeader } from "@/components/ui";

export default async function TeacherMessagesPage() {
  const actor = await requirePage("TEACHER");
  const messages = await listMyMessages(actor);
  const unread = messages.filter((message) => message.readAt === null);

  return (
    <>
      <PageHeader
        title="Wiadomości"
        description="Komunikaty od administratora."
        actions={
          unread.length > 0 ? (
            <form action={markAllMessagesReadAction}>
              <SubmitButton variant="secondary">
                Oznacz wszystkie jako przeczytane ({unread.length})
              </SubmitButton>
            </form>
          ) : undefined
        }
      />

      {messages.length === 0 ? (
        <EmptyState>Nie masz jeszcze żadnych wiadomości.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {messages.map((message) => {
            const isUnread = message.readAt === null;
            return (
              <li
                key={message.id}
                className={`card p-5 ${
                  isUnread ? "border-l-4 border-l-red-600 bg-red-50/30" : ""
                }`}
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                      {isUnread ? (
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-600"
                          aria-label="Nieprzeczytana"
                        />
                      ) : null}
                      {message.subject}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDateTime(new Date(message.createdAt))} ·{" "}
                      {message.senderEmail}
                      {message.broadcast ? " · do wszystkich nauczycieli" : ""}
                    </p>
                  </div>
                  {isUnread ? (
                    <form action={markMessageReadAction}>
                      <input type="hidden" name="id" value={message.id} />
                      <SubmitButton variant="secondary" small>
                        Oznacz jako przeczytaną
                      </SubmitButton>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-400">
                      przeczytana {formatDateTime(new Date(message.readAt!))}
                    </span>
                  )}
                </div>
                <p className="whitespace-pre-line text-sm text-slate-700">
                  {message.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
