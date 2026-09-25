import { requirePage } from "@/lib/auth";
import { listSentMessages } from "@/lib/services/messages";
import { listTeachers } from "@/lib/services/teachers";
import { deleteMessageAction, sendMessageAction } from "@/app/actions/messages";
import { ActionForm, ConfirmButton, Field, SelectField } from "@/components/forms";
import { formatDateTime } from "@/lib/datetime";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export default async function AdminMessagesPage() {
  const actor = await requirePage("ADMIN");
  const [messages, teachers] = await Promise.all([
    listSentMessages(actor),
    listTeachers(actor),
  ]);

  return (
    <>
      <PageHeader
        title="Wiadomości"
        description="Komunikaty do nauczycieli — pojedynczo albo do wszystkich naraz."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div>
          {messages.length === 0 ? (
            <EmptyState>Nie wysłałeś jeszcze żadnej wiadomości.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {messages.map((message) => {
                const read = message.recipients.filter(
                  (recipient) => recipient.readAt !== null
                ).length;
                return (
                  <li key={message.id} className="card p-5">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold text-slate-900">
                          {message.subject}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatDateTime(new Date(message.createdAt))}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {message.broadcast ? (
                          <Badge tone="blue">Do wszystkich</Badge>
                        ) : (
                          <Badge tone="slate">Pojedyncza</Badge>
                        )}
                        <Badge tone={read === message.recipients.length ? "green" : "amber"}>
                          Przeczytana {read}/{message.recipients.length}
                        </Badge>
                        <form action={deleteMessageAction}>
                          <input type="hidden" name="id" value={message.id} />
                          <ConfirmButton message="Usunąć tę wiadomość? Zniknie też ze skrzynek nauczycieli.">
                            Usuń
                          </ConfirmButton>
                        </form>
                      </div>
                    </div>

                    <p className="whitespace-pre-line text-sm text-slate-700">
                      {message.body}
                    </p>

                    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                      {message.recipients.map((recipient) => (
                        <li key={recipient.teacherId}>
                          <span
                            className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
                              recipient.readAt ? "bg-emerald-600" : "bg-slate-300"
                            }`}
                            aria-hidden="true"
                          />
                          {recipient.teacherName}
                          {recipient.readAt
                            ? ` · ${formatDateTime(new Date(recipient.readAt))}`
                            : " · nieprzeczytana"}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card h-fit p-5">
          <h2 className="mb-1 text-base font-semibold text-slate-900">
            Nowa wiadomość
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Wysyłka zbiorcza trafia do nauczycieli aktywnych w chwili wysłania.
            U adresata przy zakładce „Wiadomości” zapala się czerwona kropka.
          </p>
          <ActionForm
            action={sendMessageAction}
            submitLabel="Wyślij"
            resetOnSuccess
          >
            <SelectField
              label="Adresat"
              name="recipient"
              required
              defaultValue="ALL"
              options={[
                { value: "ALL", label: "Wszyscy nauczyciele" },
                ...teachers.map((teacher) => ({
                  value: teacher.id,
                  label: teacher.fullName,
                })),
              ]}
            />
            <Field label="Temat" name="subject" required />
            <div>
              <label className="label" htmlFor="body">
                Treść <span className="text-red-500">*</span>
              </label>
              <textarea
                id="body"
                name="body"
                rows={6}
                required
                className="input"
                placeholder="Np. przypomnienie o rozliczeniu miesiąca."
              />
            </div>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
