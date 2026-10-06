import { describe } from "vitest";
import {
  Prisma,
  PrismaClient,
  type BillingMode,
  type LessonStatus,
} from "@prisma/client";
import type { AdminActor, TeacherActor } from "@/lib/auth";

export const prisma = new PrismaClient();

/**
 * Konta testowe dostają atrapę hasła (`"x"`), bo prawdziwy bcrypt kosztem 12
 * przy każdym tworzeniu konta zjadałby sekundy w całym zestawie. Testy, które
 * naprawdę weryfikują hasło, wołają `givePassword()`.
 */
export const TEST_PASSWORD = "testoweHaslo123";

export async function givePassword(
  userId: string,
  plain = TEST_PASSWORD
): Promise<void> {
  const { hashPassword } = await import("@/lib/password");
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(plain) },
  });
}

/** Bez bazy testy integracyjne są pomijane zamiast wysypywać cały przebieg. */
export const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Domyślny przedmiot/poziom zakładany przy każdym czyszczeniu bazy. Testy,
 * które nie sprawdzają samych przedmiotów, mogą go używać niejawnie.
 */
let defaultLevelId = "";

export function getDefaultLevelId(): string {
  if (!defaultLevelId) {
    throw new Error("Najpierw wywołaj resetDatabase().");
  }
  return defaultLevelId;
}

/**
 * Nazwa tabeli-znacznika. Jej **obecność** jest zgodą na kasowanie zawartości
 * tej bazy. Tworzy ją wyłącznie `npm run db:test:init`, nigdy sam przebieg
 * testów — gdyby powstawała automatycznie, znacznik nie chroniłby przed niczym.
 */
const MARKER_TABLE = "_korkigo_test_database";

let markerChecked = false;

/**
 * Twarda odmowa dla niezatwierdzonego celu, PRZED pierwszym kasującym SQL-em.
 *
 * Wcześniej wystarczyła dowolna niepusta `DATABASE_URL`: operator, który
 * uruchomił `npm test` w powłoce z produkcyjną zmienną, kasował firmie dane
 * (audyt zewnętrzny, F12). Sama nazwa zawierająca „test" to za słaba jedyna
 * ochrona — dlatego decyduje znacznik, który trzeba założyć świadomie.
 */
async function assertTestDatabase(): Promise<void> {
  if (markerChecked) return;

  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT to_regclass('public."${MARKER_TABLE}"') IS NOT NULL AS "exists"`
  );
  if (!rows[0]?.exists) {
    const [{ db }] = await prisma.$queryRawUnsafe<Array<{ db: string }>>(
      "SELECT current_database() AS db"
    );
    throw new Error(
      `Baza „${db}" nie jest oznaczona jako testowa, a testy kasują całą jej ` +
        `zawartość. Jeśli to NA PEWNO baza testowa, wykonaj raz:\n\n` +
        `  npm run db:test:init\n\n` +
        `Jeśli nie — sprawdź DATABASE_URL, bo wskazuje gdzie indziej.`
    );
  }
  markerChecked = true;
}

