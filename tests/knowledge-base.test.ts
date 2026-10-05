/**
 * Baza wiedzy — materiały pomocnicze per przedmiot.
 *
 * Dwie rzeczy do pilnowania: pisze wyłącznie admin, a nauczyciel widzi
 * tylko przedmioty, do których ma stawkę. Trzecia, mniej oczywista: adres
 * materiału musi być http(s), bo `javascript:` w linku wykonałby się
 * w przeglądarce nauczyciela.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  countKnowledgeEntries,
  createKnowledgeEntry,
  deleteKnowledgeEntry,
  getKnowledgeEntry,
  listKnowledgeBase,
  updateKnowledgeEntry,
} from "@/lib/services/knowledge-base";
import { updateSubject } from "@/lib/services/subjects";
import {
  createAdmin,
  createLevel,
  createTeacher,
  describeDb,
  getDefaultLevelId,
  prisma,
  resetDatabase,
  setTeacherRate,
} from "./helpers/db";

const MATERIAL = {
  title: "Słownik PWN",
  url: "https://sjp.pwn.pl/",
  description: "Odmiana przez przypadki",
};

describeDb("baza wiedzy", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let piotr: Awaited<ReturnType<typeof createTeacher>>;
  let polskiId: string;
  let angielskiId: string;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();

    // `createTeacher` nadaje stawkę na domyślnym poziomie (Polski · Ogólny),
    // więc oboje mają przypisany Polski.
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    piotr = await createTeacher("piotr@test.pl", 55, "Piotr");

    const poziomAngielskiego = await createLevel("Angielski", "B2");
    angielskiId = (
      await prisma.subjectLevel.findUniqueOrThrow({
        where: { id: poziomAngielskiego },
        select: { subjectId: true },
      })
    ).subjectId;
    polskiId = (
      await prisma.subjectLevel.findUniqueOrThrow({
        where: { id: getDefaultLevelId() },
        select: { subjectId: true },
      })
    ).subjectId;

    // Tylko Anna uczy angielskiego.
    await setTeacherRate(anna.teacherProfileId, poziomAngielskiego, 70);
  });

  describe("kto może pisać", () => {
    it("admin dodaje materiał", async () => {
      const entry = await createKnowledgeEntry(admin, {
        subjectId: polskiId,
        ...MATERIAL,
      });
      expect(entry.title).toBe("Słownik PWN");
      expect(entry.subjectId).toBe(polskiId);
    });

    it("nauczyciel nie doda, nie zmieni i nie skasuje", async () => {
      const entry = await createKnowledgeEntry(admin, {
        subjectId: polskiId,
        ...MATERIAL,
      });

      await expect(
        createKnowledgeEntry(anna, { subjectId: polskiId, ...MATERIAL })
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        updateKnowledgeEntry(anna, entry.id, { ...MATERIAL, title: "Moje" })
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        deleteKnowledgeEntry(anna, entry.id)
      ).rejects.toBeInstanceOf(ForbiddenError);

      expect(await prisma.knowledgeBaseEntry.count()).toBe(1);
    });

    it("materiał do nieistniejącego przedmiotu nie powstaje", async () => {
      await expect(
        createKnowledgeEntry(admin, { subjectId: "nie-ma-takiego", ...MATERIAL })
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("zakres przedmiotów", () => {
    beforeEach(async () => {
      await createKnowledgeEntry(admin, { subjectId: polskiId, ...MATERIAL });
      await createKnowledgeEntry(admin, {
        subjectId: angielskiId,
        title: "Cambridge Dictionary",
        url: "https://dictionary.cambridge.org/",
        description: "",
      });
    });

    it("admin widzi wszystkie przedmioty", async () => {
      const zakladki = await listKnowledgeBase(admin);
      expect(zakladki.map((z) => z.subjectName)).toEqual(["Angielski", "Polski"]);
      expect(await countKnowledgeEntries(admin)).toBe(2);
    });

    /** Sedno zadania: Piotr nie uczy angielskiego, więc tej zakładki nie ma. */
    it("nauczyciel widzi wyłącznie przedmioty, do których ma stawkę", async () => {
      const uAnny = await listKnowledgeBase(anna);
      expect(uAnny.map((z) => z.subjectName)).toEqual(["Angielski", "Polski"]);

      const uPiotra = await listKnowledgeBase(piotr);
      expect(uPiotra.map((z) => z.subjectName)).toEqual(["Polski"]);
      expect(await countKnowledgeEntries(piotr)).toBe(1);
    });

    it("nauczyciel nie otworzy materiału z nieswojego przedmiotu", async () => {
      const [angielski] = await listKnowledgeBase(admin);
      const materialAngielski = angielski.entries[0];

      // Anna uczy angielskiego — dla niej to zwykły materiał.
      expect((await getKnowledgeEntry(anna, materialAngielski.id)).title).toBe(
        "Cambridge Dictionary"
      );
      // Piotr nie uczy — dostaje 404, nie 403.
      await expect(
        getKnowledgeEntry(piotr, materialAngielski.id)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("nauczyciel bez żadnej stawki dostaje pustą bazę, nie błąd", async () => {
      await prisma.teacherRate.deleteMany({
        where: { teacherId: piotr.teacherProfileId },
      });
      expect(await listKnowledgeBase(piotr)).toEqual([]);
      expect(await countKnowledgeEntries(piotr)).toBe(0);
    });

    /**
     * Przedmiot wyłączony zostaje adminowi (archiwum), ale znika nauczycielowi —
     * nie ma po co podsuwać materiałów do czegoś, czego już nie uczymy.
     */
    it("wyłączony przedmiot widzi tylko admin", async () => {
      await updateSubject(admin, angielskiId, { active: false });

      expect(
        (await listKnowledgeBase(admin)).map((z) => z.subjectName)
      ).toContain("Angielski");
      expect(
        (await listKnowledgeBase(anna)).map((z) => z.subjectName)
      ).not.toContain("Angielski");
    });

    it("materiały nie zawierają żadnych kwot", async () => {
      const [, polski] = await listKnowledgeBase(anna);
      const { createdAt: _a, updatedAt: _b, ...entry } = polski.entries[0];
      const json = JSON.stringify(entry);

      expect(json).not.toMatch(/\d+[.,]\d{2}/);
      expect(json).not.toMatch(/\d\s*zł/);
    });
  });

  describe("adres materiału", () => {
    /**
     * To nie jest kosmetyka: `javascript:` w `href` wykonuje się po kliknięciu,
     * w sesji nauczyciela. `data:` pozwalałby podstawić własny dokument HTML.
     */
    it("odrzuca wszystko poza http i https", async () => {
      for (const url of [
        "javascript:alert(document.cookie)",
        "JavaScript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "file:///etc/passwd",
        "ftp://example.com/plik",
        "sjp.pwn.pl",
        "",
      ]) {
        await expect(
          createKnowledgeEntry(admin, { subjectId: polskiId, ...MATERIAL, url }),
          url || "(pusty)"
        ).rejects.toThrow();
      }
      expect(await prisma.knowledgeBaseEntry.count()).toBe(0);
    });

    it("przyjmuje http i https", async () => {
      for (const url of [
        "https://sjp.pwn.pl/",
        "http://example.pl/materialy?rok=2026",
        "https://example.pl/ścieżka z polskimi znakami",
      ]) {
        const entry = await createKnowledgeEntry(admin, {
          subjectId: polskiId,
          ...MATERIAL,
          url,
        });
        expect(entry.url).toBe(url);
      }
    });

    it("edycja też nie przepuszcza javascript:", async () => {
      const entry = await createKnowledgeEntry(admin, {
        subjectId: polskiId,
        ...MATERIAL,
      });
      await expect(
        updateKnowledgeEntry(admin, entry.id, {
          ...MATERIAL,
          url: "javascript:alert(1)",
        })
      ).rejects.toThrow();

      expect((await getKnowledgeEntry(admin, entry.id)).url).toBe(MATERIAL.url);
    });

    it("nazwa materiału jest wymagana", async () => {
      await expect(
        createKnowledgeEntry(admin, { subjectId: polskiId, ...MATERIAL, title: "  " })
      ).rejects.toThrow();
    });
  });

  describe("zmiana i usuwanie", () => {
    it("admin poprawia materiał", async () => {
      const entry = await createKnowledgeEntry(admin, {
        subjectId: polskiId,
        ...MATERIAL,
      });
      const po = await updateKnowledgeEntry(admin, entry.id, {
        title: "Słownik PWN (nowy adres)",
        url: "https://sjp.pwn.pl/zasady",
        description: "",
      });
      expect(po.title).toBe("Słownik PWN (nowy adres)");
      expect(po.description).toBe("");
      // Przedmiot zostaje ten sam — edycja go nie przenosi.
      expect(po.subjectId).toBe(polskiId);
    });

    it("usunięcie przedmiotu zabiera jego materiały", async () => {
      await createKnowledgeEntry(admin, { subjectId: angielskiId, ...MATERIAL });
      await prisma.subject.delete({ where: { id: angielskiId } });
      expect(await prisma.knowledgeBaseEntry.count()).toBe(0);
    });

    it("materiału, którego nie ma, nie da się zmienić ani skasować", async () => {
      await expect(
        updateKnowledgeEntry(admin, "nie-ma", MATERIAL)
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        deleteKnowledgeEntry(admin, "nie-ma")
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
