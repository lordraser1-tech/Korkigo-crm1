/**
 * Płatności i rachunki (faza 2).
 *
 * Cała ta warstwa jest dostępna WYŁĄCZNIE dla roli ADMIN — kwoty ucznia nie
 * mogą wyciec do nauczyciela. Jedyny wyjątek to `getPaymentFlags()`, które
 * zwraca samą flagę „OK / zaległość”, bez żadnej kwoty i daty.
 */
import {
  Prisma,
  type BillingMode,
  type LessonStatus,
  type PaymentMethod,
} from "@prisma/client";
import { z } from "zod";
import type { Actor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  formatDate,
  formatTime,
  monthRange,
  toWallClockInput,
  wallClockToUtc,
} from "@/lib/datetime";
import { toAmount } from "@/lib/money";
import { loadRateLookup, resolveLessonRates } from "@/lib/services/subjects";
import {
  billingSettingsSchema,
  lessonInvoiceSchema,
  monthlyInvoiceSchema,
  packageInvoiceSchema,
  paymentSchema,
} from "@/lib/validation";

const ADMIN_ONLY = "Rozliczenia są dostępne tylko dla administratora.";

function assertAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN") throw new ForbiddenError(ADMIN_ONLY);
}

/** Opis pozycji na rachunku: „12 sty 2026, godz. 16:00”. */
function lessonLabel(scheduledAt: Date): string {
  return `${formatDate(scheduledAt)}, godz. ${formatTime(scheduledAt)}`;
}

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

// ---------- USTAWIENIA WYSTAWCY ----------

export type BillingSettingsDto = {
  sellerName: string;
  sellerAddress: string;
  sellerContact: string;
  sellerTaxNote: string;
  bankAccount: string;
  paymentTermDays: number;
  invoiceFooter: string;
};

export async function getBillingSettings(
  actor: Actor
): Promise<BillingSettingsDto> {
  assertAdmin(actor);
  const row = await prisma.billingSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  return {
    sellerName: row.sellerName,
    sellerAddress: row.sellerAddress,
    sellerContact: row.sellerContact,
    sellerTaxNote: row.sellerTaxNote,
    bankAccount: row.bankAccount,
    paymentTermDays: row.paymentTermDays,
    invoiceFooter: row.invoiceFooter,
  };
}

export async function updateBillingSettings(
  actor: Actor,
  input: z.input<typeof billingSettingsSchema>
): Promise<BillingSettingsDto> {
  assertAdmin(actor);
  const data = billingSettingsSchema.parse(input);
  await prisma.billingSettings.upsert({
    where: { id: "singleton" },
    update: {
      sellerName: data.sellerName ?? "",
      sellerAddress: data.sellerAddress ?? "",
      sellerContact: data.sellerContact ?? "",
      sellerTaxNote: data.sellerTaxNote ?? "",
      bankAccount: data.bankAccount ?? "",
      paymentTermDays: data.paymentTermDays,
      invoiceFooter: data.invoiceFooter ?? "",
    },
    create: {
      id: "singleton",
      sellerName: data.sellerName ?? "",
      sellerAddress: data.sellerAddress ?? "",
      sellerContact: data.sellerContact ?? "",
      sellerTaxNote: data.sellerTaxNote ?? "",
      bankAccount: data.bankAccount ?? "",
      paymentTermDays: data.paymentTermDays,
      invoiceFooter: data.invoiceFooter ?? "",
    },
  });
  return getBillingSettings(actor);
}

// ---------- RACHUNKI ----------

export type InvoicePaymentState =
  | "PAID"
  | "PARTIAL"
  | "UNPAID"
  | "OVERDUE"
  | "CANCELLED";

export type InvoiceItemDto = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  lessonId: string | null;
};

export type InvoiceDto = {
  id: string;
  number: string;
  studentId: string;
  studentName: string;
  issuedAt: string;
  dueAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  status: "ISSUED" | "CANCELLED";
  paymentState: InvoicePaymentState;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  note: string | null;
  sellerSnapshot: string | null;
  buyerSnapshot: string | null;
  items: InvoiceItemDto[];
};

const INVOICE_SELECT = {
  id: true,
  number: true,
  studentId: true,
  issuedAt: true,
  dueAt: true,
  periodStart: true,
  periodEnd: true,
  status: true,
  totalAmount: true,
  note: true,
  sellerSnapshot: true,
  buyerSnapshot: true,
  student: { select: { firstName: true, lastName: true } },
  items: {
    select: {
      id: true,
      description: true,
      quantity: true,
      unitPrice: true,
      amount: true,
      lessonId: true,
    },
    orderBy: { description: "asc" },
  },
  payments: { select: { amount: true } },
} satisfies Prisma.InvoiceSelect;

