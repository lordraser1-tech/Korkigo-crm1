# KorkiGO CRM — materiał do audytu

Stan na commit `3658146`, gałąź `claude/crm-nextjs-cloude-x1u8po`.
Repozytorium: `lordraser1-tech/Korkigo-crm1`.

Ten dokument jest **podkładem pod audyt**, nie podsumowaniem marketingowym.
Przy każdej regule stoi, **gdzie siedzi w kodzie** i **jak ją sprawdzić**,
żeby audytor mógł zweryfikować, a nie uwierzyć. Na końcu jest sekcja
„Czego NIE sprawdzono" — równie ważna jak reszta.

---

## 1. Czym to jest

System do zarządzania korepetycjami z polskiego dla Ukraińców i Białorusinów.
Dwie role: `ADMIN` (właściciel) i `TEACHER`.

| | |
|---|---|
| Stack | Next.js 15 (App Router), React 19, TypeScript, Prisma 6, PostgreSQL |
| Kod aplikacji | ~22 000 linii (`src/`) |
| Kod testów | ~6 600 linii (`tests/`) |
| Modele w bazie | 27 modeli + 10 typów wyliczeniowych |
| Migracje | 12 |
| Trasy API | 29 |
| Strony paneli | 29 |
| Serwisy (logika + uprawnienia) | 20 plików |
| Testy | **398, wszystkie przechodzą** |

### Jak uruchomić i sprawdzić samemu

```bash
git clone <repo> && cd Korkigo-crm1
npm install
cp .env.example .env          # uzupełnij DATABASE_URL i AUTH_SECRET
npx prisma migrate deploy
npm run db:seed:demo          # dane demonstracyjne do oglądania

npm test                      # 398 testów (wymaga .env.test — patrz README)
npm run typecheck             # tsc --noEmit
npm run lint
npm run build
```

Konta w danych demonstracyjnych: admin z `.env`, nauczyciele
`anna.kowalska@korkigo.pl` i `piotr.nowak@korkigo.pl` (hasło `nauczyciel123`).

---

## 2. Kluczowa zasada architektury

**Uprawnienia żyją w warstwie serwisowej, nigdy w komponentach.**

`src/app/api/**` (REST) i `src/app/actions/**` (Server Actions) to cienkie
warstwy wejścia — obie wołają **te same funkcje serwisowe**. Nie da się więc
obejść reguły, uderzając w API zamiast w panel.

Każda funkcja serwisowa przyjmuje `Actor` (`ADMIN` albo `TEACHER`
z `teacherProfileId`) i **sama zawęża zapytanie**.

**Jak sprawdzić — i co z tego wyjdzie.** Poniższe polecenia **nie** zwracają
pustki. Trzy miejsca wyłamują się z reguły i każde ma powód; audytor powinien
je ocenić, a nie przeoczyć.

```bash
grep -L "requireActor\|CRON_SECRET\|TELEGRAM_WEBHOOK" $(find src/app/api -name route.ts)
```

Zwraca **trzy trasy bez `requireActor()`**:

| Trasa | Dlaczego bez strażnika |
|---|---|
| `/api/auth/login` | sesja dopiero powstaje — nie ma czego sprawdzać |
| `/api/auth/logout` | wylogowanie bez sesji to operacja pusta, nie dziura |
| `/api/google/callback` | Google przekierowuje przeglądarkę i **nie da się tu polegać na ciasteczku** |

Trzeci przypadek jest wart osobnego spojrzenia. Tożsamość bierze się
z **podpisanego, krótkotrwałego `state`** (JWT HS256, `purpose` + `teacherId`),
który powstaje w `startCalendarConnect()` — a ta funkcja **wymaga `Actor`**.
Callback weryfikuje podpis i ważność (`jwtVerify`), więc podstawienie powrotu
pod cudze konto wymagałoby podrobienia podpisu. Warto to sprawdzić samodzielnie
w `src/lib/services/calendar-sync.ts`.

```bash
grep -rn "prisma\." src/app/api/ src/app/actions/
```

