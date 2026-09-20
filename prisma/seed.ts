/**
 * Zakłada konto administratora (z .env) i — opcjonalnie — dane demonstracyjne.
 *
 *   npm run db:seed              # tylko admin
 *   SEED_DEMO=true npm run db:seed   # admin + przykładowi nauczyciele/uczniowie/lekcje
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { toWallClockInput, wallClockToUtc } from "../src/lib/datetime";

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

async function seedAdmin() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "ADMIN" },
    create: { email: ADMIN_EMAIL, passwordHash, role: "ADMIN" },
  });
  console.log(`✔ Administrator: ${admin.email}`);
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
      },
      {
        firstName: index === 0 ? "Sofia" : "Alesia",
        lastName: index === 0 ? "Bondarenko" : "Marozava",
        languageLevel: "B1",
        subject: "Polski maturalny",
        rate: 100,
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

async function main() {
  await seedAdmin();
  if (process.env.SEED_DEMO === "true" || process.argv.includes("--demo")) {
    await seedDemo();
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