type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof INVOICE_SELECT }>;

function resolvePaymentState(
  status: "ISSUED" | "CANCELLED",
  balance: number,
  dueAt: Date,
  paid: number,
  now: Date
): InvoicePaymentState {
  if (status === "CANCELLED") return "CANCELLED";
  if (balance <= 0.004) return "PAID";
  if (dueAt < now) return "OVERDUE";
  return paid > 0 ? "PARTIAL" : "UNPAID";
}

function mapInvoice(row: InvoiceRow, now = new Date()): InvoiceDto {
  const total = toAmount(row.totalAmount);
  const paid = round(
    row.payments.reduce((sum, payment) => sum + toAmount(payment.amount), 0)
  );
  const balance = round(total - paid);

  return {
    id: row.id,
    number: row.number,
    studentId: row.studentId,
    studentName: `${row.student.firstName} ${row.student.lastName}`,
    issuedAt: row.issuedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    periodStart: row.periodStart?.toISOString() ?? null,
    periodEnd: row.periodEnd?.toISOString() ?? null,
    status: row.status,
    paymentState: resolvePaymentState(row.status, balance, row.dueAt, paid, now),
    totalAmount: total,
    paidAmount: paid,
    balance,
    note: row.note,
    sellerSnapshot: row.sellerSnapshot,
    buyerSnapshot: row.buyerSnapshot,
    items: row.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: toAmount(item.unitPrice),
      amount: toAmount(item.amount),
      lessonId: item.lessonId,
    })),
  };
}

export type InvoiceFilters = {
  month?: string | null;
  studentId?: string | null;
  state?: "OPEN" | "OVERDUE" | "PAID" | "CANCELLED" | null;
};

export async function listInvoices(
  actor: Actor,
  filters: InvoiceFilters = {}
): Promise<InvoiceDto[]> {
  assertAdmin(actor);

  const where: Prisma.InvoiceWhereInput = {};
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.month) {
    const { from, to } = monthRange(filters.month);
    where.issuedAt = { gte: from, lt: to };
  }

  const rows = await prisma.invoice.findMany({
    where,
    select: INVOICE_SELECT,
    orderBy: [{ issuedAt: "desc" }, { sequence: "desc" }],
  });

  const invoices = rows.map((row) => mapInvoice(row));
  if (!filters.state) return invoices;

  return invoices.filter((invoice) => {
    switch (filters.state) {
      case "PAID":
        return invoice.paymentState === "PAID";
      case "OVERDUE":
        return invoice.paymentState === "OVERDUE";
      case "CANCELLED":
        return invoice.paymentState === "CANCELLED";
      case "OPEN":
        return (
          invoice.paymentState === "UNPAID" ||
          invoice.paymentState === "PARTIAL" ||
          invoice.paymentState === "OVERDUE"
        );
      default:
        return true;
    }
  });
}

export async function getInvoice(actor: Actor, id: string): Promise<InvoiceDto> {
  assertAdmin(actor);
  const row = await prisma.invoice.findUnique({
    where: { id },
    select: INVOICE_SELECT,
  });
  if (!row) throw new NotFoundError("Nie znaleziono rachunku.");
  return mapInvoice(row);
}