Zwraca **trzy wystąpienia, wszystkie na ścieżce logowania**
(`api/auth/login/route.ts`, `actions/auth.ts` ×2): odczyt użytkownika po
adresie e-mail, zanim sesja w ogóle istnieje. Poza logowaniem żadna warstwa
wejścia nie pyta bazy z pominięciem serwisu.

```bash
grep -rn "queryRaw\|executeRaw" src/        # pusto — surowy SQL tylko w tests/helpers/db.ts
grep -rn "dangerouslySetInnerHTML" src/      # jedno trafienie, w KOMENTARZU (src/lib/qr.ts)
```

### Cudzy rekord daje 404, nie 403

Świadome: 403 potwierdzałoby, że rekord istnieje. `NotFoundError`
(`src/lib/errors.ts`) nie zdradza nawet tego.

---

## 3. Granica ról — co nauczyciel może, a czego nie

To jest sedno systemu i główny przedmiot audytu.

**Nauczyciel widzi:** swoich uczniów, swoje lekcje, swoją stawkę, swoje
zarobki, swoje wypłaty, swoje notatki, materiały swoich przedmiotów.

**Nauczyciel NIE widzi:**

| Czego nie widzi | Gdzie wymuszone |
|---|---|
| Cen uczniów (`StudentRate`) | `students.selectFor` — pole nie jest **pobierane z bazy**, nie tylko ukrywane |
| Kwot odwołania | `lessons.mapLesson` zwraca `null` — przy progu 100% kwota JEST ceną ucznia |
| Stawek i danych innych nauczycieli | zakres w `teachers.ts`, cudzy `teacherId` → 404 |
| Lekcji i uczniów innych nauczycieli | `lessons.lessonScope`, `students` |
| Rozliczeń, rachunków, wpłat | `billing.ts` — cały moduł `assertAdmin` |
| Kwot zaległości | `getPaymentFlags()` zwraca sam enum `OK`/`OVERDUE` |
| Ewidencji PIT i limitu NDG | `evidence.ts`, `ndg.ts` — tylko ADMIN |
| Dziennika bezpieczeństwa | `security-log.ts` — tylko ADMIN |
| Kto oznaczył jego wypłatę | `payouts.ts` |
| Pozostałych odbiorców wiadomości | `messages.mapMessage` zwraca pustą tablicę |

**Świadomy wyjątek:** nauczyciel wie, że uczeń zalega (flaga `OVERDUE`),
ale nie wie **ile**. Granica postawiona celowo.

**Jak sprawdzić:** `tests/authorization.test.ts` (29 testów) plus próba na
żywo — zalogować się jako nauczyciel i uderzyć w API po identyfikatorze
cudzego rekordu.

---

## 4. Moduły — co jest i gdzie

| Moduł | Serwis | Panel | Testy |
|---|---|---|---|
| Uczniowie | `students.ts` | `/admin/uczniowie`, `/nauczyciel/uczniowie` | `authorization` |
| Nauczyciele | `teachers.ts` | `/admin/nauczyciele` | `authorization` |
| Przedmioty, poziomy, stawki | `subjects.ts` | `/admin/przedmioty` | `subjects` (17) |
| Lekcje, odwołania, serie | `lessons.ts` + `policy.ts` | `/admin/lekcje`, `/nauczyciel/kalendarz` | `lessons` (18), `policy` (12) |
| Grafik i dyspozycyjność | `schedule.ts`, `teachers.ts` | `/*/grafik` | `schedule` (21), `availability` (14) |
| Rozliczenia, rachunki, wpłaty | `billing.ts` (1416 linii) | `/admin/rachunki`, `/admin/platnosci` | `billing` (36) |
| Wypłaty nauczycieli | `payouts.ts` | `/admin/rozliczenia` | `payouts` (15) |
| Speaking Club | `speaking-club.ts` | karta ucznia | `speaking-club` (8) |
| Przypomnienia (Telegram/SMS) | `reminders.ts` | cron | `reminders` (15) |
| Kalendarz Google | `calendar-sync.ts` | karta nauczyciela | `calendar-sync` (16) |
| Limit NDG i statystyki | `ndg.ts` | `/admin/ndg` | `ndg` (26) |
| Ewidencja przychodu (PIT-36) | `evidence.ts` | `/admin/ewidencja` | `evidence` (10) |
| Wiadomości | `messages.ts` | `/*/wiadomosci` | `messages` (15) |
| Notatki z lekcji | `lesson-notes.ts` | `/*/notatki` | `lesson-notes` (23) |
| Baza wiedzy | `knowledge-base.ts` | `/*/baza-wiedzy` | `knowledge-base` (16) |
| RODO | `privacy.ts` | `/admin/bezpieczenstwo` | `privacy` (14) |
| Bezpieczeństwo logowania | `login-guard.ts`, `security-log.ts`, `two-factor.ts` | `/admin/bezpieczenstwo` | 5 plików (54) |

