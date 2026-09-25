/**
 * Zakłada konto administratora (z .env) i — opcjonalnie — dane demonstracyjne.
 *
 *   npm run db:seed              # tylko admin
 *   SEED_DEMO=true npm run db:seed   # admin + przykładowi nauczyciele/uczniowie/lekcje
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { toWallClockInput, wallClockToUtc } from "../src/lib/datetime";
import {
  createLessonInvoice,
  createMonthlyInvoice,
  createPackageInvoice,
  listUnbilledLessons,
  recordPayment,
  updateBillingSettings,
} from "../src/lib/services/billing";
import { createNdgLimit, updateNdgSettings } from "../src/lib/services/ndg";
import { sendMessage } from "../src/lib/services/messages";
import type { AdminActor } from "../src/lib/auth";

const prisma = new PrismaClient();

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? "admin@korkigo.pl").toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin12345";

function money(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

/** Najbliższy podany dzień tygodnia o podanej godzinie czasu warszawskiego. */
function nextWeekday(dayOfWeek: number, hour: number, weeksAhead = 0): Date {
  const today = toWallClockInput(new Date()).slice(0, 10);
  const [year, month, day] = today.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  const delta = (dayOfWeek - base.getUTCDay() + 7) % 7;
  base.setUTCDate(base.getUTCDate() + delta + weeksAhead * 7);

  const pad = (value: number) => String(value).padStart(2, "0");
  return wallClockToUtc(
    `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(
      base.getUTCDate()
    )}T${pad(hour)}:00`
  );
}

async function seedAdmin(): Promise<AdminActor> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "ADMIN" },
    create: { email: ADMIN_EMAIL, passwordHash, role: "ADMIN" },
  });
  console.log(`✔ Administrator: ${admin.email}`);
  return {
    userId: admin.id,
    email: admin.email,
    role: "ADMIN",
    teacherProfileId: null,
  };
}

async function seedDemo() {
  const passwordHash = await bcrypt.hash("nauczyciel123", 12);

  const teachers = [
    {
      email: "anna.kowalska@korkigo.pl",
      firstName: "Anna",
      lastName: "Kowalska",
      level: "C1, glottodydaktyka",
      rate: 60,
    },
    {
      email: "piotr.nowak@korkigo.pl",
      firstName: "Piotr",
      lastName: "Nowak",
      level: "C2",
      rate: 55,
    },
  ];

  for (const [index, teacher] of teachers.entries()) {
    const existing = await prisma.user.findUnique({
      where: { email: teacher.email },
      select: { id: true },
    });
    if (existing) {
      console.log(`• Pomijam ${teacher.email} — już istnieje.`);
      continue;
    }

    const profile = await prisma.teacherProfile.create({
      data: {
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        phone: "+48 600 000 00" + index,
        level: teacher.level,
        ratePerLesson: money(teacher.rate),
        user: {
          create: { email: teacher.email, passwordHash, role: "TEACHER" },
        },
        availabilities: {
          create: [
            { dayOfWeek: 1, startTime: "16:00", endTime: "20:00" },
            { dayOfWeek: 3, startTime: "16:00", endTime: "20:00" },
          ],
        },
      },
    });

    const students = [
      {
        firstName: index === 0 ? "Olena" : "Dzmitry",
        lastName: index === 0 ? "Tkachenko" : "Kavalenka",
        languageLevel: "A2",
        subject: "Polski ogólny",
        rate: 90,
        billingMode: "POSTPAID" as const,
      },
      {
        firstName: index === 0 ? "Sofia" : "Alesia",
        lastName: index === 0 ? "Bondarenko" : "Marozava",
        languageLevel: "B1",
        subject: "Polski maturalny",
        rate: 100,
        billingMode: index === 0 ? ("PREPAID" as const) : ("PER_LESSON" as const),
      },
    ];

    for (const [studentIndex, student] of students.entries()) {
      const created = await prisma.student.create({
        data: {
          firstName: student.firstName,
          lastName: student.lastName,
          contactEmail: `${student.firstName.toLowerCase()}@example.com`,
          contactPhone: "+48 700 100 20" + studentIndex,
          languageLevel: student.languageLevel,
          subject: student.subject,
          ratePerLesson: money(student.rate),
          billingMode: student.billingMode,
          teacherId: profile.id,
        },
      });

      // Cztery lekcje tygodniowo wstecz (zrealizowane) i cztery do przodu.
      const seriesId = crypto.randomUUID();
      const dayOfWeek = studentIndex === 0 ? 1 : 3;
      const hour = studentIndex === 0 ? 16 : 18;

      for (let week = -4; week < 4; week += 1) {
        const scheduledAt = nextWeekday(dayOfWeek, hour, week);
        await prisma.lesson.create({
          data: {
            studentId: created.id,
            teacherId: profile.id,
            scheduledAt,
            durationMinutes: 60,
            type: "RECURRING",
            seriesId,
            status:
              scheduledAt < new Date()
                ? week === -2
                  ? "CANCELLED"
                  : "COMPLETED"
                : "SCHEDULED",
          },
        });
      }
    }

    console.log(`✔ Nauczyciel demo: ${teacher.email} (hasło: nauczyciel123)`);
  }
}