/** Numer „1/09/2026” — numeracja liczona w miesiącu wystawienia. */
async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  issuedAt: Date
): Promise<{
  number: string;
  numberYear: number;
  numberMonth: number;
  sequence: number;
}> {
  const wall = toWallClockInput(issuedAt);
  const numberYear = Number(wall.slice(0, 4));
  const numberMonth = Number(wall.slice(5, 7));

  const last = await tx.invoice.findFirst({
    where: { numberYear, numberMonth },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const sequence = (last?.sequence ?? 0) + 1;

  return {
    number: `${sequence}/${String(numberMonth).padStart(2, "0")}/${numberYear}`,
    numberYear,
    numberMonth,
    sequence,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

type InvoiceDraft = {
  studentId: string;
  issuedAt: Date;
  dueAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  note: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    lessonId: string | null;
  }>;
};

async function createInvoice(draft: InvoiceDraft): Promise<InvoiceDto> {
  const total = round(draft.items.reduce((sum, item) => sum + item.amount, 0));
  const settings = await prisma.billingSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: draft.studentId },
    select: {
      firstName: true,
      lastName: true,
      parentName: true,
      contactEmail: true,
      contactPhone: true,
    },
  });

  const sellerSnapshot = [
    settings.sellerName,
    settings.sellerAddress,
    settings.sellerContact,
    settings.bankAccount ? `Konto: ${settings.bankAccount}` : "",
    settings.sellerTaxNote,
  ]
    .filter(Boolean)
    .join("\n");

  const buyerSnapshot = [
    `${student.firstName} ${student.lastName}`,
    student.parentName ? `Opiekun: ${student.parentName}` : "",
    student.contactEmail ?? "",
    student.contactPhone ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  // Numer nadajemy w transakcji; równoległe wystawienie łapie unikalność i ponawia.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const numbering = await nextInvoiceNumber(tx, draft.issuedAt);
        return tx.invoice.create({
          data: {
            ...numbering,
            studentId: draft.studentId,
            issuedAt: draft.issuedAt,
            dueAt: draft.dueAt,
            periodStart: draft.periodStart,
            periodEnd: draft.periodEnd,
            totalAmount: decimal(total),
            note: draft.note,
            sellerSnapshot,
            buyerSnapshot,
            items: {
              create: draft.items.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: decimal(item.unitPrice),
                amount: decimal(item.amount),
                lessonId: item.lessonId,
              })),
            },
          },
          select: INVOICE_SELECT,
        });
      });
      return mapInvoice(created);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Kolizja numeru albo lekcji już zafakturowanej — sprawdzamy, co to było.
      const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;
      const fields = Array.isArray(target) ? target.join(",") : String(target ?? "");
      if (fields.includes("lessonId")) {
        throw new ValidationError(
          "Ta lekcja jest już ujęta na innym rachunku."
        );
      }
    }
  }
  throw new ValidationError(
    "Nie udało się nadać numeru rachunku — spróbuj ponownie."
  );
}

async function resolveDates(
  issuedAtInput: string | undefined,
  dueDays: number | undefined
): Promise<{ issuedAt: Date; dueAt: Date }> {
  const settings = await prisma.billingSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  const issuedAt = issuedAtInput
    ? wallClockToUtc(`${issuedAtInput}T12:00`)
    : new Date();
  const days = dueDays ?? settings.paymentTermDays;
  const dueAt = new Date(issuedAt.getTime() + days * 24 * 60 * 60 * 1000);
  return { issuedAt, dueAt };
}

async function loadStudentForBilling(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      billingMode: true,
      teacherId: true,
    },
  });
  if (!student) throw new NotFoundError("Nie znaleziono ucznia.");
  return student;
}

