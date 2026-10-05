/**
 * Notatki z lekcji — przede wszystkim granica ról.
 *
 * Nauczyciel widzi notatki ze SWOICH lekcji, admin wszystkie i może szukać.
 * Cudza notatka daje `NotFoundError`, nie 403 — nie potwierdzamy jej istnienia.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/lib/errors";
import {
  countLessonsAwaitingNote,
  deleteLessonNote,
  getLessonNote,
  listLessonNotes,
  listLessonsAwaitingNote,
  saveLessonNote,
} from "@/lib/services/lesson-notes";
import { deleteLesson } from "@/lib/services/lessons";
import { updateStudent } from "@/lib/services/students";
import {
  createAdmin,
  createLesson,
  createLevel,
  createStudent,
  createTeacher,
  describeDb,
  prisma,
  resetDatabase,
} from "./helpers/db";

const TRESC = {
  whatWeDid: "Czas przeszły — ćwiczenia z podręcznika",
  howItWent: "Dobrze z formami, gorzej z akcentem",
  goal: "Swobodna rozmowa o pracy",
  nextSteps: "Zadanie 4 i 5, powtórka słówek",
};

describeDb("notatki z lekcji", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let piotr: Awaited<ReturnType<typeof createTeacher>>;
  let uczenAnny: string;
  let uczenPiotra: string;
  let lekcjaAnny: string;
  let lekcjaPiotra: string;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    piotr = await createTeacher("piotr@test.pl", 55, "Piotr");
    uczenAnny = await createStudent(anna.teacherProfileId, 90, "Oleksandra");
    uczenPiotra = await createStudent(piotr.teacherProfileId, 85, "Dzmitry");

    lekcjaAnny = await createLesson({
      studentId: uczenAnny,
      teacherId: anna.teacherProfileId,
      scheduledAt: new Date("2026-09-21T14:00:00Z"),
      status: "COMPLETED",
    });
    lekcjaPiotra = await createLesson({
      studentId: uczenPiotra,
      teacherId: piotr.teacherProfileId,
      scheduledAt: new Date("2026-09-22T14:00:00Z"),
      status: "COMPLETED",
    });
  });

  describe("zapis", () => {
    it("nauczyciel zapisuje notatkę do swojej lekcji", async () => {
      const note = await saveLessonNote(anna, lekcjaAnny, TRESC);
      expect(note.whatWeDid).toBe(TRESC.whatWeDid);
      expect(note.studentName).toContain("Oleksandra");
      expect(note.teacherName).toContain("Anna");
    });

    it("druga próba nadpisuje, nie dubluje — jedna notatka na lekcję", async () => {
      await saveLessonNote(anna, lekcjaAnny, TRESC);
      await saveLessonNote(anna, lekcjaAnny, { ...TRESC, howItWent: "Poprawione" });

      const wiersze = await prisma.lessonNote.findMany({
        where: { lessonId: lekcjaAnny },
      });
      expect(wiersze).toHaveLength(1);
      expect(wiersze[0].howItWent).toBe("Poprawione");
    });

    it("wystarczy jedno wypełnione pole, ale pusta notatka nie przechodzi", async () => {
      const samCel = await saveLessonNote(anna, lekcjaAnny, { goal: "Matura" });
      expect(samCel.goal).toBe("Matura");
      expect(samCel.whatWeDid).toBe("");

      await expect(
        saveLessonNote(anna, lekcjaAnny, {
          whatWeDid: "   ",
          howItWent: "",
          goal: "",
          nextSteps: "",
        })
      ).rejects.toThrow();
    });

    /**
     * `studentId` jest zdenormalizowany po to, żeby dało się szukać po uczniu.
     * Gdyby pochodził z wejścia, nauczyciel podpiąłby notatkę pod cudzego ucznia.
     */
    it("ucznia bierzemy z lekcji, nigdy z formularza", async () => {
      await saveLessonNote(anna, lekcjaAnny, {
        ...TRESC,
        studentId: uczenPiotra,
      } as never);

      const wiersz = await prisma.lessonNote.findFirstOrThrow({
        where: { lessonId: lekcjaAnny },
      });
      expect(wiersz.studentId).toBe(uczenAnny);
    });
  });

  describe("granica ról", () => {
    it("nauczyciel nie zapisze notatki do cudzej lekcji", async () => {
      await expect(
        saveLessonNote(anna, lekcjaPiotra, TRESC)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("nauczyciel nie przeczyta ani nie skasuje cudzej notatki", async () => {
      await saveLessonNote(piotr, lekcjaPiotra, TRESC);

      expect(await getLessonNote(anna, lekcjaPiotra)).toBeNull();
      await expect(
        deleteLessonNote(anna, lekcjaPiotra)
      ).rejects.toBeInstanceOf(NotFoundError);

      // Notatka Piotra ma zostać nietknięta.
      expect(await prisma.lessonNote.count()).toBe(1);
    });

    it("lista nauczyciela zawiera tylko jego notatki", async () => {
      await saveLessonNote(anna, lekcjaAnny, TRESC);
      await saveLessonNote(piotr, lekcjaPiotra, TRESC);

      const notatkiAnny = await listLessonNotes(anna);
      expect(notatkiAnny).toHaveLength(1);
      expect(notatkiAnny[0].lessonId).toBe(lekcjaAnny);

      expect(await listLessonNotes(admin)).toHaveLength(2);
    });

    /** Tak samo jak w grafiku: cudzy `teacherId` z adresu jest ignorowany. */
    it("nauczyciel nie podejrzy cudzych notatek przez filtr", async () => {
      await saveLessonNote(piotr, lekcjaPiotra, TRESC);

      const podstęp = await listLessonNotes(anna, {
        teacherId: piotr.teacherProfileId,
      });
      expect(podstęp).toHaveLength(0);
    });

    it("cudzy uczeń w filtrze też nic nie daje", async () => {
      await saveLessonNote(piotr, lekcjaPiotra, TRESC);
      expect(await listLessonNotes(anna, { studentId: uczenPiotra })).toHaveLength(0);
    });

    /**
     * Sedno: zakres liczymy po nauczycielu LEKCJI, nie po dzisiejszym opiekunie
     * ucznia. Przepisanie ucznia nie może oddać nowemu nauczycielowi notatek
     * z zajęć, których nie prowadził, ani odciąć autora od własnych.
     */
    it("przepisanie ucznia nie przenosi notatek z dawnych lekcji", async () => {
      await saveLessonNote(anna, lekcjaAnny, TRESC);
      await updateStudent(admin, uczenAnny, { teacherId: piotr.teacherProfileId });

      expect(await listLessonNotes(piotr)).toHaveLength(0);
      const notatkiAnny = await listLessonNotes(anna);
      expect(notatkiAnny).toHaveLength(1);
      expect(notatkiAnny[0].lessonId).toBe(lekcjaAnny);
    });

    it("admin filtruje po nauczycielu", async () => {
      await saveLessonNote(anna, lekcjaAnny, TRESC);
      await saveLessonNote(piotr, lekcjaPiotra, TRESC);

      const tylkoPiotr = await listLessonNotes(admin, {
        teacherId: piotr.teacherProfileId,
      });
      expect(tylkoPiotr).toHaveLength(1);
      expect(tylkoPiotr[0].teacherName).toContain("Piotr");
    });

    /** Notatka nie niesie kwot, więc ten sam widok jest bezpieczny dla obu ról. */
    it("notatka nie zawiera żadnej kwoty", async () => {
      await saveLessonNote(anna, lekcjaAnny, TRESC);
      const [notatka] = await listLessonNotes(anna);

      // Daty odpadają PRZED sprawdzeniem: „…:37.860Z" wygląda jak kwota
      // z groszami i dałoby fałszywy alarm.
      const { lessonAt: _a, createdAt: _b, updatedAt: _c, ...reszta } = notatka;
      const json = JSON.stringify(reszta);

      expect(json).not.toMatch(/\d+[.,]\d{2}/);
      // „zł" musi stać po liczbie — samo w sobie siedzi w „przeszły"
      // i w „obniżką", więc gołe `/zł/` dawałoby fałszywy alarm.
      expect(json).not.toMatch(/\d\s*zł/);
      expect(Object.keys(notatka)).not.toContain("amount");
      expect(Object.keys(notatka)).not.toContain("charge");
    });
  });

  describe("szukanie (admin)", () => {
    beforeEach(async () => {
      await saveLessonNote(anna, lekcjaAnny, TRESC);
      await saveLessonNote(piotr, lekcjaPiotra, {
        whatWeDid: "Rozmowa o pracy",
        howItWent: "Bardzo dobrze",
        goal: "Rozmowa kwalifikacyjna",
        nextSteps: "Przygotować CV",
      });
    });

    it("po treści notatki", async () => {
      const wynik = await listLessonNotes(admin, { query: "akcentem" });
      expect(wynik).toHaveLength(1);
      expect(wynik[0].lessonId).toBe(lekcjaAnny);
    });

    it("po imieniu ucznia i nazwisku nauczyciela", async () => {
      expect(await listLessonNotes(admin, { query: "Oleksandra" })).toHaveLength(1);
      expect(await listLessonNotes(admin, { query: "Dzmitry" })).toHaveLength(1);
      expect(await listLessonNotes(admin, { query: "Piotr" })).toHaveLength(1);
    });

    it("po przedmiocie", async () => {
      const inny = await createLevel("Angielski", "B2");
      const lekcja = await createLesson({
        studentId: uczenAnny,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-09-23T14:00:00Z"),
        status: "COMPLETED",
        subjectLevelId: inny,
      });
      await saveLessonNote(anna, lekcja, { goal: "Konwersacje" });

      const wynik = await listLessonNotes(admin, { query: "Angielski" });
      expect(wynik).toHaveLength(1);
      expect(wynik[0].subjectLabel).toBe("Angielski · B2");
    });

    it("nie rozróżnia wielkości liter", async () => {
      expect(await listLessonNotes(admin, { query: "AKCENTEM" })).toHaveLength(1);
      expect(await listLessonNotes(admin, { query: "oleksandra" })).toHaveLength(1);
    });

    it("szukanie nauczyciela nie wychodzi poza jego notatki", async () => {
      // „Dzmitry" to uczeń Piotra, „kwalifikacyjna" słowo tylko z jego notatki.
      expect(await listLessonNotes(anna, { query: "Dzmitry" })).toHaveLength(0);
      expect(await listLessonNotes(anna, { query: "kwalifikacyjna" })).toHaveLength(0);
      // Dla pewności: admin te same frazy znajduje.
      expect(await listLessonNotes(admin, { query: "kwalifikacyjna" })).toHaveLength(1);
    });

    it("brak trafień to pusta lista, nie błąd", async () => {
      expect(await listLessonNotes(admin, { query: "czegoś takiego nie ma" })).toEqual([]);
    });
  });

  describe("lekcje do uzupełnienia", () => {
    it("liczy tylko lekcje, które się odbyły", async () => {
      await createLesson({
        studentId: uczenAnny,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-10-01T14:00:00Z"),
        status: "SCHEDULED",
      });
      await createLesson({
        studentId: uczenAnny,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-10-02T14:00:00Z"),
        status: "CANCELLED",
      });
      const nieobecnosc = await createLesson({
        studentId: uczenAnny,
        teacherId: anna.teacherProfileId,
        scheduledAt: new Date("2026-10-03T14:00:00Z"),
        status: "NO_SHOW",
      });

      const czekajace = await listLessonsAwaitingNote(anna);
      const idki = czekajace.map((l) => l.lessonId);
      expect(idki).toContain(lekcjaAnny);
      expect(idki).toContain(nieobecnosc);
      expect(czekajace).toHaveLength(2);
      expect(await countLessonsAwaitingNote(anna)).toBe(2);
    });

    it("lekcja z notatką znika z listy", async () => {
      expect(await countLessonsAwaitingNote(anna)).toBe(1);
      await saveLessonNote(anna, lekcjaAnny, TRESC);
      expect(await countLessonsAwaitingNote(anna)).toBe(0);
      expect(await listLessonsAwaitingNote(anna)).toHaveLength(0);
    });

    it("nauczyciel nie widzi cudzych lekcji do uzupełnienia", async () => {
      const czekajace = await listLessonsAwaitingNote(anna);
      expect(czekajace.map((l) => l.lessonId)).not.toContain(lekcjaPiotra);
      expect(await countLessonsAwaitingNote(admin)).toBe(2);
    });
  });

  describe("usuwanie", () => {
    it("nauczyciel kasuje własną notatkę", async () => {
      await saveLessonNote(anna, lekcjaAnny, TRESC);
      await deleteLessonNote(anna, lekcjaAnny);
      expect(await getLessonNote(anna, lekcjaAnny)).toBeNull();
    });

    it("usunięcie lekcji zabiera ze sobą notatkę", async () => {
      await saveLessonNote(anna, lekcjaAnny, TRESC);
      await deleteLesson(anna, lekcjaAnny);
      expect(await prisma.lessonNote.count()).toBe(0);
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