---

## 5. Niezmienniki finansowe

Rzeczy, których naruszenie oznacza błąd w pieniądzach. Wszystkie mają test.

- **Numeracja rachunków** `1/09/2026` jest ciągła i resetuje się co miesiąc;
  numer nadawany **w transakcji**, anulowany rachunek **nie zwalnia numeru**
- **Jedna lekcja na jednym rachunku** — wymuszone unikatem w bazie
  (`InvoiceItem.lessonId @unique`), nie tylko kodem
- **Lekcja na nieanulowanym rachunku jest zamrożona** — nie da się zmienić
  terminu ani statusu (`assertNotInvoiced`)
- **Lekcja rozliczona wypłatą też jest zamrożona** (`assertNotPaidOut`) —
  inaczej dałoby się skasować lekcję, za którą pieniądze już wyszły
- **Rachunków nie usuwamy** — `cancelInvoice()` zmienia status i zwalnia lekcje
- **Dane wystawcy to snapshot** przy wystawieniu — późniejsza zmiana nie
  przepisuje wydanych dokumentów
- **Lekcja trafia na jedną wypłatę** — `teacherPayoutId` przypisywany
  w transakcji razem z utworzeniem wypłaty
- **Zapis lekcji bez stawki nauczyciela I ceny ucznia jest odrzucany**
  (`resolveLessonRates`) — nie ma lekcji „za darmo"
- **Nauczycielowi należy się wypłata za nieobecność, ale nie za odwołanie** —
  nawet gdy uczeń zapłacił karę
- **Żaden próg regulaminu nie stoi poza `policy.ts`** — ani w serwisach,
  ani w UI

**Jak sprawdzić:** `npx vitest run tests/billing.test.ts tests/payouts.test.ts tests/policy.test.ts`

> **Sprostowanie po audycie zewnętrznym (F07).** Powyższej listy **brakuje
> najważniejszego niezmiennika**: kwota raz naliczona ma zostać niezmienna.
> Lekcja nie utrwala ceny ucznia ani stawki nauczyciela — rozliczenia czytają
> wartości **bieżące**, więc zmiana stawki przepisuje historię. Tego
> niezmiennika nie postawiłem, więc i testu nie ma. Szczegóły:
> [`ODPOWIEDZ-NA-AUDYT.md`](ODPOWIEDZ-NA-AUDYT.md).

---

## 6. Bezpieczeństwo — reguły i gdzie siedzą

### Uwierzytelnianie i sesja

| Reguła | Plik |
|---|---|
| Hasła bcrypt, koszt 12 | `src/lib/password.ts` |
| Sesja = JWT w ciasteczku `httpOnly`, `sameSite=lax`, `secure` na produkcji | `src/lib/session.ts` |
| **Zmiana hasła unieważnia wszystkie sesje** (`sessionsValidFrom` vs `iat`) | `session.ts`, `auth.ts` |
| Blokada konta po 10 nieudanych próbach, **czasowa (15 min)** | `login-guard.ts` |
| Obie ścieżki logowania porównują hash **także dla nieistniejącego konta** | stały `DUMMY_HASH_PROMISE` |
| TOTP (RFC 6238, własna implementacja) + 8 jednorazowych kodów zapasowych | `totp.ts`, `two-factor.ts` |
| Sekret TOTP w bazie **zaszyfrowany** (AES-256-GCM) | `crypto.ts` |
| Drugi składnik obowiązuje **także w REST** | `/api/auth/login`, pole `code` |
| Kod QR rysowany **na serwerze**, nie przez zewnętrzną usługę | `qr.ts` |