/** Rachunek zbiorczy za miesiąc — tryb POSTPAID. */
export async function createMonthlyInvoice(
  actor: Actor,
  input: z.input<typeof monthlyInvoiceSchema>
): Promise<InvoiceDto> {
  assertAdmin(actor);
  const data = monthlyInvoiceSchema.parse(input);
  const student = await loadStudentForBilling(data.studentId);

  if (student.billingMode === "PREPAID") {
    throw new ValidationError(
      "Ten uczeń rozlicza się przedpłatą — wystaw rachunek za pakiet."
    );
  }

  const { from, to } = monthRange(data.month);
  const lessons = await prisma.lesson.findMany({
    where: {
      studentId: student.id,
      status: "COMPLETED",
      scheduledAt: { gte: from, lt: to },
      invoiceItem: { is: null },
    },
    select: {
      id: true,
      scheduledAt: true,
      subjectLevelId: true,
      subjectLevel: {
        select: { name: true, subject: { select: { name: true } } },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  if (lessons.length === 0) {
    throw new ValidationError(
      "Brak nierozliczonych lekcji zrealizowanych w tym miesiącu."
    );
  }

  // Każda lekcja ma własną cenę — zależy od przedmiotu i poziomu.
  const rates = await loadRateLookup({ studentIds: [student.id] });
  const missing = lessons.filter(
    (lesson) => rates.student(student.id, lesson.subjectLevelId) === null
  );
  if (missing.length > 0) {
    const labels = [
      ...new Set(
        missing.map(
          (lesson) =>
            `${lesson.subjectLevel.subject.name} · ${lesson.subjectLevel.name}`
        )
      ),
    ];
    throw new ValidationError(
      `Uczeń nie ma ustalonej ceny dla: ${labels.join(", ")}. Uzupełnij ją w zakładce Przedmioty.`
    );
  }

  const { issuedAt, dueAt } = await resolveDates(data.issuedAt, data.dueDays);

  return createInvoice({
    studentId: student.id,
    issuedAt,
    dueAt,
    periodStart: from,
    periodEnd: new Date(to.getTime() - 1),
    note: data.note,
    items: lessons.map((lesson) => {
      const price = rates.student(student.id, lesson.subjectLevelId) ?? 0;
      return {
        description: `${lesson.subjectLevel.subject.name} · ${lesson.subjectLevel.name} — ${lessonLabel(lesson.scheduledAt)}`,
        quantity: 1,
        unitPrice: price,
        amount: price,
        lessonId: lesson.id,
      };
    }),
  });
}

/** Rachunek za pojedynczą lekcję — tryb PER_LESSON. */
export async function createLessonInvoice(
  actor: Actor,
  input: z.input<typeof lessonInvoiceSchema>
): Promise<InvoiceDto> {
  assertAdmin(actor);
  const data = lessonInvoiceSchema.parse(input);

  const lesson = await prisma.lesson.findUnique({
    where: { id: data.lessonId },
    select: {
      id: true,
      studentId: true,
      teacherId: true,
      scheduledAt: true,
      status: true,
      subjectLevelId: true,
      invoiceItem: { select: { id: true } },
    },
  });
  if (!lesson) throw new NotFoundError("Nie znaleziono lekcji.");
  if (lesson.status !== "COMPLETED") {
    throw new ValidationError(
      "Rachunek wystawiamy tylko za lekcję zrealizowaną."
    );
  }
  if (lesson.invoiceItem) {
    throw new ValidationError("Ta lekcja jest już ujęta na innym rachunku.");
  }

  const student = await loadStudentForBilling(lesson.studentId);
  const pricing = await resolveLessonRates({
    teacherId: lesson.teacherId,
    studentId: lesson.studentId,
    subjectLevelId: lesson.subjectLevelId,
  });

  const { issuedAt, dueAt } = await resolveDates(data.issuedAt, data.dueDays);

  return createInvoice({
    studentId: student.id,
    issuedAt,
    dueAt,
    periodStart: lesson.scheduledAt,
    periodEnd: lesson.scheduledAt,
    note: data.note,
    items: [
      {
        description: `${pricing.label} — ${lessonLabel(lesson.scheduledAt)}`,
        quantity: 1,
        unitPrice: pricing.studentAmount,
        amount: pricing.studentAmount,
        lessonId: lesson.id,
      },
    ],
  });
}

/** Rachunek za pakiet z góry — tryb PREPAID. */
export async function createPackageInvoice(
  actor: Actor,
  input: z.input<typeof packageInvoiceSchema>
): Promise<InvoiceDto> {
  assertAdmin(actor);
  const data = packageInvoiceSchema.parse(input);
  const student = await loadStudentForBilling(data.studentId);

  // Pakiet dotyczy konkretnego przedmiotu/poziomu — stąd bierze się cena,
  // chyba że admin poda własną.
  let unitPrice = data.unitPrice ?? null;
  let packageLabel = "";
  if (data.subjectLevelId) {
    const rates = await loadRateLookup({ studentIds: [student.id] });
    const fromRate = rates.student(student.id, data.subjectLevelId);
    const level = await prisma.subjectLevel.findUnique({
      where: { id: data.subjectLevelId },
      select: { name: true, subject: { select: { name: true } } },
    });
    if (!level) throw new ValidationError("Wybrany przedmiot/poziom nie istnieje.");
    packageLabel = `${level.subject.name} · ${level.name}`;
    if (unitPrice === null) unitPrice = fromRate;
  }

  if (unitPrice === null || unitPrice <= 0) {
    throw new ValidationError(
      "Podaj cenę za lekcję albo ustal cenę ucznia dla wybranego przedmiotu."
    );
  }

  const { issuedAt, dueAt } = await resolveDates(data.issuedAt, data.dueDays);

  return createInvoice({
    studentId: student.id,
    issuedAt,
    dueAt,
    periodStart: null,
    periodEnd: null,
    note: data.note,
    items: [
      {
        description:
          data.description ??
          `Pakiet ${packageLabel ? `— ${packageLabel} ` : ""}(${data.quantity} lekcji)`,
        quantity: data.quantity,
        unitPrice,
        amount: round(unitPrice * data.quantity),
        lessonId: null,
      },
    ],
  });
}

export async function cancelInvoice(
  actor: Actor,
  id: string
): Promise<InvoiceDto> {
  assertAdmin(actor);
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, status: true, _count: { select: { payments: true } } },
  });
  if (!invoice) throw new NotFoundError("Nie znaleziono rachunku.");
  if (invoice.status === "CANCELLED") {
    throw new ValidationError("Ten rachunek jest już anulowany.");
  }
  if (invoice._count.payments > 0) {
    throw new ValidationError(
      "Do rachunku są przypisane wpłaty — usuń je przed anulowaniem."
    );
  }

  // Anulowany rachunek zwalnia lekcje, żeby dało się wystawić poprawny.
  await prisma.$transaction([
    prisma.invoiceItem.updateMany({
      where: { invoiceId: id },
      data: { lessonId: null },
    }),
    prisma.invoice.update({ where: { id }, data: { status: "CANCELLED" } }),
  ]);

  return getInvoice(actor, id);
}

// ---------- WPŁATY ----------

export type PaymentDto = {
  id: string;
  studentId: string;
  studentName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amount: number;
  paidAt: string;
  method: PaymentMethod;
  note: string | null;
};

const PAYMENT_SELECT = {
  id: true,
  studentId: true,
  invoiceId: true,
  amount: true,
  paidAt: true,
  method: true,
  note: true,
  student: { select: { firstName: true, lastName: true } },
  invoice: { select: { number: true } },
} satisfies Prisma.PaymentSelect;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

function mapPayment(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: `${row.student.firstName} ${row.student.lastName}`,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoice?.number ?? null,
    amount: toAmount(row.amount),
    paidAt: row.paidAt.toISOString(),
    method: row.method,
    note: row.note,
  };
}

