/**
 * Wiadomości od administratora do nauczycieli.
 *
 * Wysyła wyłącznie ADMIN — do jednego nauczyciela albo do wszystkich aktywnych.
 * Nauczyciel widzi tylko wiadomości zaadresowane do siebie i może oznaczać je
 * jako przeczytane; stan przeczytania jest per odbiorca.
 */
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { messageSchema } from "@/lib/validation";

export type MessageDto = {
  id: string;
  subject: string;
  body: string;
  broadcast: boolean;
  createdAt: string;
  senderEmail: string;
  /** Wypełniane w widoku nauczyciela. */
  readAt: string | null;
  /** Wypełniane w widoku admina. */
  recipients: Array<{
    teacherId: string;
    teacherName: string;
    readAt: string | null;
  }>;
};

const MESSAGE_SELECT = {
  id: true,
  subject: true,
  body: true,
  broadcast: true,
  createdAt: true,
  sender: { select: { email: true } },
  recipients: {
    select: {
      teacherId: true,
      readAt: true,
      teacher: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

function mapMessage(row: MessageRow, forTeacherId?: string | null): MessageDto {
  const own = forTeacherId
    ? row.recipients.find((recipient) => recipient.teacherId === forTeacherId)
    : undefined;

  return {
    id: row.id,
    subject: row.subject,
    body: row.body,
    broadcast: row.broadcast,
    createdAt: row.createdAt.toISOString(),
    senderEmail: row.sender.email,
    readAt: own?.readAt?.toISOString() ?? null,
    // Nauczyciel nie dostaje listy pozostałych odbiorców.
    recipients: forTeacherId
      ? []
      : row.recipients
          .map((recipient) => ({
            teacherId: recipient.teacherId,
            teacherName: `${recipient.teacher.firstName} ${recipient.teacher.lastName}`,
            readAt: recipient.readAt?.toISOString() ?? null,
          }))
          .sort((a, b) => a.teacherName.localeCompare(b.teacherName, "pl")),
  };
}

export async function sendMessage(
  actor: Actor,
  input: z.input<typeof messageSchema>
): Promise<MessageDto> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Wiadomości wysyła wyłącznie administrator.");
  }
  const data = messageSchema.parse(input);

  // Wysyłka zbiorcza trafia do nauczycieli aktywnych w chwili wysłania —
  // konto założone później nie dostaje starych wiadomości.
  const teachers = data.broadcast
    ? await prisma.teacherProfile.findMany({
        where: { active: true },
        select: { id: true },
      })
    : await prisma.teacherProfile.findMany({
        where: { id: data.teacherId ?? "" },
        select: { id: true },
      });

  if (teachers.length === 0) {
    throw new ValidationError(
      data.broadcast
        ? "Nie ma aktywnych nauczycieli, do których można wysłać wiadomość."
        : "Nie znaleziono wskazanego nauczyciela."
    );
  }

  const created = await prisma.message.create({
    data: {
      senderId: actor.userId,
      subject: data.subject,
      body: data.body,
      broadcast: data.broadcast,
      recipients: {
        create: teachers.map((teacher) => ({ teacherId: teacher.id })),
      },
    },
    select: MESSAGE_SELECT,
  });
  return mapMessage(created);
}

/** Skrzynka nadawcza admina razem z potwierdzeniami odczytu. */
export async function listSentMessages(actor: Actor): Promise<MessageDto[]> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Skrzynkę nadawczą widzi tylko administrator.");
  }
  const rows = await prisma.message.findMany({
    select: MESSAGE_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => mapMessage(row));
}

/** Skrzynka nauczyciela — wyłącznie wiadomości zaadresowane do niego. */
export async function listMyMessages(actor: Actor): Promise<MessageDto[]> {
  if (actor.role !== "TEACHER") {
    throw new ForbiddenError("Ta skrzynka należy do nauczyciela.");
  }
  const rows = await prisma.message.findMany({
    where: { recipients: { some: { teacherId: actor.teacherProfileId } } },
    select: MESSAGE_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => mapMessage(row, actor.teacherProfileId));
}

/** Liczba nieprzeczytanych — z tego bierze się czerwona kropka w menu. */
export async function countUnreadMessages(actor: Actor): Promise<number> {
  if (actor.role !== "TEACHER") return 0;
  return prisma.messageRecipient.count({
    where: { teacherId: actor.teacherProfileId, readAt: null },
  });
}

export async function markMessageRead(
  actor: Actor,
  messageId: string
): Promise<void> {
  if (actor.role !== "TEACHER") {
    throw new ForbiddenError("Wiadomości oznacza nauczyciel.");
  }
  const result = await prisma.messageRecipient.updateMany({
    where: {
      messageId,
      teacherId: actor.teacherProfileId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.messageRecipient.findFirst({
      where: { messageId, teacherId: actor.teacherProfileId },
      select: { id: true },
    });
    // Brak wpisu = cudza wiadomość; już przeczytana = nic do zrobienia.
    if (!exists) throw new NotFoundError("Nie znaleziono wiadomości.");
  }
}

export async function markAllMessagesRead(actor: Actor): Promise<number> {
  if (actor.role !== "TEACHER") {
    throw new ForbiddenError("Wiadomości oznacza nauczyciel.");
  }
  const result = await prisma.messageRecipient.updateMany({
    where: { teacherId: actor.teacherProfileId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function deleteMessage(actor: Actor, id: string): Promise<void> {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Wiadomości usuwa administrator.");
  }
  const result = await prisma.message.deleteMany({ where: { id } });
  if (result.count === 0) throw new NotFoundError("Nie znaleziono wiadomości.");
}