> **Dlaczego blokada jest czasowa:** trwałe zamknięcie konta byłoby narzędziem
> do odcięcia nauczyciela od pracy cudzymi próbami.
>
> **Dlaczego kody zapasowe są SHA-256, nie bcrypt:** mają 50 bitów entropii
> z generatora, a 8 porównań bcryptem kosztem 12 to ~2,5 s CPU na jedną próbę
> logowania — wolno dla użytkownika i tani sposób na obciążenie serwera.

### Polityka haseł

`src/lib/password-policy.ts` — **jedno miejsce**, zgodne z NIST SP 800-63B:
min. 12 znaków + lista zakazanych, **bez** wymuszania wielkich liter i znaków
specjalnych (te produkują `Haslo123!`).

Obowiązuje każdą ścieżkę: zakładanie konta, zmianę własnego hasła, reset przez
admina i seed. **Seed nie ma domyślnego hasła admina.**

### Nagłówki i CSP

- CSP z **nonce'em losowanym przy każdej odpowiedzi** (`src/middleware.ts`),
  `script-src` bez `'unsafe-inline'`, `strict-dynamic`
- `frame-ancestors 'none'` + `X-Frame-Options: DENY`
- nosniff, Referrer-Policy, Permissions-Policy; HSTS tylko na produkcji
- **Strona 404 jest `force-dynamic`** — do statycznego HTML-a nie da się
  wstrzyknąć nonce'a

**Jak sprawdzić:** `curl -I https://…/login | grep -i content-security-policy`
dwa razy — nonce musi się różnić.

### Odporność na nadużycia

- Limit zapytań w middleware: logowanie 10/min, reszta API 120/min
- Limit rozmiaru ciała żądania 256 kB, **przed** limitem zapytań
- Cron i webhook Telegrama chronione sekretem, nie sesją

### Logi i dane osobowe

`logError()` (`src/lib/log.ts`) zapisuje **tylko** pierwszy wiersz komunikatu,
kod błędu, nazwy pól (nigdy wartości) i ramki stosu. Komunikat Prismy niesie
wartości pól — imię ucznia, e-mail i telefon opiekuna — a logi hostingu nie są
objęte retencją ani umową powierzenia.

Każdy wpis dostaje ośmioznakowy identyfikator pokazywany też użytkownikowi.

### RODO

- Eksport danych ucznia (JSON) — **bez stawek nauczyciela i marży**, bo to
  dane firmy, nie osoby, której dotyczy żądanie
- Anonimizacja nadpisuje dane osobowe, **w tym `Invoice.buyerSnapshot`**
  (osobna kopia imienia i kontaktu — anonimizacja, która go pomija, jest pozorna)
- Dokumenty księgowe zostają z pustą tożsamością
- Przegląd retencji wypisuje kandydatów, ale **aplikacja świadomie nie kasuje
  nic sama**
- Adresy IP z dziennika kasują się po 90 dniach

---

## 7. Co było zepsute i zostało naprawione

Sekcja dla audytora ważniejsza niż lista funkcji — pokazuje, czego szukano
i co znaleziono.

### Błędy znalezione przez testy empiryczne (nie przez przegląd kodu)

