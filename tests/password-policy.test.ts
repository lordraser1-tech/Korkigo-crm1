/**
 * Siła hasła i to, co trafia do logu — oba bez bazy.
 *
 * Reguły idą za NIST SP 800-63B: liczy się długość i lista zakazanych,
 * a nie „wielka litera, cyfra, znak specjalny". Testy pilnują właśnie tego
 * podziału, bo pokusa dopisania reguł kompozycji wraca przy każdym audycie.
 */
import { describe, expect, it, vi } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  checkPassword,
  passwordProblemMessage,
} from "@/lib/password-policy";
import { logError } from "@/lib/log";
import { teacherCreateSchema, changePasswordSchema } from "@/lib/validation";

describe("siła hasła", () => {
  it("przyjmuje długie hasło bez znaków specjalnych", () => {
    expect(checkPassword("zielona latarnia kropki")).toBeNull();
    expect(checkPassword("poprawne-konie-baterie-zszywka")).toBeNull();
  });

  it("odrzuca za krótkie", () => {
    expect(checkPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).toBe("TOO_SHORT");
  });

  /**
   * Sedno listy zakazanych: porównanie idzie po formie uproszczonej, więc
   * jeden wpis `haslo` zatrzymuje wszystkie ozdobniki wokół niego.
   */
  it("ozdobniki nie ratują popularnego hasła", () => {
    for (const weak of [
      "haslo12345678",
      "Haslo-123456!",
      "HASŁO!!!!!!!!!",
      "qwerty123456",
      "password1234",
      "korepetycje1",
    ]) {
      expect(checkPassword(weak), weak).not.toBeNull();
    }
  });

  it("odrzuca same cyfry i same powtórzenia", () => {
    expect(checkPassword("123456789012")).toBe("DIGITS_ONLY");
    expect(checkPassword("abababababab")).toBe("REPEATED");
  });

  it("nie wymusza wielkich liter ani znaków specjalnych", () => {
    // Gdyby ktoś dopisał regułę kompozycji, ten przypadek padnie pierwszy.
    expect(checkPassword("rower kominek wiosna")).toBeNull();
  });

  it("każdy problem ma komunikat po polsku", () => {
    for (const problem of ["TOO_SHORT", "TOO_LONG", "COMMON", "DIGITS_ONLY", "REPEATED"] as const) {
      expect(passwordProblemMessage(problem)).toMatch(/[ąćęłńóśźż]|Hasło/i);
    }
  });

  it("schematy wejścia używają tej samej reguły co serwis", () => {
    const weak = { email: "a@b.pl", password: "haslo123", firstName: "A", lastName: "B" };
    expect(teacherCreateSchema.safeParse(weak).success).toBe(false);

    const change = {
      currentPassword: "cokolwiek",
      newPassword: "haslo123",
      confirmPassword: "haslo123",
    };
    expect(changePasswordSchema.safeParse(change).success).toBe(false);
  });
});

describe("log błędów", () => {
  /** Udawany błąd Prismy: komunikat z wartościami pól, jak w praktyce. */
  function prismaError() {
    return Object.assign(
      new Error(
        "Invalid `prisma.student.create()` invocation:\n\n{\n" +
          '  firstName: "Oleksandra",\n  contactEmail: "ola@example.com",\n' +
          '  parentPhone: "+48 601 234 567"\n}\n' +
          "Unique constraint failed"
      ),
      {
        name: "PrismaClientKnownRequestError",
        code: "P2002",
        meta: { target: ["contactEmail"] },
      }
    );
  }

  function capture(error: unknown): { line: string; id: string } {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = logError("Test", error);
    const line = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    spy.mockRestore();
    return { line, id };
  }

  /**
   * To jest cel całego modułu: imię ucznia nie może trafić do logów hostingu,
   * bo nie obejmuje ich nasza retencja ani umowa powierzenia.
   */
  it("nie zapisuje danych osobowych z komunikatu Prismy", () => {
    const { line } = capture(prismaError());
    expect(line).not.toContain("Oleksandra");
    expect(line).not.toContain("ola@example.com");
    expect(line).not.toContain("601 234 567");
  });

  it("zachowuje to, co potrzebne do naprawy", () => {
    const { line } = capture(prismaError());
    expect(line).toContain("P2002");
    expect(line).toContain("contactEmail"); // nazwa pola, nie wartość
    expect(line).toContain("prisma.student.create()");
  });

  it("maskuje e-mail, numer i token także poza Prismą", () => {
    const { line } = capture(
      new Error("nie wyszło dla jan.kowalski@korkigo.pl tel +48 601 234 567 token abcdefghijklmnopqrstuvwxyz0123456789")
    );
    expect(line).toContain("[e-mail]");
    expect(line).toContain("[numer]");
    expect(line).toContain("[token]");
  });

  it("identyfikator z logu wraca do użytkownika", () => {
    const { line, id } = capture(new Error("cokolwiek"));
    expect(id).toHaveLength(8);
    expect(line).toContain(id);
  });

  it("nie rzuca, cokolwiek dostanie", () => {
    for (const weird of [null, undefined, 42, { a: 1 }, Symbol("x")]) {
      expect(() => capture(weird)).not.toThrow();
    }
  });
});
