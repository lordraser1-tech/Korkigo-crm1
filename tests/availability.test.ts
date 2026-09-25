/**
 * Dyspozycyjność per konkretny dzień oraz kopiowanie układu tygodnia.
 *
 * Dni trzymamy jako północ czasu warszawskiego, więc testy celowo obejmują
 * zmianę czasu — układ tygodnia ma przeżyć przejście na czas zimowy.
 */
import { afterAll, beforeEach, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import {
  clearAvailabilityDay,
  copyAvailabilityToMonth,
  copyAvailabilityWeek,
  createAvailability,
  deleteAvailability,
  listAvailability,
} from "@/lib/services/teachers";
import {
  createAdmin,
  createTeacher,
  describeDb,
  prisma,
  resetDatabase,
} from "./helpers/db";

// Poniedziałek 21 i 28 września 2026.
const WEEK_1 = "2026-09-21";
const WEEK_2 = "2026-09-28";

describeDb("dyspozycyjność nauczyciela", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let piotr: Awaited<ReturnType<typeof createTeacher>>;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    piotr = await createTeacher("piotr@test.pl", 55, "Piotr");
  });

  it("okno zapisuje się na konkretny dzień", async () => {
    const slot = await createAvailability(anna, {
      date: WEEK_1,
      startTime: "16:00",
      endTime: "20:00",
    });
    expect(slot.date).toBe(WEEK_1);
    expect(slot.teacherId).toBe(anna.teacherProfileId);
  });

  it("tego samego okna nie da się dodać dwa razy", async () => {
    await createAvailability(anna, {
      date: WEEK_1,
      startTime: "16:00",
      endTime: "20:00",
    });
    await expect(
      createAvailability(anna, {
        date: WEEK_1,
        startTime: "16:00",
        endTime: "18:00",
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("godzina zakończenia musi być późniejsza niż rozpoczęcia", async () => {
    await expect(
      createAvailability(anna, {
        date: WEEK_1,
        startTime: "18:00",
        endTime: "16:00",
      })
    ).rejects.toThrow();
  });

  it("czyszczenie dnia usuwa tylko ten dzień", async () => {
    await createAvailability(anna, {
      date: WEEK_1,
      startTime: "16:00",
      endTime: "20:00",
    });
    await createAvailability(anna, {
      date: WEEK_2,
      startTime: "16:00",
      endTime: "20:00",
    });

    expect(await clearAvailabilityDay(anna, { date: WEEK_1 })).toBe(1);
    const left = await listAvailability(anna);
    expect(left).toHaveLength(1);
    expect(left[0].date).toBe(WEEK_2);
  });

  it("„powtórz z zeszłego tygodnia” przenosi układ dzień w dzień", async () => {
    await createAvailability(anna, {
      date: WEEK_1,
      startTime: "16:00",
      endTime: "20:00",
    });
    // Środa tego samego tygodnia.
    await createAvailability(anna, {
      date: "2026-09-23",
      startTime: "10:00",
      endTime: "12:00",
    });

    const copied = await copyAvailabilityWeek(anna, {
      sourceWeek: WEEK_1,
      targetWeek: WEEK_2,
    });
    expect(copied).toBe(2);

    const target = await listAvailability(anna);
    expect(target.find((slot) => slot.date === WEEK_2)?.startTime).toBe("16:00");
    expect(target.find((slot) => slot.date === "2026-09-30")?.startTime).toBe(
      "10:00"
    );
  });

  it("kopiowanie nie dubluje okien już istniejących w celu", async () => {
    await createAvailability(anna, {
      date: WEEK_1,
      startTime: "16:00",
      endTime: "20:00",
    });
    await createAvailability(anna, {
      date: WEEK_2,
      startTime: "16:00",
      endTime: "20:00",
    });

    expect(
      await copyAvailabilityWeek(anna, {
        sourceWeek: WEEK_1,
        targetWeek: WEEK_2,
      })
    ).toBe(0);
    expect(await listAvailability(anna)).toHaveLength(2);
  });

  it("pusty tydzień źródłowy nic nie kopiuje", async () => {
    await expect(
      copyAvailabilityWeek(anna, { sourceWeek: WEEK_1, targetWeek: WEEK_2 })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("kopiowanie na miesiąc powtarza układ w każdym tygodniu", async () => {
    await createAvailability(anna, {
      date: WEEK_1,
      startTime: "16:00",
      endTime: "20:00",
    });

    const created = await copyAvailabilityToMonth(anna, {
      sourceWeek: WEEK_1,
      month: "2026-10",
    });
    // Październik 2026 ma cztery poniedziałki: 5, 12, 19 i 26.
    expect(created).toBe(4);

    const october = (await listAvailability(anna)).filter((slot) =>
      slot.date.startsWith("2026-10")
    );
    expect(october).toHaveLength(4);
    expect(october.every((slot) => slot.startTime === "16:00")).toBe(true);
    // Zmiana czasu w nocy z 24 na 25 października nie przesuwa godziny okna.
    expect(october.map((slot) => slot.date)).toContain("2026-10-26");
  });

  // ---------- GRANICE RÓL ----------

  it("nauczyciel nie dopisze ani nie wyczyści cudzej dyspozycyjności", async () => {
    await expect(
      createAvailability(anna, {
        teacherId: piotr.teacherProfileId,
        date: WEEK_1,
        startTime: "16:00",
        endTime: "20:00",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      clearAvailabilityDay(anna, {
        teacherId: piotr.teacherProfileId,
        date: WEEK_1,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nauczyciel nie usunie cudzego okna", async () => {
    const slot = await createAvailability(admin, {
      teacherId: piotr.teacherProfileId,
      date: WEEK_1,
      startTime: "16:00",
      endTime: "20:00",
    });
    await expect(deleteAvailability(anna, slot.id)).rejects.toThrow();
    expect(await listAvailability(admin, piotr.teacherProfileId)).toHaveLength(1);
  });

  it("admin musi wskazać, czyją dyspozycyjność ustawia", async () => {
    await expect(
      createAvailability(admin, {
        date: WEEK_1,
        startTime: "16:00",
        endTime: "20:00",
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("zakres dat zawęża listę", async () => {
    await createAvailability(anna, {
      date: WEEK_1,
      startTime: "16:00",
      endTime: "20:00",
    });
    await createAvailability(anna, {
      date: WEEK_2,
      startTime: "16:00",
      endTime: "20:00",
    });

    const range = await listAvailability(anna, null, {
      from: new Date("2026-09-20T22:00:00Z"),
      to: new Date("2026-09-27T22:00:00Z"),
    });
    expect(range).toHaveLength(1);
    expect(range[0].date).toBe(WEEK_1);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