| Błąd | Skutek | Commit |
|---|---|---|
| `PATCH /api/lessons/[id]` ze statusem `CANCELLED` wołał `updateLesson`, nie `cancelLesson` | **omijał cały regulamin odwołań** — lekcja wychodziła za darmo, bez daty zgłoszenia | `abc4789` |
| `mapLesson` nie rozróżniał roli | **kwota odwołania wyciekała nauczycielowi** — przy progu 100% to dokładnie cena ucznia | `abc4789` |
| Lekcja rozliczona wypłatą dawała się skasować | wypłata zostawała z kwotą bez pokrycia | `abc4789` |
| `billingSettings.upsert` na ścieżce **odczytu** | dwa równoległe rachunki → surowy błąd Prismy, 500 | `abc4789` |
| Walidacja dat sprawdzała tylko układ cyfr | `2026-13-45` przechodziło, `Date.UTC` przewijało to na 2027-02-14 — **operacja wykonywała się na innym dniu i kończyła sukcesem** | `d53bc67` |
| `SMS_PROVIDER=log` raportował sukces | przypomnienie zapisywało się jako **wysłane, choć nikt go nie dostał** | `14baef1` |
| Karta kalendarza pokazywała „połączony" i „nieskonfigurowany" naraz | po rotacji kluczy nauczyciel **nie miał jak się rozłączyć** | `346b8ad` |
| Pełny obiekt błędu w `console.error` | imiona, e-maile i telefony w logach hostingu | `bef7b15` |
| Seed miał domyślne hasło admina `admin12345` | wdrożenie bez ustawienia zmiennej = konto z pełnym dostępem na haśle z publicznego repozytorium | `bef7b15` |
| Domyślna strona 404 generowana statycznie | po włączeniu nonce'a **cała strona leciała na naruszeniach CSP** | `bef7b15` |
| `ł` nie rozkłada się przez `normalize("NFD")` | `HASŁO!!!` omijało listę zakazanych haseł | `bef7b15` |
| Maska numeru telefonu zjadała cyfrowy ogon tokena | token zostawał w logu z czytelnym początkiem | `bef7b15` |

### Podatności zależności

`npm audit`: **12 → 7**. `postcss` (4× high) i `deepmerge-ts` (1× high)
domknięte przez `overrides` w `package.json`, bez majorowego skoku Next-a
i Prismy.

Zostaje `braces`/`micromatch` (przez `eslint-config-next`) i `@vitest/mocker` —
**tylko zależności deweloperskie**, nie trafiają na produkcję; dla `braces`
nie ma jeszcze wersji z poprawką.

---

## 8. Co sprawdzono i wyszło czysto

Pełny audyt bezpieczeństwa przeprowadzony metodą empiryczną: aplikacja
postawiona w trybie produkcyjnym na zaseedowanej bazie, atakowana sesją
nauczycielki Anny przeciwko rekordom Piotra.

- **IDOR — nie przechodzi nigdzie.** Cudzy uczeń, lekcja, profil, wiadomość,
  kalendarz: 404 albo 403 na każdym endpointcie przyjmującym identyfikator
- **Wszystkie endpointy admina odbijają nauczyciela** — rachunki, wpłaty,
  zaległości, ewidencja PIT (także CSV), ustawienia, NDG, finanse, zakładanie
  kont: komplet 403
- **Stawki nie wyciekają w żadnym polu** — zrzucony pełny JSON z 11 endpointów
  dostępnych nauczycielce (18 431 bajtów), przeszukany pod kątem cen uczniów
  i cudzych stawek. Zero trafień
- **Eskalacja przez podmianę pól zablokowana** — próby ustawienia sobie
  uprawnień, podmiany stawki, przepisania ucznia: 403, a nadmiarowe pola Zod
  odrzuca po cichu
- **SQL injection niemożliwe** — jedyne surowe zapytanie to `$executeRawUnsafe`
  w `tests/helpers/db.ts` ze stałą listą tabel
- **XSS — brak wektora**: zero `dangerouslySetInnerHTML`, `innerHTML`, `eval`,
  `new Function`
- **Sekrety poza repozytorium** — `git log --all --full-history` na `.env*`
  nie zwraca ani jednego commita
- **Błędy nie zdradzają szczegółów** — użytkownik dostaje `INTERNAL_ERROR`,
  stack trace zostaje w konsoli

---

## 9. Świadome ograniczenia

Nie są błędami — są decyzjami. Audytor powinien je ocenić, nie odkryć.

