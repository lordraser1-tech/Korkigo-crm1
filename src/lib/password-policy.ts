/**
 * Siła hasła — jedno miejsce z regułami, tak samo jak `policy.ts` trzyma
 * regulamin odwołań. Kod pyta o wynik, nie o liczby.
 *
 * Reguły idą za zaleceniem NIST SP 800-63B: **długość i lista zakazanych**,
 * bez wymuszania „wielka litera, cyfra, znak specjalny". Te ostatnie dają
 * `Haslo123!` — formalnie zgodne, a w praktyce zgadywane w pierwszej setce
 * prób. Lepiej działa dłuższe hasło, którego nie ma w żadnym wycieku.
 */

/**
 * 12 znaków zamiast 8. Osiem znaków łamie się dziś offline w godziny,
 * a hasło do tego CRM-a wpisuje się raz na tydzień — nie ma powodu
 * oszczędzać na długości.
 */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

/**
 * Hasła zakazane. Lista jest po polsku i po angielsku, bo stąd biorą się
 * hasła użytkowników tego systemu. Porównanie idzie po formie uproszczonej
 * (patrz `normalize`), więc jeden wpis `haslo` zatrzymuje też `Haslo123`,
 * `has-lo` i `haslo!!!`.
 */
const BLOCKLIST = new Set([
  // polskie
  "haslo", "mojehaslo", "tajnehaslo", "nowehaslo", "zmienhaslo",
  "zaq", "zaqwsx", "zaq12wsx", "polska", "warszawa", "krakow", "wroclaw",
  "gdansk", "poznan", "katowice", "lodz", "szczecin", "lublin", "bialystok",
  "matematyka", "polski", "angielski", "korepetycje", "korkigo", "nauczyciel",
  "uczen", "szkola", "student", "lekcja", "kocham", "kochanie", "misiek",
  "slonce", "motyl", "kwiatek", "dupa", "kurwa", "pierdole", "jebac",
  "mateusz", "michal", "tomasz", "krzysztof", "andrzej", "piotr", "pawel",
  "marcin", "jakub", "lukasz", "adam", "anna", "maria", "katarzyna",
  "malgorzata", "agnieszka", "barbara", "ewa", "magdalena", "monika",
  "legia", "wisla", "lech", "slask", "ruch", "cracovia", "pogon",
  // angielskie i uniwersalne
  "password", "passwd", "pass", "secret", "letmein", "welcome", "admin",
  "administrator", "root", "user", "guest", "test", "demo", "login",
  "qwerty", "qwertyuiop", "asdf", "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm",
  "abc", "abcd", "abcdef", "abcdefgh", "iloveyou", "sunshine", "princess",
  "dragon", "monkey", "football", "baseball", "superman", "batman",
  "master", "shadow", "michael", "jennifer", "jordan", "hunter", "trustno",
  "freedom", "whatever", "qazwsx", "qweasd", "qweasdzxc", "1qaz2wsx",
  "changeme", "default", "temp", "temporary", "newpassword", "oldpassword",
  "google", "facebook", "internet", "computer", "samsung", "iphone",
  "starwars", "pokemon", "minecraft", "chocolate", "summer", "winter",
  "january", "december", "august", "september",
]);

/**
 * Forma uproszczona do porównania z listą: bez wielkości liter, bez znaków
 * innych niż litery i cyfry, bez ogona cyfr. Dzięki temu `Haslo-123!`
 * i `haslo` to dla nas to samo hasło, a lista może być krótka.
 */
function normalize(password: string): string {
  const letters = password
    .toLowerCase()
    // `ł` jako jedyna polska litera nie rozkłada się przez NFD — nie ma formy
    // „l + znak łączący". Bez tej linii `HASŁO!!!` zostawało jako „haso"
    // i omijało listę zakazanych.
    .replaceAll("ł", "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // ą → a, ś → s …
    .replace(/[^a-z0-9]/g, "");
  return letters.replace(/\d+$/, "");
}

export type PasswordProblem =
  | "TOO_SHORT"
  | "TOO_LONG"
  | "COMMON"
  | "DIGITS_ONLY"
  | "REPEATED";

/** `null` = hasło do przyjęcia. */
export function checkPassword(password: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "TOO_SHORT";
  // Górny limit nie jest wymaganiem bezpieczeństwa, tylko ochroną przed
  // kosztem bcrypta na wielomegabajtowym wejściu.
  if (password.length > MAX_PASSWORD_LENGTH) return "TOO_LONG";
  if (/^\d+$/.test(password)) return "DIGITS_ONLY";
  if (new Set(password).size <= 2) return "REPEATED";

  const core = normalize(password);
  // Po odcięciu cyfr zostaje pustka — czyli hasło było samym ciągiem cyfr
  // z ozdobnikami. Traktujemy jak zbyt proste.
  if (core.length === 0) return "COMMON";
  if (BLOCKLIST.has(core)) return "COMMON";
  return null;
}

export function passwordProblemMessage(problem: PasswordProblem): string {
  switch (problem) {
    case "TOO_SHORT":
      return `Hasło musi mieć min. ${MIN_PASSWORD_LENGTH} znaków.`;
    case "TOO_LONG":
      return `Hasło nie może być dłuższe niż ${MAX_PASSWORD_LENGTH} znaków.`;
    case "DIGITS_ONLY":
      return "Hasło z samych cyfr jest za słabe — dopisz litery.";
    case "REPEATED":
      return "Hasło składa się z powtórzeń — użyj czegoś mniej regularnego.";
    case "COMMON":
      return "To hasło jest zbyt popularne i trafia na listy zgadywanych.";
  }
}

/** Opis reguł dla UI — żeby treść podpowiedzi nie rozjechała się z kodem. */
export const PASSWORD_HINT =
  `Min. ${MIN_PASSWORD_LENGTH} znaków. Najprościej o długie: trzy–cztery ` +
  "przypadkowe słowa połączone w całość są mocniejsze niż „Haslo123!”.";
