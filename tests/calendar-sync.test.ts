/**
 * Synchronizacja z Google Calendar — jednokierunkowo, per nauczyciel.
 *
 * Sieci nie ruszamy: `GOOGLE_CALENDAR_PROVIDER=log` zapamiętuje wywołania
 * w pamięci, więc sprawdzamy dokładnie to, co poszłoby do Google.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  buildEvent,
  disconnectCalendar,
  getCalendarLink,
  setCalendarEnabled,
  syncCalendars,
} from "@/lib/services/calendar-sync";
import {
  recordedCalendarCalls,
  resetRecordedCalendarCalls,
} from "@/lib/google/calendar";
import {
  cancelLesson,
  deleteLesson,
  setLessonStatus,
  setLessonTopic,
  updateLesson,
} from "@/lib/services/lessons";
import {
  createAdmin,
  createLesson,
  createStudent,
  createTeacher,
  describeDb,
  prisma,
  resetDatabase,
} from "./helpers/db";

const AT = new Date("2026-09-21T14:00:00Z");

describe("treść zdarzenia", () => {
  it("nie zawiera żadnej kwoty — kalendarz jest poza naszą kontrolą", () => {
    const event = buildEvent({
      id: "l1",
      scheduledAt: AT,
      durationMinutes: 60,
      status: "SCHEDULED",
      topic: "Czas przeszły",
      googleEventId: null,
      student: {
        firstName: "Olena",
        lastName: "Tkachenko",
        meetingLink: "https://meet.example/abc",
      },
      subjectLevel: { name: "Ogólny", subject: { name: "Polski" } },
    });

    const payload = JSON.stringify(event);
    // Wzorzec kwoty, nie samo „zł" — bo to wpada np. w słowo „przeszły".
    expect(payload).not.toMatch(/\d+[.,]\d{2}/);
    expect(payload).not.toMatch(/\d\s*zł/);
    expect(payload).not.toMatch(/\bcena|stawka|kwota\b/i);
    // ...ale to, co nauczyciel potrzebuje, jest.
    expect(event.summary).toBe("Polski · Ogólny — Olena Tkachenko");
    expect(event.description).toContain("Czas przeszły");
    expect(event.description).toContain("https://meet.example/abc");
    expect(event.timeZone).toBe("Europe/Warsaw");
  });

  it("podaje czas ścienny, żeby przeżył zmianę czasu", () => {
    const zimowy = buildEvent({
      id: "l2",
      scheduledAt: new Date("2026-11-16T15:00:00Z"), // 16:00 czasu zimowego
      durationMinutes: 90,
      status: "SCHEDULED",
      topic: null,
      googleEventId: null,
      student: { firstName: "Olena", lastName: "T", meetingLink: null },
      subjectLevel: { name: "Ogólny", subject: { name: "Polski" } },
    });
    expect(zimowy.start).toBe("2026-11-16T16:00");
    expect(zimowy.end).toBe("2026-11-16T17:30");
  });
});

describeDb("synchronizacja kalendarza", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let piotr: Awaited<ReturnType<typeof createTeacher>>;
  let annaStudentId: string;
  let piotrStudentId: string;

  beforeEach(async () => {
    await resetDatabase();
    resetRecordedCalendarCalls();
    process.env.GOOGLE_CALENDAR_PROVIDER = "log";
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    piotr = await createTeacher("piotr@test.pl", 55, "Piotr");
    annaStudentId = await createStudent(anna.teacherProfileId, 100, "Olena");
    piotrStudentId = await createStudent(piotr.teacherProfileId, 150, "Dzmitry");
  });

  /** Połączenie zakładamy wprost — OAuth-a nie da się przejść w teście. */
  async function connect(
    teacherId: string,
    calendarId = "primary",
    enabled = true
  ): Promise<void> {
    await prisma.googleCalendarLink.create({
      data: {
        teacherId,
        googleEmail: `${teacherId}@gmail.com`,
        calendarId,
        refreshToken: "refresh-token",
        accessToken: "access-token",
        // Ważny token = brak odświeżania, więc test nie potrzebuje kluczy Google.
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        enabled,
      },
    });
  }

  it("nowa lekcja trafia do kalendarza i nie jest wysyłana dwa razy", async () => {
    await connect(anna.teacherProfileId);
    const id = await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: AT,
    });

    const first = await syncCalendars();
    expect(first.created).toBe(1);
    expect(recordedCalendarCalls()).toHaveLength(1);

    const lesson = await prisma.lesson.findUniqueOrThrow({
      where: { id },
      select: { googleEventId: true, googleSyncedAt: true },
    });
    expect(lesson.googleEventId).toBeTruthy();
    expect(lesson.googleSyncedAt).not.toBeNull();

    // Drugie przejście nie ma nic do roboty.
    const second = await syncCalendars();
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(recordedCalendarCalls()).toHaveLength(1);
  });

  it("zmiana terminu aktualizuje istniejące zdarzenie", async () => {
    await connect(anna.teacherProfileId);
    const id = await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: AT,
    });
    await syncCalendars();

    await updateLesson(admin, id, { scheduledAt: "2026-09-21T18:00" });
    const result = await syncCalendars();

    expect(result.updated).toBe(1);
    const last = recordedCalendarCalls().at(-1)!;
    expect(last.action).toBe("patch");
    if (last.action === "patch") expect(last.event.start).toBe("2026-09-21T18:00");
  });

  it("dopisany temat też dociera do kalendarza", async () => {
    await connect(anna.teacherProfileId);
    const id = await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: AT,
    });
    await syncCalendars();

    await setLessonTopic(anna, id, { topic: "Tryb przypuszczający" });
    await syncCalendars();

    const last = recordedCalendarCalls().at(-1)!;
    expect(last.action).toBe("patch");
    if (last.action === "patch") {
      expect(last.event.description).toContain("Tryb przypuszczający");
    }
  });

  it("odwołana lekcja znika z kalendarza", async () => {
    await connect(anna.teacherProfileId);
    const id = await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: AT,
    });
    await syncCalendars();

    await cancelLesson(admin, id, {}, new Date(AT.getTime() - 48 * 3600e3));
    const result = await syncCalendars();

    expect(result.deleted).toBe(1);
    expect(recordedCalendarCalls().at(-1)!.action).toBe("delete");
    const lesson = await prisma.lesson.findUniqueOrThrow({
      where: { id },
      select: { googleEventId: true },
    });
    expect(lesson.googleEventId).toBeNull();
  });

  it("zrealizowana lekcja zostaje w kalendarzu", async () => {
    await connect(anna.teacherProfileId);
    const id = await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: AT,
    });
    await syncCalendars();

    await setLessonStatus(admin, id, "COMPLETED");
    const result = await syncCalendars();
    expect(result.updated).toBe(1);
    expect(result.deleted).toBe(0);
  });

  it("usunięcie lekcji sprząta zdarzenie przez nagrobek", async () => {
    await connect(anna.teacherProfileId);
    const id = await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: AT,
    });
    await syncCalendars();
    const eventId = (
      await prisma.lesson.findUniqueOrThrow({
        where: { id },
        select: { googleEventId: true },
      })
    ).googleEventId;

    await deleteLesson(admin, id);
    expect(await prisma.googleCalendarDeletion.count()).toBe(1);

    const result = await syncCalendars();
    expect(result.deleted).toBe(1);
    const last = recordedCalendarCalls().at(-1)!;
    expect(last.action).toBe("delete");
    if (last.action === "delete") expect(last.eventId).toBe(eventId);
    // Nagrobek zniknął — nie próbujemy w kółko.
    expect(await prisma.googleCalendarDeletion.count()).toBe(0);
  });

  // ---------- IZOLACJA ----------

  it("lekcje jednego nauczyciela nie trafiają do kalendarza drugiego", async () => {
    await connect(anna.teacherProfileId, "kalendarz-anny");
    await connect(piotr.teacherProfileId, "kalendarz-piotra");

    await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: AT,
    });
    await createLesson({
      studentId: piotrStudentId,
      teacherId: piotr.teacherProfileId,
      scheduledAt: AT,
    });

    await syncCalendars();

    const calls = recordedCalendarCalls();
    expect(calls).toHaveLength(2);
    const annaCall = calls.find((c) => c.calendarId === "kalendarz-anny")!;
    const piotrCall = calls.find((c) => c.calendarId === "kalendarz-piotra")!;
    if (annaCall.action === "insert") {
      expect(annaCall.event.summary).toContain("Olena");
      expect(annaCall.event.summary).not.toContain("Dzmitry");
    }
    if (piotrCall.action === "insert") {
      expect(piotrCall.event.summary).toContain("Dzmitry");
      expect(piotrCall.event.summary).not.toContain("Olena");
    }
  });

  it("nauczyciel nie zajrzy ani nie ruszy cudzego połączenia", async () => {
    await connect(piotr.teacherProfileId);
    await expect(
      getCalendarLink(anna, piotr.teacherProfileId)
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      setCalendarEnabled(anna, false, piotr.teacherProfileId)
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      disconnectCalendar(anna, piotr.teacherProfileId)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("wstrzymany kalendarz nic nie wysyła", async () => {
    await connect(anna.teacherProfileId, "primary", false);
    await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: AT,
    });

    const result = await syncCalendars();
    expect(result.teachers).toBe(0);
    expect(recordedCalendarCalls()).toHaveLength(0);
  });

  it("wznowienie wraca do wysyłania", async () => {
    await connect(anna.teacherProfileId, "primary", false);
    await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: AT,
    });
    await setCalendarEnabled(anna, true);

    expect((await syncCalendars()).created).toBe(1);
  });

  it("rozłączenie zostawia nagrobki i czyści identyfikatory", async () => {
    await connect(anna.teacherProfileId);
    await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: AT,
    });
    await syncCalendars();

    await disconnectCalendar(anna);

    expect(await prisma.googleCalendarLink.count()).toBe(0);
    expect(await prisma.googleCalendarDeletion.count()).toBe(1);
    const lesson = await prisma.lesson.findFirstOrThrow({
      select: { googleEventId: true, googleSyncedAt: true },
    });
    expect(lesson.googleEventId).toBeNull();
    expect(lesson.googleSyncedAt).toBeNull();
  });

  it("stan połączenia nie zawiera tokenów", async () => {
    await connect(anna.teacherProfileId);
    const link = await getCalendarLink(anna);
    const payload = JSON.stringify(link);
    expect(payload).not.toContain("refresh-token");
    expect(payload).not.toContain("access-token");
    expect(link?.googleEmail).toContain("@gmail.com");
  });

  it("liczy lekcje czekające na wysłanie", async () => {
    await connect(anna.teacherProfileId);
    await createLesson({
      studentId: annaStudentId,
      teacherId: anna.teacherProfileId,
      scheduledAt: AT,
    });
    expect((await getCalendarLink(anna))?.pending).toBe(1);
    await syncCalendars();
    expect((await getCalendarLink(anna))?.pending).toBe(0);
  });

  it("bez połączenia stan jest pusty, nie błędny", async () => {
    expect(await getCalendarLink(anna)).toBeNull();
    await expect(setCalendarEnabled(anna, true)).rejects.toBeInstanceOf(NotFoundError);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