| Rzecz | Dlaczego tak |
|---|---|
| Licznik limitu zapytań w pamięci procesu | middleware chodzi na Edge, gdzie Prisma nie działa — wspólnego stanu nie da się tam zrobić. Blokada logowania jest osobna i **siedzi w bazie** |
| Klucz limitu z `X-Forwarded-For` | bez proxy nagłówek da się podrobić — **aplikacji nie wolno wystawić bezpośrednio** |
| Limit rozmiaru z `Content-Length` | middleware nie policzy bajtów bez zjedzenia strumienia; żądanie „chunked" ominie próg — limit hostingu zostaje drugą barierą |
| `style-src` z `'unsafe-inline'` | React wstawia style atrybutem, którego nonce nie obejmuje. Stylem nie wykonasz kodu |
| Synchronizacja Google **jednokierunkowa** | CRM jest źródłem prawdy; zmiana w telefonie nie wraca do bazy i UI mówi to wprost |
| W zdarzeniu kalendarza **nie ma kwot** | kalendarz bywa współdzielony i eksportowany |
| Aplikacja nie kasuje danych sama (RODO) | okres przechowywania zależy od podstawy prawnej — decyduje administrator danych |
| Zero stawek podatkowych w kodzie (NDG, PIT) | moduły liczą to, co wpisze użytkownik; w UI stoi jawne zastrzeżenie |

---

## 9a. Wynik audytu zewnętrznego (6.10.2026)

Projekt przeszedł niezależny audyt. Badana kopia odpowiadała commitowi
`333cf94`, czyli 15 commitów wstecz, co audytor zaznaczył. **22 z 34 ustaleń
są nadal aktualne**, w tym brak utrwalania stawek przy lekcji, niedziałająca
kontrola dwóch miejsc po przecinku w kwotach i wydruk rachunku korzystający
z bieżących ustawień zamiast snapshotu.

Pełna weryfikacja każdego ustalenia wobec aktualnego kodu:
[`ODPOWIEDZ-NA-AUDYT.md`](ODPOWIEDZ-NA-AUDYT.md). **Czytaj ją razem z tym
dokumentem** — trzy twierdzenia stąd zostały tam sprostowane.

## 10. Czego NIE sprawdzono

Uczciwa lista białych plam.

- **Nie było audytu zewnętrznego ani testu penetracyjnego** przez osobę
  trzecią. Wszystko powyżej sprawdziłem ja, czyli ten sam podmiot, który pisał kod
- **Nie testowano obciążeniowo** — nie wiadomo, jak system zachowa się przy
  setkach równoległych żądań
- **Nie weryfikowano losowości `AUTH_SECRET`** — to zależy od tego, jak
  zostanie wygenerowany przy wdrożeniu
- **Nie testowano odtworzenia kopii zapasowej** — aplikacja ich nie robi,
  to zadanie hostingu i nie zostało jeszcze wykonane
- **Reguły podatkowe (NDG, PIT-36) nie były weryfikowane przez księgowego**
- **Dokumenty RODO nie istnieją** — polityka prywatności, podstawa prawna,
  umowy powierzenia
- **Przypomnienia SMS nie były testowane u prawdziwego dostawcy** — tylko
  w trybie `log`
- **Synchronizacja Google nie była testowana na prawdziwym koncie** — tylko
  w trybie `log`
- **Nie ma monitoringu ani alertów** — żadnego powiadomienia, gdy cron
  przestanie chodzić albo wzrośnie liczba błędów
- **Nie ma endpointu healthcheck**
- **Ten dokument powstał automatycznie z repozytorium**, ale jego oceny
  („czysto", „zablokowane") pochodzą od tego samego podmiotu, który pisał kod.
  Polecenia z sekcji 13 są po to, żeby każdą z nich dało się podważyć

---

## 11. Czego jeszcze nie ma w funkcjach

- **Wysyłka notatki do ucznia** — jest kopiowanie do schowka
- **Automatyczne wezwania do zapłaty** i pełne raporty (faza 3)
- **Wsparcie AI przy notatkach** (faza 4)
- **Aplikacja mobilna** — odłożona świadomie. Wymagałaby uwierzytelniania
  tokenem (dziś sesja to ciasteczko `httpOnly`, którego apka nie użyje)
  i domknięcia REST-a: brak endpointów dla wypłat, Speaking Clubu,
  dyspozycyjności i zapisu przedmiotów

