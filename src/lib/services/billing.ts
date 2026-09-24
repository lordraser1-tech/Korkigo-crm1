/**
 * Płatności i rachunki (faza 2).
 *
 * Cała ta warstwa jest dostępna WYŁĄCZNIE dla roli ADMIN — kwoty ucznia nie
 * mogą wyciec do nauczyciela. Jedyny wyjątek to `getPaymentFlags()`, które
 * zwraca samą flagę „OK / zaległość”, bez żadnej kwoty i daty.
 */
import { Prisma, type BillingMode, type PaymentMethod } from "@prisma/client";
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
      ratePerLesson: true,
      billingMode: true,
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
    select: { id: true, scheduledAt: true },
    orderBy: { scheduledAt: "asc" },
  });

  if (lessons.length === 0) {
    throw new ValidationError(
      "Brak nierozliczonych lekcji zrealizowanych w tym miesiącu."
    );
  }

  const rate = toAmount(student.ratePerLesson);
  if (rate <= 0) {
    throw new ValidationError(
      "Uczeń nie ma ustalonej stawki — uzupełnij ją przed wystawieniem rachunku."
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
    items: lessons.map((lesson) => ({
      description: `Lekcja języka polskiego — ${lessonLabel(lesson.scheduledAt)}`,
      quantity: 1,
      unitPrice: rate,
      amount: rate,
      lessonId: lesson.id,
    })),
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
      scheduledAt: true,
      status: true,
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
  const rate = toAmount(student.ratePerLesson);
  if (rate <= 0) {
    throw new ValidationError(
      "Uczeń nie ma ustalonej stawki — uzupełnij ją przed wystawieniem rachunku."
    );
  }

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
        description: `Lekcja języka polskiego — ${lessonLabel(lesson.scheduledAt)}`,
        quantity: 1,
        unitPrice: rate,
        amount: rate,
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

  const unitPrice = data.unitPrice ?? toAmount(student.ratePerLesson);
  if (unitPrice <= 0) {
    throw new ValidationError(
      "Podaj cenę za lekcję albo uzupełnij stawkę ucznia."
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
          `Pakiet lekcji języka polskiego — ${data.quantity} lekcji`,
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

// ---------- SALDA I ZALEGŁOŚCI ----------

export type StudentBalanceDto = {
  studentId: string;
  studentName: string;
  billingMode: BillingMode;
  invoiced: number;
  paid: number;
  /** Dodatnie saldo = nadpłata ucznia, ujemne = zaległość. */
  balance: number;
  overdueAmount: number;
  oldestDueAt: string | null;
  /** Tylko dla PREPAID: ile lekcji z pakietu zostało. */
  prepaidRemaining: number | null;
};

type BalanceInput = {
  studentId: string;
  studentName: string;
  billingMode: BillingMode;
  invoices: Array<{
    totalAmount: number;
    dueAt: Date;
    status: "ISSUED" | "CANCELLED";
    paid: number;
    prepaidUnits: number;
  }>;
  payments: number;
  unbilledCompletedLessons: number;
};

function buildBalance(input: BalanceInput, now: Date): StudentBalanceDto {
  let invoiced = 0;
  let overdueAmount = 0;
  let prepaidUnits = 0;
  let oldestDueAt: Date | null = null;

  for (const invoice of input.invoices) {
    if (invoice.status === "CANCELLED") continue;
    invoiced += invoice.totalAmount;
    prepaidUnits += invoice.prepaidUnits;

    const balance = round(invoice.totalAmount - invoice.paid);
    if (balance > 0.004 && invoice.dueAt < now) {
      overdueAmount += balance;
      if (!oldestDueAt || invoice.dueAt < oldestDueAt) oldestDueAt = invoice.dueAt;
    }
  }

  return {
    studentId: input.studentId,
    studentName: input.studentName,
    billingMode: input.billingMode,
    invoiced: round(invoiced),
    paid: round(input.payments),
    balance: round(input.payments - invoiced),
    overdueAmount: round(overdueAmount),
    oldestDueAt: oldestDueAt ? (oldestDueAt as Date).toISOString() : null,
    prepaidRemaining:
      input.billingMode === "PREPAID"
        ? prepaidUnits - input.unbilledCompletedLessons
        : null,
  };
}

async function loadBalances(
  studentIds: string[] | null,
  now: Date
): Promise<StudentBalanceDto[]> {
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
      invoices: {
        select: {
          totalAmount: true,
          dueAt: true,
          status: true,
          payments: { select: { amount: true } },
          items: { select: { quantity: true, lessonId: true } },
        },
      },
      payments: { select: { amount: true } },
      _count: {
        select: {
          lessons: { where: { status: "COMPLETED", invoiceItem: { is: null } } },
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return students.map((student) =>
    buildBalance(
      {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        billingMode: student.billingMode,
        invoices: student.invoices.map((invoice) => ({
          totalAmount: toAmount(invoice.totalAmount),
          dueAt: invoice.dueAt,
          status: invoice.status,
          paid: invoice.payments.reduce(
            (sum, payment) => sum + toAmount(payment.amount),
            0
          ),
          prepaidUnits: invoice.items
            .filter((item) => item.lessonId === null)
            .reduce((sum, item) => sum + item.quantity, 0),
        })),
        payments: student.payments.reduce(
          (sum, payment) => sum + toAmount(payment.amount),
          0
        ),
        unbilledCompletedLessons: student._count.lessons,
      },
      now
    )
  );
}

export async function listReceivables(
  actor: Actor,
  now = new Date()
): Promise<StudentBalanceDto[]> {
  assertAdmin(actor);
  return loadBalances(null, now);
}

export async function getStudentBalance(
  actor: Actor,
  studentId: string,
  now = new Date()
): Promise<StudentBalanceDto> {
  assertAdmin(actor);
  const [balance] = await loadBalances([studentId], now);
  if (!balance) throw new NotFoundError("Nie znaleziono ucznia.");
  return balance;
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
  if (studentIds.length === 0) return new Map();

  const scope: Prisma.StudentWhereInput =
    actor.role === "ADMIN" ? {} : { teacherId: actor.teacherProfileId };

  const allowed = await prisma.student.findMany({
    where: { id: { in: studentIds }, ...scope },
    select: { id: true },
  });
  const balances = await loadBalances(
    allowed.map((student) => student.id),
    now
  );

  const flags = new Map<string, PaymentFlag>();
  for (const balance of balances) {
    const overdue =
      balance.overdueAmount > 0.004 ||
      (balance.prepaidRemaining !== null && balance.prepaidRemaining < 0);
    flags.set(balance.studentId, overdue ? "OVERDUE" : "OK");
  }
  return flags;
}

export type UnbilledLessonDto = {
  lessonId: string;
  studentId: string;
  studentName: string;
  billingMode: BillingMode;
  scheduledAt: string;
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
      student: {
        select: {
          firstName: true,
          lastName: true,
          ratePerLesson: true,
          billingMode: true,
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return rows.map((row) => ({
    lessonId: row.id,
    studentId: row.studentId,
    studentName: `${row.student.firstName} ${row.student.lastName}`,
    billingMode: row.student.billingMode,
    scheduledAt: row.scheduledAt.toISOString(),
    amount: toAmount(row.student.ratePerLesson),
  }));
}

// ---------- STATUS PŁATNOŚCI POJEDYNCZEJ LEKCJI ----------

export type LessonPaymentState = "PAID" | "UNPAID" | "OVERDUE" | "NOT_INVOICED";

export type LessonPaymentInfo = {
  state: LessonPaymentState;
  /** Czy lekcja jest pokryta pakietem przedpłaconym. */
  fromPackage: boolean;
  /** Numer rachunku — wyłącznie dla admina; nauczyciel dostaje `null`. */
  invoiceNumber: string | null;
  invoiceId: string | null;
};

/** Statusy, które zużywają jednostkę pakietu (odwołana lekcja nie przepada). */
const PACKAGE_CONSUMING = ["COMPLETED", "NO_SHOW", "SCHEDULED"] as const;

/**
 * Odpowiada na pytanie „za którą lekcję zapłacono?”.
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
    select: {
      id: true,
      studentId: true,
      student: { select: { billingMode: true } },
      invoiceItem: {
        select: {
          invoice: {
            select: {
              id: true,
              number: true,
              status: true,
              dueAt: true,
              totalAmount: true,
              payments: { select: { amount: true } },
            },
          },
        },
      },
    },
  });

  const requested = new Set(lessonIds);
  const prepaidStudentIds = new Set<string>();

  for (const lesson of lessons) {
    if (lesson.student.billingMode === "PREPAID") {
      prepaidStudentIds.add(lesson.studentId);
      continue;
    }

    const invoice = lesson.invoiceItem?.invoice;
    if (!invoice || invoice.status === "CANCELLED") {
      result.set(lesson.id, {
        state: "NOT_INVOICED",
        fromPackage: false,
        invoiceNumber: null,
        invoiceId: null,
      });
      continue;
    }

    const paid = invoice.payments.reduce(
      (sum, payment) => sum + toAmount(payment.amount),
      0
    );
    const balance = round(toAmount(invoice.totalAmount) - paid);
    const state: LessonPaymentState =
      balance <= 0.004 ? "PAID" : invoice.dueAt < now ? "OVERDUE" : "UNPAID";

    result.set(lesson.id, {
      state,
      fromPackage: false,
      invoiceNumber: showInvoiceNumbers ? invoice.number : null,
      invoiceId: showInvoiceNumbers ? invoice.id : null,
    });
  }

  // Pakiety: jednostki przydzielamy chronologicznie — pierwsze lekcje zużywają
  // to, co opłacone, kolejne to, co wystawione, reszta czeka na nowy pakiet.
  for (const studentId of prepaidStudentIds) {
    const invoices = await prisma.invoice.findMany({
      where: { studentId, status: { not: "CANCELLED" } },
      select: {
        number: true,
        id: true,
        dueAt: true,
        totalAmount: true,
        payments: { select: { amount: true } },
        items: { select: { quantity: true, lessonId: true } },
      },
      orderBy: { issuedAt: "asc" },
    });

    type Unit = { paid: boolean; overdue: boolean; number: string; id: string };
    const units: Unit[] = [];
    for (const invoice of invoices) {
      const paid = invoice.payments.reduce(
        (sum, payment) => sum + toAmount(payment.amount),
        0
      );
      const settled = round(toAmount(invoice.totalAmount) - paid) <= 0.004;
      const quantity = invoice.items
        .filter((item) => item.lessonId === null)
        .reduce((sum, item) => sum + item.quantity, 0);
      for (let index = 0; index < quantity; index += 1) {
        units.push({
          paid: settled,
          overdue: !settled && invoice.dueAt < now,
          number: invoice.number,
          id: invoice.id,
        });
      }
    }

    const studentLessons = await prisma.lesson.findMany({
      where: { studentId, status: { in: [...PACKAGE_CONSUMING] } },
      select: { id: true },
      orderBy: { scheduledAt: "asc" },
    });

    studentLessons.forEach((lesson, index) => {
      if (!requested.has(lesson.id)) return; // liczy się pozycja, nie zapis
      const unit = units[index];
      result.set(lesson.id, {
        state: !unit
          ? "NOT_INVOICED"
          : unit.paid
            ? "PAID"
            : unit.overdue
              ? "OVERDUE"
              : "UNPAID",
        fromPackage: Boolean(unit),
        invoiceNumber: unit && showInvoiceNumbers ? unit.number : null,
        invoiceId: unit && showInvoiceNumbers ? unit.id : null,
      });
    });
  }

  // Lekcje odwołane (i inne niezużywające pakietu) nie mają przypisanej jednostki.
  for (const lesson of lessons) {
    if (result.has(lesson.id)) continue;
    result.set(lesson.id, {
      state: "NOT_INVOICED",
      fromPackage: false,
      invoiceNumber: null,
      invoiceId: null,
    });
  }

  return result;
}