export async function listPayments(
  actor: Actor,
  filters: { month?: string | null; studentId?: string | null } = {}
): Promise<PaymentDto[]> {
  assertAdmin(actor);
  const where: Prisma.PaymentWhereInput = {};
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.month) {
    const { from, to } = monthRange(filters.month);
    where.paidAt = { gte: from, lt: to };
  }
  const rows = await prisma.payment.findMany({
    where,
    select: PAYMENT_SELECT,
    orderBy: { paidAt: "desc" },
  });
  return rows.map(mapPayment);
}

export async function recordPayment(
  actor: Actor,
  input: z.input<typeof paymentSchema>
): Promise<PaymentDto> {
  assertAdmin(actor);
  const data = paymentSchema.parse(input);

  const student = await prisma.student.findUnique({
    where: { id: data.studentId },
    select: { id: true },
  });
  if (!student) throw new NotFoundError("Nie znaleziono ucznia.");

  if (data.invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: data.invoiceId },
      select: { id: true, studentId: true, status: true },
    });
    if (!invoice) throw new NotFoundError("Nie znaleziono rachunku.");
    if (invoice.studentId !== student.id) {
      throw new ValidationError("Rachunek należy do innego ucznia.");
    }
    if (invoice.status === "CANCELLED") {
      throw new ValidationError("Nie można dopisać wpłaty do anulowanego rachunku.");
    }
  }

  const created = await prisma.payment.create({
    data: {
      studentId: student.id,
      invoiceId: data.invoiceId ?? null,
      amount: decimal(data.amount),
      paidAt: data.paidAt ? wallClockToUtc(`${data.paidAt}T12:00`) : new Date(),
      method: data.method,
      note: data.note,
    },
    select: PAYMENT_SELECT,
  });
  return mapPayment(created);
}

export async function deletePayment(actor: Actor, id: string): Promise<void> {
  assertAdmin(actor);
  const result = await prisma.payment.deleteMany({ where: { id } });
  if (result.count === 0) throw new NotFoundError("Nie znaleziono wpłaty.");
}

// ---------- SALDA, ZALEGŁOŚCI I STATUS LEKCJI ----------

export type StudentBalanceDto = {
  studentId: string;
  studentName: string;
  billingMode: BillingMode;
  /** Wartość lekcji zrealizowanych po cenach ucznia — to, co uczeń „zużył”. */
  charged: number;
  /** Suma wystawionych rachunków (bez anulowanych) — informacyjnie. */
  invoiced: number;
  paid: number;
  /**
   * `paid - charged`. Dodatnie = środki na koncie ucznia (np. reszta pakietu),
   * ujemne = zaległość faktyczna. Liczone z LEKCJI, nie z rachunków — dzięki
   * temu przekroczony pakiet widać od razu, a nie dopiero po wystawieniu
   * kolejnego dokumentu.
   */
  balance: number;
  /** Kwota z rachunków po terminie płatności. */
  overdueAmount: number;
  oldestDueAt: string | null;
  /** Ile lekcji nie jest jeszcze opłaconych. */
  unpaidLessons: number;
  /** Czy pokazać alert: rachunek po terminie albo ujemne saldo. */
  arrears: boolean;
};

export type LessonPaymentState =
  | "PAID"
  | "PARTIAL"
  | "UNPAID"
  | "OVERDUE"
  | "NOT_CHARGED";

export type LessonPaymentInfo = {
  state: LessonPaymentState;
  /** Czy lekcja jest pokryta ze środków wpłaconych z góry. */
  fromPackage: boolean;
  /** Numer rachunku — wyłącznie dla admina; nauczyciel dostaje `null`. */
  invoiceNumber: string | null;
  invoiceId: string | null;
};