---

## 12. Chronologia

| Commit | Data | Co |
|---|---|---|
| `13166ed` | 2026-09-20 | Fundament: Next.js, Prisma, rozdzielenie ról |
| `4dbcd37` | 2026-09-24 | Faza 2: płatności, zaległości, rachunki z numeracją |
| `fc5bb81` | 2026-09-24 | Grafik i dyspozycja ze statusem płatności |
| `253d290` | 2026-09-24 | Moduł NDG: limit z prognozą i statystyki |
| `47c2b80` | 2026-09-25 | Wiadomości od administratora |
| `333cf94` | 2026-09-25 | Temat zajęć przy lekcji |
| `bb6597b` | 2026-09-25 | Przedmioty i stawki per poziom, Speaking Club |
| `3c793c1` | 2026-09-25 | Odwołania wg regulaminu, wypłaty, przypomnienia |
| `abc4789` | 2026-09-25 | **Audyt poprawności: 4 błędy** (obejście regulaminu, wyciek ceny) |
| `346b8ad` | 2026-09-27 | Kalendarz Google, ewidencja PIT-36 |
| `a9f1746` | 2026-09-30 | Przegląd bezpieczeństwa — 6 poprawek |
| `d39d84a` | 2026-09-30 | Limit zapytań, dziennik zdarzeń |
| `14baef1` | 2026-10-04 | SMS w trybie log, RODO, drugi składnik |
| `95766e0` | 2026-10-04 | Kod QR przy 2FA |
| `d53bc67` | 2026-10-04 | Schematy Zod, daty sprawdzane kalendarzem |
| `bef7b15` | 2026-10-04 | Punkty 3, 6, 7, 9, 10 z audytu bezpieczeństwa |
| `86e30db` | 2026-10-05 | Notatki z lekcji |
| `6795a6f` | 2026-10-05 | Baza wiedzy per przedmiot |
| `3658146` | 2026-10-05 | Lista kontrolna wdrożenia |

---

## 13. Jak przeprowadzić własny audyt

### Warstwa statyczna

```bash
npm audit
npm run typecheck && npm run lint && npm test

# Czy jakaś trasa API nie ma strażnika?
# Oczekiwane: 3 trasy (login, logout, google/callback) — wyjaśnienie w sekcji 2
grep -L "requireActor\|CRON_SECRET\|TELEGRAM_WEBHOOK" $(find src/app/api -name route.ts)

# Czy gdzieś omijamy serwis i pytamy bazę wprost z warstwy wejścia?
# Oczekiwane: 3 wystąpienia, wszystkie na ścieżce logowania
grep -rn "prisma\." src/app/api/ src/app/actions/

# Czy jest surowy SQL poza testami?   Oczekiwane: pusto
grep -rn "queryRaw\|executeRaw" src/

# Czy jest wstrzykiwanie HTML?        Oczekiwane: jedno trafienie, w komentarzu
grep -rn "dangerouslySetInnerHTML\|innerHTML\|eval(\|new Function" src/

# Czy sekrety kiedykolwiek trafiły do repozytorium?
git log --all --full-history -- .env .env.local .env.production
```

### Warstwa dynamiczna

```bash
npm run build && npm start
# zalogować się jako nauczyciel, pobrać ciasteczko sesji, a potem:
#  - uderzyć w /api/students/<id-cudzego-ucznia>        → oczekiwane 404
#  - uderzyć w /api/invoices                            → oczekiwane 403
#  - zrzucić JSON ze wszystkich dostępnych endpointów i przeszukać
#    pod kątem cen uczniów oraz stawek innych nauczycieli
#  - sprawdzić nagłówek CSP dwa razy — nonce musi się różnić
#  - wysłać POST z ciałem 3 MB                          → oczekiwane 413
```

### Dokumentacja projektu

- `README.md` — opis funkcji i reguł z perspektywy użytkownika
- `CLAUDE.md` — niezmienniki i decyzje projektowe z uzasadnieniem
- `WDROZENIE.md` — lista kontrolna wdrożenia
- `prisma/schema.prisma` — model danych z komentarzami