/** Rachunki i wpłaty liczone przez tę samą logikę, której używa aplikacja. */
async function seedBilling(admin: AdminActor) {
  await updateBillingSettings(admin, {
    sellerName: "Mateusz Kowalczyk",
    sellerAddress: "ul. Przykładowa 12/3, 00-001 Warszawa",
    sellerContact: "kontakt@korkigo.pl, +48 600 000 000",
    bankAccount: "PL61 1090 1014 0000 0712 1981 2874",
    sellerTaxNote: "Sprzedaż nieewidencjonowana — działalność nierejestrowana.",
    paymentTermDays: 7,
    invoiceFooter: "Dziękujemy za terminową płatność.",
  });

  const previousMonth = shiftMonthKey(toWallClockInput(new Date()).slice(0, 7), -1);

  const students = await prisma.student.findMany({
    select: { id: true, firstName: true, billingMode: true },
    orderBy: { firstName: "asc" },
  });

  for (const student of students) {
    try {
      if (student.billingMode === "PREPAID") {
        const invoice = await createPackageInvoice(admin, {
          studentId: student.id,
          quantity: 10,
          issuedAt: `${previousMonth}-05`,
        });
        await recordPayment(admin, {
          studentId: student.id,
          invoiceId: invoice.id,
          amount: invoice.totalAmount.toFixed(2),
          paidAt: `${previousMonth}-06`,
        });
        console.log(`✔ Pakiet ${invoice.number} dla ${student.firstName} (opłacony)`);
        continue;
      }

      if (student.billingMode === "PER_LESSON") {
        const unbilled = await listUnbilledLessons(admin, student.id);
        const past = unbilled.filter(
          (lesson) => new Date(lesson.scheduledAt) < new Date()
        );
        for (const lesson of past.slice(0, 2)) {
          const perLesson = await createLessonInvoice(admin, {
            lessonId: lesson.lessonId,
            issuedAt: toWallClockInput(new Date(lesson.scheduledAt)).slice(0, 10),
            dueDays: 7,
          });
          console.log(
            `✔ Rachunek ${perLesson.number} dla ${student.firstName} (za lekcję)`
          );
        }
        continue;
      }

      const invoice = await createMonthlyInvoice(admin, {
        studentId: student.id,
        month: previousMonth,
        issuedAt: `${previousMonth}-28`,
        dueDays: 7,
      });

      // Jeden uczeń zostaje z zaległością, żeby było widać alert w panelu.
      if (student.firstName === "Olena") {
        console.log(`✔ Rachunek ${invoice.number} dla ${student.firstName} (nieopłacony)`);
        continue;
      }

      await recordPayment(admin, {
        studentId: student.id,
        invoiceId: invoice.id,
        amount: invoice.totalAmount.toFixed(2),
        paidAt: `${previousMonth}-29`,
      });
      console.log(`✔ Rachunek ${invoice.number} dla ${student.firstName} (opłacony)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`• ${student.firstName}: pomijam rachunek — ${message}`);
    }
  }
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Demo modułu NDG. Kwota limitu jest PRZYKŁADOWA — w prawdziwym wdrożeniu
 * wpisuje ją administrator po potwierdzeniu z księgowym.
 */
async function seedNdg(admin: AdminActor) {
  await updateNdgSettings(admin, {
    enabled: true,
    mode: "QUARTERLY",
    revenueBasis: "INVOICED",
    warnThresholdPercent: 90,
    note: "Dane demonstracyjne — kwotę limitu potwierdź z księgowym.",
  });

  const year = toWallClockInput(new Date()).slice(0, 4);
  try {
    const limit = await createNdgLimit(admin, {
      validFrom: `${year}-01`,
      amount: "500",
      note: "wartość przykładowa — do potwierdzenia z księgowym",
    });
    console.log(
      `✔ Limit NDG (przykładowy): ${limit.amount.toFixed(2)} zł/mies. od ${limit.validFromMonth}`
    );
  } catch {
    console.log("• Limit NDG już istnieje — pomijam.");
  }
}

/** Dwie wiadomości demo: zbiorcza i pojedyncza — widać czerwoną kropkę. */
async function seedMessages(admin: AdminActor) {
  const teachers = await prisma.teacherProfile.findMany({
    select: { id: true, firstName: true },
    orderBy: { firstName: "asc" },
  });
  if (teachers.length === 0) return;

  await sendMessage(admin, {
    subject: "Rozliczenie miesiąca",
    body:
      "Przypominam o odznaczeniu statusów lekcji do końca tygodnia — " +
      "na tej podstawie wystawiam rachunki i liczę wypłaty.",
    recipient: "ALL",
  });
  await sendMessage(admin, {
    subject: "Nowy uczeń",
    body: `${teachers[0].firstName}, w przyszłym tygodniu dopiszę Ci nowego ucznia. Sprawdź, proszę, swoją dyspozycyjność w zakładce „Grafik i dyspozycja”.`,
    recipient: teachers[0].id,
  });
  console.log("✔ Wiadomości demo: 1 zbiorcza + 1 pojedyncza");
}

async function main() {
  const admin = await seedAdmin();
  if (process.env.SEED_DEMO === "true" || process.argv.includes("--demo")) {
    await seedDemo();
    await seedBilling(admin);
    await seedNdg(admin);
    await seedMessages(admin);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