/** Statusy lekcji, które naliczają się uczniowi. */
const CHARGEABLE: LessonStatus[] = ["COMPLETED", "NO_SHOW"];

type LessonForBilling = {
  id: string;
  scheduledAt: Date;
  status: LessonStatus;
  price: number;
  monthKey: string;
};

type StudentBillingState = {
  studentId: string;
  studentName: string;
  billingMode: BillingMode;
  charged: number;
  invoiced: number;
  paid: number;
  balance: number;
  overdueAmount: number;
  oldestDueAt: Date | null;
  unpaidLessons: number;
  lessonStates: Map<string, LessonPaymentInfo>;
};

/**
 * Jedno przejście po danych ucznia, z którego biorą się i saldo, i status
 * każdej lekcji.
 *
 * Status liczy się od razu po odznaczeniu lekcji jako zrealizowanej —
 * rachunek jest potrzebny jako dokument (druk, NDG), ale nie warunkuje tego,
 * co widać w interfejsie. Reguły zależą od trybu rozliczeń:
 *
 * - PREPAID i PER_LESSON: wpłaty pokrywają lekcje chronologicznie, od
 *   najstarszej; gdy środki się skończą, kolejne lekcje są nieopłacone,
 * - POSTPAID: lekcje z danego miesiąca są nieopłacone, dopóki rachunek za ten
 *   miesiąc nie zostanie opłacony w całości.
 */
function buildStudentBillingState(
  input: {
    studentId: string;
    studentName: string;
    billingMode: BillingMode;
    lessons: LessonForBilling[];
    payments: number[];
    invoices: Array<{
      id: string;
      number: string;
      totalAmount: number;
      dueAt: Date;
      status: "ISSUED" | "CANCELLED";
      paid: number;
      monthKeys: Set<string>;
      lessonIds: Set<string>;
    }>;
  },
  now: Date
): StudentBillingState {
  const lessons = [...input.lessons].sort(
    (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()
  );

  const charged = round(
    lessons
      .filter((lesson) => CHARGEABLE.includes(lesson.status))
      .reduce((sum, lesson) => sum + lesson.price, 0)
  );
  const paid = round(input.payments.reduce((sum, amount) => sum + amount, 0));

  let invoiced = 0;
  let overdueAmount = 0;
  let oldestDueAt: Date | null = null;
  for (const invoice of input.invoices) {
    if (invoice.status === "CANCELLED") continue;
    invoiced += invoice.totalAmount;
    const rest = round(invoice.totalAmount - invoice.paid);
    if (rest > 0.004 && invoice.dueAt < now) {
      overdueAmount += rest;
      if (!oldestDueAt || invoice.dueAt < oldestDueAt) oldestDueAt = invoice.dueAt;
    }
  }

  const lessonStates = new Map<string, LessonPaymentInfo>();
  const invoiceForLesson = new Map<string, (typeof input.invoices)[number]>();
  for (const invoice of input.invoices) {
    if (invoice.status === "CANCELLED") continue;
    for (const lessonId of invoice.lessonIds) invoiceForLesson.set(lessonId, invoice);
  }

  let unpaidLessons = 0;
  let pool = paid;

  for (const lesson of lessons) {
    if (lesson.status === "CANCELLED") {
      lessonStates.set(lesson.id, {
        state: "NOT_CHARGED",
        fromPackage: false,
        invoiceNumber: null,
        invoiceId: null,
      });
      continue;
    }

    const invoice = invoiceForLesson.get(lesson.id);
    const invoiceNumber = invoice?.number ?? null;
    const invoiceId = invoice?.id ?? null;

    if (input.billingMode === "POSTPAID") {
      // Rachunek miesięczny decyduje o całym miesiącu.
      const monthInvoice =
        invoice ??
        input.invoices.find(
          (candidate) =>
            candidate.status !== "CANCELLED" &&
            candidate.monthKeys.has(lesson.monthKey)
        );

      let state: LessonPaymentState = "UNPAID";
      if (monthInvoice) {
        const rest = round(monthInvoice.totalAmount - monthInvoice.paid);
        if (rest <= 0.004) state = "PAID";
        else if (monthInvoice.dueAt < now) state = "OVERDUE";
        else if (monthInvoice.paid > 0) state = "PARTIAL";
      }
      if (state !== "PAID" && CHARGEABLE.includes(lesson.status)) unpaidLessons += 1;

      lessonStates.set(lesson.id, {
        state,
        fromPackage: false,
        invoiceNumber: monthInvoice?.number ?? invoiceNumber,
        invoiceId: monthInvoice?.id ?? invoiceId,
      });
      continue;
    }

    // PREPAID i PER_LESSON: wpłaty pokrywają lekcje po kolei.
    let state: LessonPaymentState;
    if (pool >= lesson.price - 0.004 && lesson.price > 0) {
      pool = round(pool - lesson.price);
      state = "PAID";
    } else if (pool > 0.004) {
      pool = 0;
      state = "PARTIAL";
    } else {
      state = "UNPAID";
    }

    if (state !== "PAID" && CHARGEABLE.includes(lesson.status)) unpaidLessons += 1;

    lessonStates.set(lesson.id, {
      state,
      fromPackage: input.billingMode === "PREPAID" && state !== "UNPAID",
      invoiceNumber,
      invoiceId,
    });
  }

  const balance = round(paid - charged);

  return {
    studentId: input.studentId,
    studentName: input.studentName,
    billingMode: input.billingMode,
    charged,
    invoiced: round(invoiced),
    paid,
    balance,
    overdueAmount: round(overdueAmount),
    oldestDueAt,
    unpaidLessons,
    lessonStates,
  };
}

/** Wczytuje dane rozliczeniowe uczniów i składa z nich stan. */
async function loadBillingStates(
  studentIds: string[] | null,
  now: Date
): Promise<StudentBillingState[]> {
  const where: Prisma.StudentWhereInput = studentIds
    ? { id: { in: studentIds } }
    : {};

  const students = await prisma.student.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      billingMode: true,
      lessons: {
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          subjectLevelId: true,
        },
      },
      payments: { select: { amount: true } },
      invoices: {
        select: {
          id: true,
          number: true,
          totalAmount: true,
          dueAt: true,
          status: true,
          periodStart: true,
          payments: { select: { amount: true } },
          items: { select: { lessonId: true } },
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const rates = await loadRateLookup({
    studentIds: students.map((student) => student.id),
  });

  return students.map((student) =>
    buildStudentBillingState(
      {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        billingMode: student.billingMode,
        lessons: student.lessons.map((lesson) => ({
          id: lesson.id,
          scheduledAt: lesson.scheduledAt,
          status: lesson.status,
          price: rates.student(student.id, lesson.subjectLevelId) ?? 0,
          monthKey: toWallClockInput(lesson.scheduledAt).slice(0, 7),
        })),
        payments: student.payments.map((payment) => toAmount(payment.amount)),
        invoices: student.invoices.map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          totalAmount: toAmount(invoice.totalAmount),
          dueAt: invoice.dueAt,
          status: invoice.status,
          paid: invoice.payments.reduce(
            (sum, payment) => sum + toAmount(payment.amount),
            0
          ),
          monthKeys: new Set(
            invoice.periodStart
              ? [toWallClockInput(invoice.periodStart).slice(0, 7)]
              : []
          ),
          lessonIds: new Set(
            invoice.items
              .map((item) => item.lessonId)
              .filter((id): id is string => id !== null)
          ),
        })),
      },
      now
    )
  );
}

