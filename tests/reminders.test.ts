/**
 * Przypomnienia o lekcji.
 *
 * Wysyłkę odcinamy od sieci: kanał SMS z `SMS_PROVIDER=log` tylko loguje
 * treść, a Telegram bez tokena zwraca błąd — dzięki temu sprawdzamy obie
 * ścieżki, także tę nieudaną, która MUSI zostawić wpis w `ReminderLog`.
 */
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  connectTelegramByToken,
  createTelegramLink,
  disconnectTelegram,
  getReminderUsage,
  runReminderBatch,
} from "@/lib/services/reminders";
import { buildReminderMessage } from "@/lib/reminders/template";
import {
  createAdmin,
  createLesson,
  createStudent,
  createTeacher,
  describeDb,
  prisma,
  resetDatabase,
} from "./helpers/db";

// „Teraz” i lekcja dokładnie dobę później — środek okna wysyłki.
const NOW = new Date("2026-09-20T14:00:00Z");
const LESSON_AT = new Date("2026-09-21T14:00:00Z");

describeDb("przypomnienia o lekcji", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let piotr: Awaited<ReturnType<typeof createTeacher>>;
  let studentId: string;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    piotr = await createTeacher("piotr@test.pl", 55, "Piotr");
    studentId = await createStudent(anna.teacherProfileId, 100, "Olena");
    process.env.SMS_PROVIDER = "log";
    process.env.TELEGRAM_BOT_NAME = "korkigo_test_bot";
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  async function scheduleLesson(at = LESSON_AT): Promise<string> {
    return createLesson({
      studentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: at,
    });
  }

  async function setChannel(
    reminderChannel: "NONE" | "TELEGRAM" | "SMS",
    extra: { contactPhone?: string; telegramChatId?: string } = {}
  ): Promise<void> {
    await prisma.student.update({
      where: { id: studentId },
      data: { reminderChannel, ...extra },
    });
  }

  it("uczeń bez wybranego kanału nie dostaje nic i nie zostawia śladu", async () => {
    await scheduleLesson();
    const result = await runReminderBatch(NOW);

    expect(result.considered).toBe(1);
    expect(result.skipped).toBe(1);
    expect(await prisma.reminderLog.count()).toBe(0);
  });

  it("SMS idzie do ucznia z numerem telefonu", async () => {
    const lessonId = await scheduleLesson();
    await setChannel("SMS", { contactPhone: "+48600100200" });
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await runReminderBatch(NOW);
    log.mockRestore();

    expect(result.sent).toBe(1);
    const entry = await prisma.reminderLog.findUnique({ where: { lessonId } });
    expect(entry?.status).toBe("SENT");
    expect(entry?.channel).toBe("SMS");
  });

  it("nieudana wysyłka też zostawia wpis, żeby cron jej nie powtarzał", async () => {
    const lessonId = await scheduleLesson();
    // Telegram wybrany, ale uczeń go nie połączył i brak tokena bota.
    await setChannel("TELEGRAM");

    const result = await runReminderBatch(NOW);
    expect(result.failed).toBe(1);

    const entry = await prisma.reminderLog.findUnique({ where: { lessonId } });
    expect(entry?.status).toBe("FAILED");
    expect(entry?.error).toBeTruthy();

    // Drugie przejście nie bierze tej lekcji pod uwagę.
    expect((await runReminderBatch(NOW)).considered).toBe(0);
  });

  it("SMS bez numeru telefonu kończy się błędem, nie wyjątkiem", async () => {
    await scheduleLesson();
    await setChannel("SMS");

    const result = await runReminderBatch(NOW);
    expect(result.failed).toBe(1);
    expect(result.details[0].error).toContain("numeru telefonu");
  });

  it("lekcje poza oknem 23–25 h są pomijane", async () => {
    await setChannel("SMS", { contactPhone: "+48600100200" });
    // Za 3 dni i za 2 godziny — obie poza oknem.
    await scheduleLesson(new Date("2026-09-23T14:00:00Z"));
    await scheduleLesson(new Date("2026-09-20T16:00:00Z"));

    expect((await runReminderBatch(NOW)).considered).toBe(0);
  });

  it("odwołana lekcja nie dostaje przypomnienia", async () => {
    const lessonId = await scheduleLesson();
    await setChannel("SMS", { contactPhone: "+48600100200" });
    await prisma.lesson.update({
      where: { id: lessonId },
      data: { status: "CANCELLED" },
    });

    expect((await runReminderBatch(NOW)).considered).toBe(0);
  });

  it("treść zawiera link do pokoju, jeśli uczeń go ma", () => {
    const vars = {
      firstName: "Olena",
      subjectLabel: "Polski · Ogólny",
      time: "16:00",
      date: "21.09.2026",
      meetingLink: "https://meet.example/abc",
    };
    expect(buildReminderMessage(vars)).toContain("https://meet.example/abc");
    expect(buildReminderMessage({ ...vars, meetingLink: null })).not.toContain(
      "Link:"
    );
  });

  // ---------- POŁĄCZENIE TELEGRAMA ----------

  it("token z linku jest jednorazowy", async () => {
    const link = await createTelegramLink(admin, studentId);
    await connectTelegramByToken(link.token, "123456");

    const student = await prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { telegramChatId: true },
    });
    expect(student.telegramChatId).toBe("123456");

    await expect(
      connectTelegramByToken(link.token, "999999")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("wygasły token nie połączy konta", async () => {
    const link = await createTelegramLink(admin, studentId);
    await expect(
      connectTelegramByToken(
        link.token,
        "123456",
        new Date(Date.parse(link.expiresAt) + 1000)
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("nieznany token daje 404", async () => {
    await expect(
      connectTelegramByToken("nie-ma-takiego", "1")
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("nauczyciel generuje link tylko swojemu uczniowi", async () => {
    const obcy = await createStudent(piotr.teacherProfileId, 100, "Dzmitry");
    await expect(createTelegramLink(anna, obcy)).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(createTelegramLink(anna, studentId)).resolves.toMatchObject({
      url: expect.stringContaining("korkigo_test_bot"),
    });
  });

  it("rozłączenie Telegrama zostaje przy adminie", async () => {
    const link = await createTelegramLink(admin, studentId);
    await connectTelegramByToken(link.token, "123456");

    await expect(disconnectTelegram(anna, studentId)).rejects.toBeInstanceOf(
      ForbiddenError
    );

    await disconnectTelegram(admin, studentId);
    const student = await prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { telegramChatId: true },
    });
    expect(student.telegramChatId).toBeNull();
  });

  // ---------- LICZNIK ----------

  it("licznik wysyłek jest tylko dla admina i rozbija kanały", async () => {
    const lessonId = await scheduleLesson();
    await setChannel("SMS", { contactPhone: "+48600100200" });
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await runReminderBatch(NOW);
    log.mockRestore();
    expect(lessonId).toBeTruthy();

    const usage = await getReminderUsage(admin, "2026-09");
    expect(usage.sms).toBe(1);
    expect(usage.telegram).toBe(0);
    expect(usage.failed).toBe(0);

    await expect(getReminderUsage(anna, "2026-09")).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