export async function resetDatabase(): Promise<void> {
  await assertTestDatabase();
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "message_recipients", "messages",
     "ndg_monthly_limits", "ndg_settings",
     "payments", "invoice_items", "invoices", "billing_settings",
     "speaking_club_uses", "lesson_notes", "knowledge_base_entries",
     "reminder_logs", "security_events", "two_factor_recovery_codes",
     "google_calendar_deletions", "google_calendar_links",
     "lessons", "payouts", "telegram_link_tokens",
     "student_rates", "teacher_rates", "subject_levels", "subjects",
     "availability_slots", "students", "teacher_profiles", "users"
     RESTART IDENTITY CASCADE`
  );

  const subject = await prisma.subject.create({ data: { name: "Polski" } });
  const level = await prisma.subjectLevel.create({
    data: { subjectId: subject.id, name: "Ogólny" },
  });
  defaultLevelId = level.id;
}

/** Dodatkowy poziom — do testów stawek różnych dla różnych przedmiotów. */
export async function createLevel(
  subjectName: string,
  levelName: string
): Promise<string> {
  const subject = await prisma.subject.upsert({
    where: { name: subjectName },
    update: {},
    create: { name: subjectName },
  });
  const level = await prisma.subjectLevel.create({
    data: { subjectId: subject.id, name: levelName },
  });
  return level.id;
}

export async function createAdmin(email = "admin@test.pl"): Promise<AdminActor> {
  const user = await prisma.user.create({
    data: { email, passwordHash: "x", role: "ADMIN" },
  });
  return {
    userId: user.id,
    email: user.email,
    role: "ADMIN",
    teacherProfileId: null,
  };
}

/** Nauczyciel ze stawką na domyślnym poziomie (albo na wskazanym). */
export async function createTeacher(
  email: string,
  rate = 60,
  firstName = "Nauczyciel",
  subjectLevelId = defaultLevelId
): Promise<TeacherActor> {
  const profile = await prisma.teacherProfile.create({
    data: {
      firstName,
      lastName: "Testowy",
      user: { create: { email, passwordHash: "x", role: "TEACHER" } },
      rates: {
        create: [
          { subjectLevelId, amount: new Prisma.Decimal(rate.toFixed(2)) },
        ],
      },
    },
  });
  return {
    userId: profile.userId,
    email,
    role: "TEACHER",
    teacherProfileId: profile.id,
  };
}

/** Uczeń z ceną na domyślnym poziomie; `rate = 0` oznacza brak ceny. */
export async function createStudent(
  teacherId: string | null,
  rate = 100,
  firstName = "Uczeń",
  billingMode: BillingMode = "POSTPAID",
  subjectLevelId = defaultLevelId
): Promise<string> {
  const student = await prisma.student.create({
    data: {
      firstName,
      lastName: "Testowy",
      teacherId,
      billingMode,
      ...(rate > 0
        ? {
            rates: {
              create: [
                { subjectLevelId, amount: new Prisma.Decimal(rate.toFixed(2)) },
              ],
            },
          }
        : {}),
    },
  });
  return student.id;
}

export async function setTeacherRate(
  teacherId: string,
  subjectLevelId: string,
  amount: number
): Promise<void> {
  await prisma.teacherRate.upsert({
    where: { teacherId_subjectLevelId: { teacherId, subjectLevelId } },
    update: { amount: new Prisma.Decimal(amount.toFixed(2)) },
    create: {
      teacherId,
      subjectLevelId,
      amount: new Prisma.Decimal(amount.toFixed(2)),
    },
  });
}

export async function setStudentRate(
  studentId: string,
  subjectLevelId: string,
  amount: number
): Promise<void> {
  await prisma.studentRate.upsert({
    where: { studentId_subjectLevelId: { studentId, subjectLevelId } },
    update: { amount: new Prisma.Decimal(amount.toFixed(2)) },
    create: {
      studentId,
      subjectLevelId,
      amount: new Prisma.Decimal(amount.toFixed(2)),
    },
  });
}

export async function createLesson(options: {
  studentId: string;
  teacherId: string;
  scheduledAt: Date;
  status?: LessonStatus;
  subjectLevelId?: string;
  /**
   * `true` zostawia `studentPrice` i `teacherRate` puste — tak wyglądają
   * lekcje zapisane przed wprowadzeniem snapshotu stawek. Do testowania
   * ścieżki awaryjnej, która wraca wtedy do cennika bieżącego.
   */
  bezSnapshotuStawek?: boolean;
}): Promise<string> {
  const subjectLevelId = options.subjectLevelId ?? defaultLevelId;

  /**
   * Helper zapisuje lekcję wprost w bazie, z pominięciem `createLessons()`,
   * więc musi sam utrwalić stawki — inaczej testy omijałyby dokładnie ten
   * mechanizm, który mają sprawdzać (F07).
   */
  const [teacherRate, studentRate] = await Promise.all([
    prisma.teacherRate.findUnique({
      where: { teacherId_subjectLevelId: { teacherId: options.teacherId, subjectLevelId } },
      select: { amount: true },
    }),
    prisma.studentRate.findUnique({
      where: { studentId_subjectLevelId: { studentId: options.studentId, subjectLevelId } },
      select: { amount: true },
    }),
  ]);

  const lesson = await prisma.lesson.create({
    data: {
      studentId: options.studentId,
      teacherId: options.teacherId,
      subjectLevelId,
      scheduledAt: options.scheduledAt,
      durationMinutes: 60,
      type: "ONE_OFF",
      status: options.status ?? "SCHEDULED",
      studentPrice: options.bezSnapshotuStawek ? null : studentRate?.amount ?? null,
      teacherRate: options.bezSnapshotuStawek ? null : teacherRate?.amount ?? null,
    },
  });
  return lesson.id;
}