function toBalanceDto(state: StudentBillingState): StudentBalanceDto {
  return {
    studentId: state.studentId,
    studentName: state.studentName,
    billingMode: state.billingMode,
    charged: state.charged,
    invoiced: state.invoiced,
    paid: state.paid,
    balance: state.balance,
    overdueAmount: state.overdueAmount,
    oldestDueAt: state.oldestDueAt?.toISOString() ?? null,
    unpaidLessons: state.unpaidLessons,
    arrears: state.overdueAmount > 0.004 || state.balance < -0.004,
  };
}

export async function listReceivables(
  actor: Actor,
  now = new Date()
): Promise<StudentBalanceDto[]> {
  assertAdmin(actor);
  const states = await loadBillingStates(null, now);
  return states.map(toBalanceDto);
}

export async function getStudentBalance(
  actor: Actor,
  studentId: string,
  now = new Date()
): Promise<StudentBalanceDto> {
  assertAdmin(actor);
  const [state] = await loadBillingStates([studentId], now);
  if (!state) throw new NotFoundError("Nie znaleziono ucznia.");
  return toBalanceDto(state);
}

/** Rachunki i wpłaty jednego ucznia — sekcja rozliczeń w karcie ucznia. */
export async function getStudentBilling(
  actor: Actor,
  studentId: string
): Promise<{
  balance: StudentBalanceDto;
  invoices: InvoiceDto[];
  payments: PaymentDto[];
  unbilledLessons: number;
}> {
  assertAdmin(actor);
  const [balance, invoices, payments, unbilledLessons] = await Promise.all([
    getStudentBalance(actor, studentId),
    listInvoices(actor, { studentId }),
    listPayments(actor, { studentId }),
    prisma.lesson.count({
      where: { studentId, status: "COMPLETED", invoiceItem: { is: null } },
    }),
  ]);
  return { balance, invoices, payments, unbilledLessons };
}

