/**
 * Wiadomości admin -> nauczyciele: kto może wysyłać, kto co widzi i skąd
 * bierze się czerwona kropka przy zakładce „Wiadomości”.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  countUnreadMessages,
  deleteMessage,
  listMyMessages,
  listSentMessages,
  markAllMessagesRead,
  markMessageRead,
  sendMessage,
} from "@/lib/services/messages";
import { updateTeacher } from "@/lib/services/teachers";
import {
  createAdmin,
  createTeacher,
  describeDb,
  prisma,
  resetDatabase,
} from "./helpers/db";

describeDb("wiadomości", () => {
  let admin: Awaited<ReturnType<typeof createAdmin>>;
  let anna: Awaited<ReturnType<typeof createTeacher>>;
  let piotr: Awaited<ReturnType<typeof createTeacher>>;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createAdmin();
    anna = await createTeacher("anna@test.pl", 60, "Anna");
    piotr = await createTeacher("piotr@test.pl", 55, "Piotr");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---------- UPRAWNIENIA ----------

  it("nauczyciel nie wyśle wiadomości ani nie zajrzy do skrzynki nadawczej", async () => {
    await expect(
      sendMessage(anna, { subject: "Test", body: "treść", recipient: "ALL" })
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listSentMessages(anna)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteMessage(anna, "dowolna")).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("admin nie ma skrzynki odbiorczej nauczyciela", async () => {
    await expect(listMyMessages(admin)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(markAllMessagesRead(admin)).rejects.toBeInstanceOf(ForbiddenError);
  });

  // ---------- WYSYŁKA ----------

  it("wiadomość do jednego nauczyciela trafia tylko do niego", async () => {
    await sendMessage(admin, {
      subject: "Rozliczenie",
      body: "Proszę o uzupełnienie statusów lekcji.",
      recipient: anna.teacherProfileId,
    });

    const doAnny = await listMyMessages(anna);
    expect(doAnny).toHaveLength(1);
    expect(doAnny[0].subject).toBe("Rozliczenie");
    expect(doAnny[0].broadcast).toBe(false);

    expect(await listMyMessages(piotr)).toHaveLength(0);
  });

  it("wysyłka zbiorcza trafia do wszystkich aktywnych nauczycieli", async () => {
    const message = await sendMessage(admin, {
      subject: "Przerwa świąteczna",
      body: "W przyszłym tygodniu nie pracujemy.",
      recipient: "ALL",
    });

    expect(message.broadcast).toBe(true);
    expect(message.recipients).toHaveLength(2);
    expect(await listMyMessages(anna)).toHaveLength(1);
    expect(await listMyMessages(piotr)).toHaveLength(1);
  });

  it("wysyłka zbiorcza pomija konta zablokowane", async () => {
    await updateTeacher(admin, piotr.teacherProfileId, { active: false });
    const message = await sendMessage(admin, {
      subject: "Tylko dla aktywnych",
      body: "treść",
      recipient: "ALL",
    });
    expect(message.recipients).toHaveLength(1);
    expect(message.recipients[0].teacherId).toBe(anna.teacherProfileId);
  });

  it("nie wyśle do nieistniejącego nauczyciela", async () => {
    await expect(
      sendMessage(admin, {
        subject: "Test",
        body: "treść",
        recipient: "nie-istnieje",
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("pusty temat albo treść są odrzucane", async () => {
    await expect(
      sendMessage(admin, { subject: "", body: "treść", recipient: "ALL" })
    ).rejects.toThrow();
    await expect(
      sendMessage(admin, { subject: "Temat", body: "   ", recipient: "ALL" })
    ).rejects.toThrow();
  });

  // ---------- KROPKA I ODCZYT ----------

  describe("stan przeczytania", () => {
    beforeEach(async () => {
      await sendMessage(admin, {
        subject: "Zbiorcza",
        body: "treść",
        recipient: "ALL",
      });
      await sendMessage(admin, {
        subject: "Tylko do Anny",
        body: "treść",
        recipient: anna.teacherProfileId,
      });
    });

    it("licznik nieprzeczytanych zasila kropkę i jest liczony per nauczyciel", async () => {
      expect(await countUnreadMessages(anna)).toBe(2);
      expect(await countUnreadMessages(piotr)).toBe(1);
      // Admin nie ma skrzynki — kropka go nie dotyczy.
      expect(await countUnreadMessages(admin)).toBe(0);
    });

    it("oznaczenie jako przeczytanej gasi kropkę tylko u tego nauczyciela", async () => {
      const [najnowsza] = await listMyMessages(anna);
      await markMessageRead(anna, najnowsza.id);

      expect(await countUnreadMessages(anna)).toBe(1);
      const zaktualizowana = (await listMyMessages(anna)).find(
        (message) => message.id === najnowsza.id
      )!;
      expect(zaktualizowana.readAt).not.toBeNull();
    });

    it("nauczyciel nie oznaczy cudzej wiadomości", async () => {
      const [doAnny] = await listMyMessages(anna);
      // Wiadomość „Tylko do Anny” nie istnieje w skrzynce Piotra.
      await expect(markMessageRead(piotr, doAnny.id)).rejects.toBeInstanceOf(
        NotFoundError
      );
      expect(await countUnreadMessages(anna)).toBe(2);
    });

    it("powtórne oznaczenie nie jest błędem", async () => {
      const [wiadomosc] = await listMyMessages(anna);
      await markMessageRead(anna, wiadomosc.id);
      await expect(markMessageRead(anna, wiadomosc.id)).resolves.toBeUndefined();
    });

    it("oznaczenie wszystkich zeruje licznik", async () => {
      expect(await markAllMessagesRead(anna)).toBe(2);
      expect(await countUnreadMessages(anna)).toBe(0);
      // U Piotra bez zmian.
      expect(await countUnreadMessages(piotr)).toBe(1);
    });

    it("nauczyciel nie widzi listy pozostałych odbiorców", async () => {
      const [wiadomosc] = await listMyMessages(piotr);
      expect(wiadomosc.recipients).toEqual([]);
    });

    it("admin widzi potwierdzenia odczytu", async () => {
      await markAllMessagesRead(anna);
      const wyslane = await listSentMessages(admin);
      const zbiorcza = wyslane.find((message) => message.broadcast)!;

      const annaRow = zbiorcza.recipients.find(
        (recipient) => recipient.teacherId === anna.teacherProfileId
      )!;
      const piotrRow = zbiorcza.recipients.find(
        (recipient) => recipient.teacherId === piotr.teacherProfileId
      )!;
      expect(annaRow.readAt).not.toBeNull();
      expect(piotrRow.readAt).toBeNull();
    });

    it("usunięcie wiadomości czyści ją też ze skrzynek nauczycieli", async () => {
      const [wiadomosc] = await listSentMessages(admin);
      await deleteMessage(admin, wiadomosc.id);

      const zostaly = await listMyMessages(anna);
      expect(zostaly.map((message) => message.id)).not.toContain(wiadomosc.id);
      expect(
        await prisma.messageRecipient.count({ where: { messageId: wiadomosc.id } })
      ).toBe(0);
    });
  });
});
