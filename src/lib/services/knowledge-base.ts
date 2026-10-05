/**
 * Baza wiedzy: materiały pomocnicze przypięte do PRZEDMIOTU.
 *
 * Dodaje, zmienia i kasuje **wyłącznie admin**. Nauczyciel czyta — i to tylko
 * przedmioty, które ma przypisane.
 *
 * Co znaczy „przypisany przedmiot": ten, do którego nauczyciel ma stawkę
 * (`TeacherRate`) na którymkolwiek poziomie. To nie jest obejście z braku
 * lepszego pola — stawka JEST przypisaniem w tym systemie: bez niej
 * `resolveLessonRates` odrzuca zapis lekcji, więc nauczyciel i tak nie może
 * uczyć przedmiotu, do którego stawki nie ma. Gdyby kiedyś pojawiło się
 * osobne „przypisanie", zmienia się tylko `assignedSubjectIds`.
 *
 * Materiał nie zawiera żadnych kwot, więc ten sam widok jest bezpieczny dla
 * obu ról — różni się wyłącznie tym, ile przedmiotów widać.
 */
import { z } from "zod";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  knowledgeEntrySchema,
  knowledgeEntryUpdateSchema,
} from "@/lib/validation";

export type KnowledgeEntryDto = {
  id: string;
  subjectId: string;
  title: string;
  url: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

/** Przedmiot razem ze swoimi materiałami — jedna zakładka w interfejsie. */
export type KnowledgeSubjectDto = {
  subjectId: string;
  subjectName: string;
  active: boolean;
  entries: KnowledgeEntryDto[];
};

const ENTRY_SELECT = {
  id: true,
  subjectId: true,
  title: true,
  url: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.KnowledgeBaseEntrySelect;

type EntryRow = Prisma.KnowledgeBaseEntryGetPayload<{ select: typeof ENTRY_SELECT }>;

function mapEntry(row: EntryRow): KnowledgeEntryDto {
  return {
    id: row.id,
    subjectId: row.subjectId,
    title: row.title,
    url: row.url,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN") {
    throw new ForbiddenError("Materiały dodaje administrator.");
  }
}

/**
 * Identyfikatory przedmiotów, do których nauczyciel ma stawkę.
 * `null` oznacza „bez ograniczenia" (admin), a nie „żadnych".
 */
async function assignedSubjectIds(actor: Actor): Promise<string[] | null> {
  if (actor.role === "ADMIN") return null;

  const rates = await prisma.teacherRate.findMany({
    where: { teacherId: actor.teacherProfileId },
    select: { subjectLevel: { select: { subjectId: true } } },
  });
  return [...new Set(rates.map((rate) => rate.subjectLevel.subjectId))];
}

/**
 * Cała baza wiedzy pogrupowana w zakładki.
 *
 * Nauczyciel dostaje wyłącznie swoje przedmioty — i to po stronie zapytania,
 * a nie przez ukrycie zakładek w interfejsie. Przedmioty wyłączone pokazujemy
 * tylko adminowi: nauczyciel nie ma po co oglądać archiwum.
 */
export async function listKnowledgeBase(
  actor: Actor
): Promise<KnowledgeSubjectDto[]> {
  const allowed = await assignedSubjectIds(actor);
  if (allowed !== null && allowed.length === 0) return [];

  const rows = await prisma.subject.findMany({
    where:
      allowed === null ? {} : { id: { in: allowed }, active: true },
    select: {
      id: true,
      name: true,
      active: true,
      knowledgeBase: {
        select: ENTRY_SELECT,
        orderBy: { title: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    subjectId: row.id,
    subjectName: row.name,
    active: row.active,
    entries: row.knowledgeBase.map(mapEntry),
  }));
}

/**
 * Pojedynczy materiał. Nauczyciel pytający o materiał z nieswojego przedmiotu
 * dostaje `NotFoundError`, nie 403 — tak samo jak przy cudzym uczniu.
 */
export async function getKnowledgeEntry(
  actor: Actor,
  id: string
): Promise<KnowledgeEntryDto> {
  const allowed = await assignedSubjectIds(actor);
  const row = await prisma.knowledgeBaseEntry.findFirst({
    where: allowed === null ? { id } : { id, subjectId: { in: allowed } },
    select: ENTRY_SELECT,
  });
  if (!row) throw new NotFoundError("Nie znaleziono materiału.");
  return mapEntry(row);
}

export async function createKnowledgeEntry(
  actor: Actor,
  input: z.input<typeof knowledgeEntrySchema>
): Promise<KnowledgeEntryDto> {
  assertAdmin(actor);
  const data = knowledgeEntrySchema.parse(input);

  const subject = await prisma.subject.findUnique({
    where: { id: data.subjectId },
    select: { id: true },
  });
  if (!subject) throw new NotFoundError("Nie znaleziono przedmiotu.");

  const row = await prisma.knowledgeBaseEntry.create({
    data,
    select: ENTRY_SELECT,
  });
  return mapEntry(row);
}

/** Przedmiotu nie przenosimy — materiał z innego przedmiotu zakłada się od nowa. */
export async function updateKnowledgeEntry(
  actor: Actor,
  id: string,
  input: z.input<typeof knowledgeEntryUpdateSchema>
): Promise<KnowledgeEntryDto> {
  assertAdmin(actor);
  const data = knowledgeEntryUpdateSchema.parse(input);

  const existing = await prisma.knowledgeBaseEntry.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Nie znaleziono materiału.");

  const row = await prisma.knowledgeBaseEntry.update({
    where: { id },
    data,
    select: ENTRY_SELECT,
  });
  return mapEntry(row);
}

export async function deleteKnowledgeEntry(
  actor: Actor,
  id: string
): Promise<void> {
  assertAdmin(actor);
  const existing = await prisma.knowledgeBaseEntry.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Nie znaleziono materiału.");
  await prisma.knowledgeBaseEntry.delete({ where: { id } });
}

/** Ile materiałów widzi ta osoba — do podpisu przy zakładce w menu. */
export async function countKnowledgeEntries(actor: Actor): Promise<number> {
  const allowed = await assignedSubjectIds(actor);
  if (allowed !== null && allowed.length === 0) return 0;
  return prisma.knowledgeBaseEntry.count({
    where: allowed === null ? {} : { subjectId: { in: allowed } },
  });
}