// ---------- FLAGA DLA NAUCZYCIELA ----------

export type PaymentFlag = "OK" | "OVERDUE";

/**
 * Jedyne dane rozliczeniowe, jakie widzi nauczyciel: sama flaga, bez kwot,
 * dat i numerów rachunków. Nauczyciel dostaje flagi tylko dla swoich uczniów.
 */
export async function getPaymentFlags(
  actor: Actor,
  studentIds: string[],
  now = new Date()
): Promise<Map<string, PaymentFlag>> {
  const flags = new Map<string, PaymentFlag>();
  if (studentIds.length === 0) return flags;

  const scope: Prisma.StudentWhereInput =
    actor.role === "ADMIN" ? {} : { teacherId: actor.teacherProfileId };

  const allowed = await prisma.student.findMany({
    where: { id: { in: studentIds }, ...scope },
    select: { id: true },
  });
  const states = await loadBillingStates(
    allowed.map((student) => student.id),
    now
  );

  for (const state of states) {
    const balance = toBalanceDto(state);
    flags.set(balance.studentId, balance.arrears ? "OVERDUE" : "OK");
  }
  return flags;
}

export type UnbilledLessonDto = {
  lessonId: string;
  studentId: string;
  studentName: string;
  billingMode: BillingMode;
  scheduledAt: string;
  subjectLabel: string;
  /** Cena ucznia za tę lekcję; 0 oznacza brak ustalonej ceny. */
  amount: number;
};

/** Lekcje zrealizowane, które nie trafiły jeszcze na żaden rachunek. */
export async function listUnbilledLessons(
  actor: Actor,
  studentId?: string | null
): Promise<UnbilledLessonDto[]> {
  assertAdmin(actor);
  const rows = await prisma.lesson.findMany({
    where: {
      status: "COMPLETED",
      invoiceItem: { is: null },
      ...(studentId ? { studentId } : {}),
    },
    select: {
      id: true,
      studentId: true,
      scheduledAt: true,
      subjectLevelId: true,
      subjectLevel: {
        select: { name: true, subject: { select: { name: true } } },
      },
      student: {
        select: { firstName: true, lastName: true, billingMode: true },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const rates = await loadRateLookup();

  return rows.map((row) => ({
    lessonId: row.id,
    studentId: row.studentId,
    studentName: `${row.student.firstName} ${row.student.lastName}`,
    billingMode: row.student.billingMode,
    scheduledAt: row.scheduledAt.toISOString(),
    subjectLabel: `${row.subjectLevel.subject.name} · ${row.subjectLevel.name}`,
    amount: rates.student(row.studentId, row.subjectLevelId) ?? 0,
  }));
}

// ---------- STATUS PŁATNOŚCI POJEDYNCZEJ LEKCJI ----------

// ---------- STATUS PŁATNOŚCI POJEDYNCZEJ LEKCJI ----------

/**
 * Odpowiada na pytanie „za którą lekcję zapłacono?”. Status liczy się na żywo
 * z wpłat i lekcji (patrz `buildStudentBillingState`), a nie dopiero po
 * wystawieniu rachunku.
 *
 * Nauczyciel dostaje sam status — bez kwot i numerów rachunków — i wyłącznie
 * dla swoich lekcji. Admin dodatkowo numer rachunku.
 */
export async function getLessonPaymentStates(
  actor: Actor,
  lessonIds: string[],
  now = new Date()
): Promise<Map<string, LessonPaymentInfo>> {
  const result = new Map<string, LessonPaymentInfo>();
  if (lessonIds.length === 0) return result;

  const scope =
    actor.role === "ADMIN" ? {} : { teacherId: actor.teacherProfileId };
  const showInvoiceNumbers = actor.role === "ADMIN";

  const lessons = await prisma.lesson.findMany({
    where: { id: { in: lessonIds }, ...scope },
    select: { id: true, studentId: true },
  });
  if (lessons.length === 0) return result;

  const states = await loadBillingStates(
    [...new Set(lessons.map((lesson) => lesson.studentId))],
    now
  );
  const byStudent = new Map(states.map((state) => [state.studentId, state]));

  for (const lesson of lessons) {
    const info = byStudent.get(lesson.studentId)?.lessonStates.get(lesson.id);
    if (!info) continue;
    result.set(lesson.id, {
      ...info,
      invoiceNumber: showInvoiceNumbers ? info.invoiceNumber : null,
      invoiceId: showInvoiceNumbers ? info.invoiceId : null,
    });
  }
  return result;
}
