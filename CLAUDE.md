# KorkiGO CRM — kontekst projektu

System do zarządzania korepetycjami z polskiego dla Ukraińców i Białorusinów
(korkigo.pl). Zastępuje ręczne śledzenie uczniów, nauczycieli, grafiku i płatności.

## Stack

- **Backend + baza:** Node.js/TypeScript, PostgreSQL, Prisma (schemat: `prisma/schema.prisma`)
- **Frontend:** Next.js (React), panel admina i panel nauczyciela w jednej aplikacji
- **Auth:** logowanie email + hasło, role: `ADMIN`, `TEACHER` (patrz niżej)
- **Hosting (docelowo):** do ustalenia — Railway lub Supabase najprościej łączą Postgres z hostingiem

## Role i uprawnienia — KRYTYCZNE

Dwie role: `ADMIN` (właściciel — Mateusz) i `TEACHER`.

**Admin** widzi i ustala wszystko: stawki uczniów, stawki nauczycieli, wszystkich
uczniów i nauczycieli, wszystkie lekcje, płatności.

**Nauczyciel** ma WŁASNE konto i widzi tylko:
- swoich przypisanych uczniów (dodaje ich sam)
- swoje lekcje — może oznaczać status (zrealizowana/odwołana/nieobecność)
- swoją stawkę (`TeacherProfile.ratePerLesson`) i swoje zarobki (wyliczane z liczby
  zrealizowanych lekcji × jego stawka)

**Nauczyciel NIE MOŻE zobaczyć:**
- cen ucznia (`StudentRate` — per przedmiot/poziom)
- stawek ani danych innych nauczycieli
- lekcji/uczniów przypisanych do innych nauczycieli

To musi być wymuszone **na poziomie API/serwera**, nie tylko ukryte w UI —
endpointy dla roli `TEACHER` nigdy nie powinny zwracać cen ucznia
(`StudentRate`) ani rekordów innego `teacherId`. Stawki ustala wyłącznie
admin, ręcznie, w panelu admina.

## Stan: faza 1 gotowa, faza 2 rozliczeniowa gotowa, faza 3 w części limitu NDG gotowa

Zrobione: kartoteka uczniów, kartoteka nauczycieli, kalendarz lekcji
(cykliczne + jednorazowe, statusy: zaplanowana/zrealizowana/odwołana/nieobecność),
panel nauczyciela (dodawanie uczniów, odznaczanie lekcji, podgląd zarobków),
panel admina (pełny widok + ręczne ustawianie stawek), a z fazy 2 — płatności,
zaległości i rachunki z automatyczną numeracją gotowe do druku oraz zakładka
„Grafik i dyspozycja” spinająca dyspozycyjność, zapisy uczniów i status
płatności każdej lekcji.

Doszły do tego: regulamin odwołań z naliczaniem wg wyprzedzenia zgłoszenia,
zakres edycji lekcji cyklicznej, dyspozycyjność per konkretny dzień wraz
z kopiowaniem układu tygodnia, rejestr wypłat dla nauczycieli, przypomnienia
o lekcji (Telegram/SMS), widok miesięczny kalendarza, synchronizacja
z Google Calendar (jednokierunkowa, per nauczyciel) oraz ewidencja przychodu
pod PIT-36 (CSV + wydruk).

Wszystkie pozycje z menu makiety już działają.

Makieta panelu nauczyciela już istnieje (Claude Artifact — Design canvas),
z menu: Pulpit, Moi uczniowie, Kalendarz lekcji, Moje wypłaty, Notatki z lekcji,
Baza wiedzy, Wiadomości, Ustawienia.

## Kolejne fazy (nie teraz, ale schemat już to przewiduje)

- **Faza 2 (zostało):** wysyłka notatki do ucznia (dziś jest samo kopiowanie
  do schowka)
- **Faza 3 (zostało):** automatyczne wezwania do zapłaty, pełne raporty —
  **to dotyka przepisów podatkowych; reguły/wzory do zweryfikowania
  z księgowym przed wdrożeniem w produkcji**
- **Aplikacja mobilna (Android/iOS):** odłożona świadomie. Gdy wróci, pierwsze
  do zrobienia jest uwierzytelnianie tokenem (dziś sesja to ciasteczko
  httpOnly, którego apka nie użyje) i domknięcie REST-a: nie ma endpointów dla
  wypłat, Speaking Clubu, dyspozycyjności ani zapisu przedmiotów
- **Faza 4:** wsparcie AI przy wpisywaniu notatek z lekcji

## Start

```bash
npm install
npx prisma migrate dev --name init
npx prisma studio   # podgląd bazy w przeglądarce
```

Wymaga `DATABASE_URL` w `.env` (lokalny Postgres albo np. darmowy instance na Supabase/Neon).

## Struktura kodu (faza 1 — zaimplementowana)

Aplikacja Next.js (App Router) w `src/`. Kluczowa zasada: **uprawnienia żyją
w warstwie serwisowej**, nie w komponentach.

- `src/lib/auth.ts` — `Actor` (`ADMIN` albo `TEACHER` z `teacherProfileId`),
  `requireActor()` dla API, `requirePage()` dla stron.
- `src/lib/services/{students,teachers,lessons,finance}.ts` — cała logika
  i kontrola dostępu. Każda funkcja przyjmuje `Actor` i sama zawęża zapytanie.
  Ceny ucznia dla roli `TEACHER` nie są pobierane z bazy (`selectFor`),
  a cudzy rekord daje `NotFoundError` (404), nie 403.
- `src/lib/policy.ts` — progi regulaminu (odwołania, wypłaty). Kod pyta o wynik,
  nie o liczby; przy zmianie regulaminu ruszasz **tylko ten plik**, także w UI.
- `src/app/api/**` i `src/app/actions/**` — cienkie warstwy wejścia; obie wołają
  te same serwisy, więc nie da się obejść reguł przez API.
- `src/lib/datetime.ts` — konwersja `Europe/Warsaw` ↔ UTC. Lekcje cykliczne
  liczone na czasie ściennym, żeby przetrwały zmianę czasu.
- `tests/authorization.test.ts` — testy reguł z sekcji „Role i uprawnienia”.
  Przy zmianach w dostępie do danych **dopisz tam przypadek**.

Ścieżki paneli: `/admin/*` (admin) i `/nauczyciel/*` (nauczyciel), logowanie `/login`.

## Przedmioty, poziomy i stawki

`src/lib/services/subjects.ts`, panel `/admin/przedmioty`. Model zastąpił
pojedyncze `TeacherProfile.ratePerLesson` i `Student.ratePerLesson`:

- **Subject** → **SubjectLevel** (dowolna liczba poziomów per przedmiot),
- **TeacherRate** = stawka nauczyciela per poziom, **StudentRate** = cena
  ucznia per poziom (indywidualna, nie wspólna dla poziomu),
- **przedmiot i poziom są cechą LEKCJI** (`Lesson.subjectLevelId`), nie ucznia —
  jeden uczeń może brać kilka przedmiotów.

Niezmienniki:

- zapis lekcji bez stawki nauczyciela **i** ceny ucznia dla wybranej kombinacji
  jest odrzucany (`resolveLessonRates`) — nie chcemy lekcji „za darmo”,
- listę przedmiotów widzą obie role (nauczyciel potrzebuje jej do zapisu
  lekcji), ale **ceny uczniów są wyłącznie dla admina**, a stawki nauczyciela
  widzi on sam i admin,
- zarobki i statystyki liczą stawkę osobno dla każdej lekcji — stawka bywa inna
  dla różnych przedmiotów.

Testy: `tests/subjects.test.ts`.

## Speaking Club

`src/lib/services/speaking-club.ts`. Jeden darmowy udział za każde
`LESSONS_PER_SPEAKING_CLUB` (10) lekcji ZREALIZOWANYCH, liczonych **niezależnie
od przedmiotu**. Odznacza admin (każdemu) i nauczyciel (swoim uczniom); zapis
trzyma datę i kto odznaczył, a pomyłkę da się cofnąć. Widok nie zawiera kwot,
więc jest bezpieczny dla obu ról. Testy: `tests/speaking-club.test.ts`.

## Rozliczenia (faza 2) — reguły

Uczeń ma tryb rozliczeń `Student.billingMode`: `POSTPAID` (rachunek zbiorczy na
koniec miesiąca), `PER_LESSON` (rachunek po każdej lekcji) albo `PREPAID`
(pakiet z góry, lekcje zdejmują jednostki). Cała logika siedzi w
`src/lib/services/billing.ts` i jest **dostępna wyłącznie dla ADMIN-a**.

Status płatności lekcji liczy się **na żywo** z wpłat i lekcji
(`buildStudentBillingState`), a nie dopiero po wystawieniu rachunku:
PREPAID i PER_LESSON — wpłaty pokrywają lekcje chronologicznie; POSTPAID —
decyduje rachunek za dany miesiąc. Saldo ucznia to `wpłaty − wartość lekcji
zrealizowanych`, więc lekcja ponad opłacony pakiet od razu daje minus
(w fazie 1 saldo pokazywało wtedy zero — to był błąd).

Jedyny wyjątek to `getPaymentFlags()` — zwraca nauczycielowi sam enum
`OK` / `OVERDUE` dla **jego** uczniów, bez kwot, dat i numerów rachunków.
Ta granica jest świadoma: nauczyciel ma wiedzieć, że uczeń zalega, ale nie ile.

Niezmienniki, których nie wolno naruszyć przy zmianach:

- **kwota raz naliczona jest niezmienna.** Lekcja utrwala cenę ucznia
  (`Lesson.studentPrice`) i stawkę nauczyciela (`Lesson.teacherRate`) w chwili
  zapisu. Bez tego rozliczenia, zarobki, wypłaty, marża i statystyki czytały
  cennik BIEŻĄCY — podwyżka zmieniała zarobek za zamknięty miesiąc, a stara
  niezafakturowana lekcja dostawała nową cenę (audyt zewnętrzny, F07).
  **`RateLookup` wymusza to kształtem typu**: `teacherFor(lesson)`
  i `studentFor(lesson)` przyjmują lekcję, nie parę identyfikatorów, więc nie
  da się przez pomyłkę policzyć historii cennikiem. Jedyny dozwolony odczyt
  cennika bieżącego to `currentStudent()` i służy wyłącznie do wyceny pakietu,
  który powstaje TERAZ. Lekcje sprzed tej zmiany mają `null` i tylko dla nich
  wracamy do cennika — uzupełnienie ich dzisiejszą stawką utrwaliłoby błąd
  jako „historię". To samo dotyczy kary za odwołanie
  (`studentPriceForLesson` w `lessons.ts`),
- numeracja `1/09/2026` jest ciągła i resetuje się co miesiąc; numer nadaje się
  w transakcji, a anulowany rachunek **nie** zwalnia numeru,
- jedna lekcja może trafić na jeden rachunek (`InvoiceItem.lessonId` @unique),
- lekcja ujęta na nieanulowanym rachunku jest zamrożona (blokada w
  `lessons.updateLesson` i `deleteLesson`),
- rachunków nie usuwamy — `cancelInvoice()` zmienia status i zwalnia lekcje,
- dane wystawcy trafiają na rachunek jako snapshot przy wystawieniu —
  **także dane płatności**. `sellerSnapshot` to sklejony blok adresowy do
  nagłówka i nie da się z niego wyjąć pojedynczych pól, więc stopka wydruku
  brała numer konta, adnotację i stopkę z BIEŻĄCYCH ustawień; zmiana konta
  zmieniała wygląd dokumentu wystawionego pół roku wcześniej (audyt
  zewnętrzny, F19). Stąd osobne `bankAccountSnapshot`, `taxNoteSnapshot`
  i `footerSnapshot`. Rachunki sprzed tej zmiany mają je puste — wydruk
  pokazuje im wartości bieżące i **mówi to wprost** w panelu, zamiast udawać,
  że zna historyczne,
- **komunikat blokady zależy od roli** (`assertNotInvoiced`): admin dostaje
  numer rachunku, bo ma go odnaleźć i anulować; nauczyciel dostaje samą
  informację o rozliczeniu. Numer to metadana firmy, a nauczyciel nie
  dostaje numerów w żadnym zwykłym DTO — nie może ich poznawać przez treść
  błędu (F33),
- odczyt ustawień (`loadBillingSettings`) **nie zakłada rekordu** — powstaje on
  tylko przy zapisie przez admina. Wcześniej `upsert` na ścieżce odczytu
  zderzał się przy dwóch równoległych rachunkach i dawał 500,
- ile uczeń płaci za lekcję liczy `lessonChargeAmount()` z `policy.ts`, nie
  sama cena — odwołanie w terminie kosztuje zero, a odwołanie na ostatnią
  chwilę wchodzi do salda jak lekcja zrealizowana,
- do **salda** liczą się tylko lekcje naliczone, ale w trybie `PREPAID`
  jednostkę pakietu zajmuje też lekcja **zaplanowana** (`coverageAmount`) —
  inaczej nie dałoby się powiedzieć, które z umówionych lekcji są opłacone.

W karcie ucznia kafelek „Rozliczenia” pokazuje lekcje naliczone bez rachunku
wraz z kwotą i wystawia rachunek dokładnie na nie
(`createInvoiceForOutstandingLessons`).

Testy tych reguł: `tests/billing.test.ts`, a niezmienność historycznych kwot
osobno w `tests/historical-rates.test.ts`. Przy zmianach w rozliczeniach
**dopisz tam przypadek**.

## Grafik (zakładka „Grafik i dyspozycja”)

`src/lib/services/schedule.ts` składa tydzień z trzech rzeczy: okien
dyspozycyjności, lekcji i statusu płatności każdej lekcji.

- nauczyciel zawsze dostaje własny grafik — `resolveScope()` ignoruje cudze
  `teacherId` zamiast zwracać błąd, więc nie da się go obejść parametrem,
- admin widzi wszystkich i filtruje po nauczycielu; wolne godziny liczymy tylko
  wtedy, gdy w widoku jest jeden nauczyciel,
- wolne godziny to okna dyspozycyjności pocięte na sloty po 60 minut minus
  lekcje kolidujące terminem; lekcja odwołana zwalnia termin.

Temat zajęć (`Lesson.topic`) wpisuje się przy lekcji — w kalendarzu i w kafelku
grafiku, bez osobnej zakładki. Edycja idzie przez `setLessonTopic()`, osobną
ścieżkę od `updateLesson()`, bo temat wolno dopisać także do lekcji ujętej na
rachunku (zamrożenie dotyczy terminu i statusu, nie opisu). To krótka notka —
pełny szablon notatki z lekcji to wciąż `LessonNote` z fazy 2.

`getLessonPaymentStates()` (w `billing.ts`) odpowiada na pytanie „za którą lekcję
zapłacono”. Nauczyciel dostaje sam status — bez numeru rachunku i kwoty — i tylko
dla swoich lekcji. W trybie `PREPAID` jednostki pakietu idą chronologicznie:
opłacone → wystawione → brak pokrycia. Testy: `tests/schedule.test.ts`.

Dyspozycyjność jest **datowa** (`AvailabilitySlot.date` = północ czasu
warszawskiego), nie „na poniedziałki” — inaczej nie dałoby się odwołać jednego
tygodnia. Żeby to nie było mordęgą, `copyAvailabilityWeek()` powtarza układ
z zeszłego tygodnia, a `copyAvailabilityToMonth()` rozsiewa go na cały miesiąc;
oba pomijają duplikaty i nie kasują istniejących okien.
Testy: `tests/availability.test.ts`.

## Odwołania, nieobecności i zmiana terminu

`src/lib/policy.ts` + `lessons.cancelLesson()`. Niezmienniki:

- **żaden próg ani procent nie stoi poza `policy.ts`** — ani w serwisach,
  ani w komponentach; UI też czyta stamtąd opis progów,
- odwołanie zapisuje **wyłącznie** `cancelLesson()`. `updateLesson()` odrzuca
  status `CANCELLED` — bez tego każde wejście ustawiające status wprost
  (REST, akcja, skrypt) omijało regulamin i lekcja wychodziła za darmo,
- **nauczyciel nie dostaje kwot odwołania** (`mapLesson` zwraca mu `null`):
  przy progu 100% naliczenie JEST ceną ucznia, więc byłaby to furtka do
  `StudentRate`. Status i moment zgłoszenia widzi normalnie,
- liczy się moment **zgłoszenia** odwołania przez ucznia (`cancelledReportedAt`),
  nie moment kliknięcia w systemie — formularz ma osobne pole na tę datę,
- kwota z regulaminu zostaje obok faktycznej (`cancellationAutoAmount`
  vs `cancellationAmount`), więc korekta jest widoczna; korektę wprowadza
  **wyłącznie admin** i tylko z podanym powodem,
- nauczycielowi należy się wypłata za nieobecność, ale nie za odwołanie —
  nawet gdy uczeń zapłacił karę (`countsTowardsTeacherPayout`),
- `updateLesson(..., scope)`: `ONE` odczepia lekcję od serii
  (`detachedFromSeries`), `FUTURE` przesuwa kolejne o **różnicę**, pomijając
  lekcje odczepione i te na nieanulowanym rachunku.

Testy: `tests/policy.test.ts` (bez bazy) i `tests/lessons.test.ts`.

## Wypłaty dla nauczycieli

`src/lib/services/payouts.ts`, rejestr w `/admin/rozliczenia`, oznaczanie
w karcie nauczyciela. Niezmienniki:

- lekcja trafia na **jedną** wypłatę — `Lesson.teacherPayoutId` przypisujemy
  w transakcji razem z utworzeniem `Payout`, więc kolejne wyliczenie jej nie
  policzy; cofnięcie wypłaty zwraca lekcje do nierozliczonych,
- lekcja rozliczona jest **zamrożona** tak samo jak ta na rachunku
  (`assertNotPaidOut` w `updateLesson`, `cancelLesson` i `deleteLesson`) —
  inaczej dałoby się skasować lekcję, za którą pieniądze już wyszły, a wypłata
  zostawała z kwotą bez pokrycia. Wyjście awaryjne: admin cofa wypłatę,
- kwota jest edytowalna (wypłata częściowa), ale lekcje przypinamy zawsze
  wszystkie nierozliczone,
- nauczyciel widzi własną kwotę i historię, **bez** tego kto wypłatę oznaczył
  i bez cudzych rozliczeń; cudzy `teacherId` daje `NotFoundError`.

Testy: `tests/payouts.test.ts`.

## Przypomnienia o lekcji

`src/lib/services/reminders.ts`, cron `GET /api/cron/reminders` (`CRON_SECRET`).

- **treść siedzi w `src/lib/reminders/template.ts` i nigdzie indziej** —
  adaptery kanałów (`reminders/channels.ts`) tylko ją przenoszą,
- klucze API wyłącznie ze zmiennych środowiskowych — nigdy w kodzie, nigdy
  w bazie,
- każda próba, także nieudana, zapisuje `ReminderLog` (`@@unique([lessonId])`),
  więc cron nie zapętla się na błędzie; uczeń z kanałem `NONE` jest pomijany
  **bez** wpisu, bo to nie była próba,
- token Telegrama z `/start` jest jednorazowy i wygasa po tygodniu,
- `SMS_PROVIDER=log` (domyślne) tylko loguje treść — cały przepływ da się
  przetestować bez płatnego konta.

Testy: `tests/reminders.test.ts`.

## Synchronizacja z Google Calendar

`src/lib/services/calendar-sync.ts`, `src/lib/google/{oauth,calendar}.ts`.
**Jednokierunkowo: CRM jest źródłem prawdy.** Zmiana zrobiona w Google nie
wraca do bazy i UI mówi to wprost, żeby nikt nie przestawiał zajęć w telefonie.

- każdy nauczyciel podłącza **własne** konto (`GoogleCalendarLink`, unikat na
  `teacherId`); admin widzi stan i może wstrzymać albo rozłączyć, ale nie
  zaloguje się za kogoś,
- **zdarzenie nie zawiera żadnej kwoty** — ani ceny ucznia, ani stawki
  nauczyciela. Kalendarz jest poza naszą kontrolą (współdzielenie, eksport,
  powiadomienia), więc pieniądze tam nie trafiają,
- „co wysłać" poznajemy po `Lesson.googleSyncedAt = null`. Znacznik zerują
  **jawnie** funkcje z `lessons.ts` (zmiana terminu, statusu, tematu).
  NIE porównujemy go z `updatedAt`, bo Prisma bumpuje `updatedAt` przy każdym
  zapisie — także przy zapisie samego znacznika — i taka detekcja ścigałaby
  się sama ze sobą,
- lekcja odwołana jest **usuwana** z kalendarza (nie odbędzie się, nie ma po co
  blokować terminu); zrealizowana i nieobecność zostają,
- usunięcie lekcji zostawia nagrobek (`GoogleCalendarDeletion`) — po usunięciu
  wiersza nie ma już skąd wziąć `googleEventId`, więc bez tego zdarzenie
  zostałoby w kalendarzu na zawsze,
- czas podajemy jako **ścienny + strefa** (`Europe/Warsaw`), nie jako UTC —
  lekcja o 16:00 zostaje o 16:00 po zmianie czasu,
- tokeny (`refreshToken`) nie opuszczają serwera i nie ma ich w żadnym DTO,
- błąd jednego nauczyciela nie zatrzymuje pozostałych; ląduje
  w `lastSyncError` i jest widoczny w jego karcie,
- ostrzeżenie o brakujących kluczach **nie zasłania** stanu połączenia —
  inaczej po rotacji kluczy nauczyciel nie miałby jak się rozłączyć,
- `GOOGLE_CALENDAR_PROVIDER=log` (domyślne) nie rusza sieci — zapamiętuje
  wywołania w pamięci, więc cały przepływ da się przetestować bez konta Google.

Cron: `GET /api/cron/calendar` (ten sam `CRON_SECRET` co przypomnienia).
Testy: `tests/calendar-sync.test.ts`.

## Ewidencja przychodu (podkład pod PIT-36)

`src/lib/services/evidence.ts`, panel `/admin/ewidencja`. Tylko ADMIN.

Ta sama zasada co w NDG, tylko ostrzej: **nie ma tu ani jednej stawki
podatkowej, kwoty wolnej ani wyliczonego podatku.** Moduł podaje wyłącznie to,
co wynika z dokumentów — datę, dokument, ucznia, kwotę i sumę narastającą.
W UI stoi jawne zastrzeżenie, że to zestawienie pomocnicze.

- podstawę (`INVOICED` / `PAID`) bierzemy z `NdgSettings.revenueBasis`, żeby
  ewidencja i pas ostrzegawczy limitu nigdy nie liczyły czegoś innego,
- numeracja i suma narastająca idą przez **cały rok**, nie per miesiąc,
- anulowany rachunek wypada z ewidencji (numeracja zaczyna się od nowa),
- CSV: separator średnik, przecinek dziesiętny i BOM — inaczej polski Excel
  rozjeżdża kolumny i łamie znaki; cudzysłowy w danych są podwajane,
- wydruk ma własny nagłówek z danymi wystawcy, żeby obronił się na papierze.

Testy: `tests/evidence.test.ts`.

## Bezpieczeństwo — reguły, których nie wolno cofnąć

- **testy kasują tylko bazę z jawnym znacznikiem** (`_korkigo_test_database`,
  zakładany przez `npm run db:test:init`). Wcześniej wystarczyła dowolna
  niepusta `DATABASE_URL`, więc `npm test` w powłoce z produkcyjną zmienną
  kasował firmie dane (audyt zewnętrzny, F12). Znacznika **nie wolno** tworzyć
  automatycznie w `resetDatabase()` — wtedy nie chroniłby przed niczym.
  Osobno: brak `DATABASE_URL` to twardy błąd `npm test`, a nie 119 po cichu
  pominiętych testów i kod wyjścia zero (F30); same testy bez bazy mają własne
  polecenie `npm run test:unit` z jawną listą plików,
- **kwoty sprawdzamy na zapisie tekstowym, nie arytmetycznie** (`amountSchema`).
  `Math.round(v * 100) === Number((v * 100).toFixed(0))` NIE działa: dla `1.005`
  oba wyrażenia dają 100, bo `1.005 * 100` to w binarnym zapisie
  `100.49999999999999`. Trzy miejsca po przecinku wchodziły do bazy mimo
  komunikatu, że nie wolno (audyt zewnętrzny, F15). Teraz wzorzec
  `^\d+(?:[.,]\d{1,2})?$` na kanonicznym zapisie — liczba idzie przez
  `String(v)`, więc `1.005` odpada tak samo jak wpisany tekst. Przy okazji
  odpada notacja wykładnicza,
- **puste pole liczbowe to BRAK, nie zero** (`optionalNumber`).
  `z.coerce.number().optional()` nie wystarcza: `.optional()` reaguje na
  `undefined`, a formularz przysyła pusty tekst, który `Number("")` zamienia
  na 0. Pusty termin płatności stawał się płatnością na dziś, a pusta cena
  pakietu zerem zamiast ceny ucznia (F16). Jawne `"0"` nadal znaczy zero,
- **godzina z nocy przejścia na czas letni jest odrzucana**
  (`wallClockToUtc` + `wallClock`). 29 marca 2026 zegar skacze z 02:00 na
  03:00, więc 02:30 nie istnieje — wcześniej zapisywało się po cichu jako
  03:30, czyli operacja kończyła się sukcesem o innej godzinie (F17).
  Kontrola jest **powrotna**: konwertujemy i porównujemy zapis ścienny.
  Godziny podwójnej (jesień) nie da się rozróżnić z samego zapisu, więc
  bierzemy pierwsze wystąpienie — deterministycznie,
- **daty sprawdzamy kalendarzem, nie samym wyrażeniem regularnym**
  (`isoDate`, `wallClock`, `timeOfDay`, `monthKeySchema` w `src/lib/validation.ts`).
  `2026-13-45` przechodzi przez `^\d{4}-\d{2}-\d{2}$`, a `Date.UTC(2026, 12, 45)`
  po cichu przewija to na 2027-02-14 — operacja wykonywała się wtedy na innym
  dniu, niż podał użytkownik, i kończyła się sukcesem. Te cztery budulce są
  **jedynym** miejscem z wyrażeniami regularnymi na daty; nie dopisuj własnego
  obok. Pola „tak/nie" biorą `flag`, nie `z.coerce.boolean()` — `Boolean("false")`
  to `true`, więc przełącznik z formularza działałby tylko w jedną stronę,
- **każda funkcja serwisowa przyjmująca dane z zewnątrz parsuje je schematem**
  (`z.input<typeof …>` + `.parse()`), nie ręcznym `if`-em. Bez tego użytkownik
  dostaje „Coś poszło nie tak" zamiast komunikatu przy polu, bo `ZodError`
  mapuje się na `fieldErrors`, a zwykły `Error` już nie,
- **powrót po zalogowaniu przechodzi przez `safeNextPath()`** (`src/lib/safe-redirect.ts`).
  Samo `startsWith("/")` NIE wystarcza: `//evil.pl` i `/\evil.pl` przeglądarka
  traktuje jak adres bezwzględny, więc `?next=` wyprowadzał użytkownika
  z serwisu zaraz po podaniu hasła,
- **zmiana hasła unieważnia sesje** — `User.sessionsValidFrom` przesuwa się przy
  każdej zmianie, a `getActor()` odrzuca token z wcześniejszym `iat`. Bez tego
  wykradzione ciasteczko żyło do wygaśnięcia mimo zmienionego hasła. Przy
  zmianie WŁASNEGO hasła wydajemy od razu nową sesję, żeby nie wylogować
  bieżącej przeglądarki,
- **blokada po `MAX_FAILED_LOGINS` próbach** (`src/lib/services/login-guard.ts`)
  jest czasowa i krótka. Trwałe zamknięcie konta byłoby narzędziem do odcięcia
  nauczyciela od pracy cudzymi próbami,
- **obie ścieżki logowania porównują hash także dla nieistniejącego konta**
  (stały `DUMMY_HASH_PROMISE`) i zwracają ten sam komunikat — inaczej czas
  odpowiedzi zdradzałby, które adresy istnieją,
- **sekrety w bazie są szyfrowane** (`src/lib/crypto.ts`, AES-256-GCM).
  Dotyczy tokenów Google: wyciek samej bazy nie może dawać dostępu do cudzych
  kalendarzy. Wartość bez prefiksu `v1:` czytamy jako jawną, żeby wdrożenie
  nie zerwało istniejących połączeń,
- **siła hasła siedzi w `src/lib/password-policy.ts`** i nigdzie indziej —
  żadnej liczby ani listy nie powtarzamy w schemacie, serwisie, seedzie ani
  w UI (podpowiedź czyta `PASSWORD_HINT`). Reguły idą za NIST SP 800-63B:
  **długość (12) i lista zakazanych**, bez „wielka litera, cyfra, znak
  specjalny" — te dają `Haslo123!`, czyli hasło formalnie zgodne i zgadywane
  w pierwszej setce prób. Porównanie z listą idzie po formie uproszczonej
  (małe litery, bez znaków specjalnych, bez ogona cyfr), dzięki czemu wpis
  `haslo` zatrzymuje też `Haslo-123!`. `ł` zamieniamy **przed** `normalize("NFD")`,
  bo jako jedyna polska litera nie ma formy rozkładalnej. Seed **nie ma
  domyślnego hasła admina** — wcześniej był nim `admin12345` z publicznego
  repozytorium,
- **CSP ma nonce, nie `'unsafe-inline'`**, i dlatego mieszka w `src/middleware.ts`,
  a nie w `next.config.ts` — nonce musi być inny przy każdej odpowiedzi,
  a config potrafi tylko stałe. Idzie w obie strony: Next dokleja go do swoich
  skryptów hydracji dopiero wtedy, gdy znajdzie go w nagłówkach **żądania**.
  `strict-dynamic` jest konieczne, bo skrypt startowy dociąga kolejne paczki
  sam. `style-src` zostaje z `'unsafe-inline'`: React wstawia style atrybutem,
  którego nonce nie obejmuje — stylem nie wykonasz kodu. **Strona 404 musi być
  `force-dynamic`** (`src/app/not-found.tsx`): do statycznego HTML-a nie da się
  wstrzyknąć nonce'a i cała strona leciała na naruszeniach CSP,
- **limit rozmiaru ciała żądania** (`MAX_BODY_BYTES` w `src/middleware.ts`,
  256 kB) stoi przed limitem zapytań, więc obejmuje też akcje serwera, nie samo
  `/api`. Opiera się na `Content-Length`, bo middleware nie policzy bajtów bez
  zjedzenia strumienia — nadawca piszący „chunked" ten próg ominie, dlatego
  limit po stronie hostingu zostaje **drugą** barierą, nie alternatywą,
- **błędy logujemy przez `logError()`** (`src/lib/log.ts`), nigdy
  `console.error("…", error)`. Komunikat Prismy niesie **wartości pól** —
  imię ucznia, e-mail i telefon opiekuna — a logi hostingu nie są objęte naszą
  retencją ani umową powierzenia. Stąd: tylko pierwszy wiersz komunikatu,
  kod błędu, nazwy pól z `meta` (nigdy wartości) i same ramki „at …". Maski
  idą w kolejności token → numer, bo wzorzec numeru zjada cyfrowy ogon tokena.
  Każdy wpis dostaje ośmioznakowy identyfikator pokazywany też użytkownikowi,
- **nagłówki bezpieczeństwa siedzą w `next.config.ts`** — to, co stałe:
  `X-Frame-Options: DENY` (dubluje `frame-ancestors` dla odpowiedzi poza
  middleware), nosniff, Referrer-Policy, Permissions-Policy. HSTS włącza się
  tylko na produkcji.

- **limit zapytań siedzi w `src/middleware.ts`**, nie w poszczególnych trasach —
  obejmuje też te dopisane w przyszłości. Logowanie ma ostrzejszy próg
  (10/min) niż reszta API (120/min); cron i webhook Telegrama są pominięte,
  bo chroni je sekret i biją z jednego adresu. Licznik żyje w pamięci procesu
  i zeruje się przy restarcie — przy kilku instancjach dołóż limit hostingu,
- **każde logowanie i zmiana hasła trafia do `SecurityEvent`**
  (`src/lib/services/security-log.ts`, panel `/admin/bezpieczenstwo`).
  Blokada konta działa po cichu, więc bez dziennika nie da się zauważyć, że
  ktoś systematycznie próbuje wejść. Zapis **nigdy nie przerywa** operacji,
  którą opisuje: nieudane logowanie ma zwrócić „złe hasło", a nie 500 dlatego,
  że nie udało się dopisać wpisu,
- w dzienniku **nie ma haseł ani tokenów**; adres IP kasuje się po
  `SECURITY_LOG_DAYS` (90) przy okazji crona przypomnień,
- reset hasła przez admina **zdejmuje blokadę konta** — inaczej nauczyciel
  dalej nie mógłby wejść nowym hasłem.

- **drugi składnik (TOTP)** — `src/lib/totp.ts` (implementacja własna, zgodna
  z RFC 6238) + `src/lib/services/two-factor.ts`. Niezmienniki:
  - sekret TOTP leży w bazie **zaszyfrowany**; wyciek bazy nie daje generatora kodów,
  - konfiguracja jest **dwuetapowa**: sekret powstaje przy „Rozpocznij", ale
    drugi składnik włącza się dopiero po przepisaniu poprawnego kodu — inaczej
    dałoby się zamknąć sobie dostęp sekretem, którego aplikacja nie dostała,
  - **kody zapasowe są obowiązkowe** (8 sztuk, jednorazowe), bo bez nich utrata
    telefonu zamyka właścicielowi dostęp do własnego CRM-a na zawsze,
  - kody haszujemy **SHA-256, nie bcryptem**: mają 50 bitów entropii
    z generatora, a bcrypt kosztem 12 przy ośmiu kodach to ~2,5 s CPU na jedną
    próbę logowania — wolno dla użytkownika i tani sposób na obciążenie serwera,
  - wyłączenie i nowe kody **wymagają hasła** — inaczej ktoś z przejętą sesją
    zdjąłby drugi składnik jednym kliknięciem,
  - drugi składnik obowiązuje **także w REST** (pole `code` w `/api/auth/login`).
    Gdyby API go pomijało, byłoby najprostszym obejściem całej ochrony,
  - blokada po nieudanych próbach liczy się też na etapie kodu — inaczej byłby
    wygodnym miejscem na zgadywanie sześciu cyfr bez ograniczeń,
  - **kod QR rysujemy sami, na serwerze** (`src/lib/qr.ts`, `qrcode-generator`).
    W treści siedzi sekret TOTP, więc nie wolno go wysłać do zewnętrznej usługi
    generującej obrazki ani policzyć w przeglądarce. Funkcja zwraca ścieżkę
    SVG, nie HTML — komponent składa z tego elementy React, bo projekt nie
    używa `dangerouslySetInnerHTML`. Moduły są zawsze ciemne na białym tle:
    odwrócony kontrast część czytników odrzuca. Test
    (`tests/qr.test.ts`) **dekoduje** gotowy kod prawdziwym czytnikiem
    (`jsqr`), bo zły maskowanie albo korekcja błędów daje kod, który skanuje
    się raz na kilka prób — najgorszy możliwy rodzaj awarii.

- **tryb `log` w SMS-ach jest na produkcji traktowany jako BRAK konfiguracji**
  i zwraca błąd. Wcześniej raportował sukces, więc przypomnienie zapisywało się
  jako wysłane, choć nikt go nie dostał. Numer w logu jest maskowany — logi
  serwera widzi dostawca hostingu i nie są objęte naszą retencją.

Testy: `tests/security.test.ts`, `tests/rate-limit.test.ts`,
`tests/security-log.test.ts`, `tests/totp.test.ts`, `tests/two-factor.test.ts`,
`tests/qr.test.ts`, `tests/validation.test.ts`,
`tests/password-policy.test.ts`, `tests/middleware.test.ts`.

## RODO — eksport, anonimizacja, retencja

`src/lib/services/privacy.ts`. Tylko ADMIN. To narzędzie pomocnicze —
o tym, czy wolno usunąć dane i jaki okres przechowywania obowiązuje, decyduje
administrator danych, nie aplikacja.

- **eksport** (`GET /api/students/[id]/eksport?pobierz=1`) wydaje komplet danych
  ucznia i opiekuna wraz z lekcjami, rachunkami i wpłatami. **Nie zawiera
  stawek nauczyciela ani marży** — to dane firmy, nie osoby, której dotyczy
  żądanie,
- **anonimizacja** nadpisuje dane osobowe, ale **nie usuwa dokumentów**:
  rachunek ma własny okres przechowywania, więc zostaje z pustą tożsamością,
- nadpisujemy **także `Invoice.buyerSnapshot`** — to osobna kopia imienia,
  e-maila i telefonu. Anonimizacja, która go pomija, jest pozorna,
- wymaga **powodu**, jest nieodwracalna i trafia do dziennika,
- **przegląd retencji** (`/admin/bezpieczenstwo`) wypisuje uczniów zakończonych
  i nieaktywnych od `RETENTION_REVIEW_MONTHS` (36) miesięcy. Aplikacja
  **świadomie nie kasuje nic sama** — okres zależy od podstawy prawnej.

Testy: `tests/privacy.test.ts`.

## Moduł NDG (faza 3) — reguły

`src/lib/services/ndg.ts`, panel `/admin/ndg`. Tylko ADMIN.

**Żadna kwota ani stawka podatkowa nie jest zaszyta w kodzie** i tak ma zostać.
Aplikacja liczy to, co administrator wpisze: kwoty limitu (`NdgMonthlyLimit`
z datą obowiązywania), okres rozliczenia, podstawę przychodu i próg ostrzeżenia.
Przy zmianach trzymaj ten podział — w UI stoi jawne zastrzeżenie, że to
narzędzie pomocnicze, a nie doradztwo podatkowe.

Niezmienniki:

- limit okresu = suma limitów jego miesięcy (zmiana kwoty w trakcie kwartału
  liczy się poprawnie); brak kwoty w którymkolwiek miesiącu → status `UNKNOWN`,
  nigdy podstawiona liczba,
- podstawa przychodu: `INVOICED` (rachunki bez anulowanych) albo `PAID` (wpłaty),
- progi: `WATCH` ≥ 70%, `WARNING` ≥ próg z ustawień (domyślnie 90%),
  `EXCEEDED` ≥ 100%; pas ostrzegawczy stoi u góry modułu, pulpitu i rachunków,
- `NdgSettings.enabled = false` (po założeniu firmy) wyłącza całą część
  limitową, a moduł zostaje jako statystyki finansowe: miesiąc / kwartał / rok
  i rozbicie na nauczycieli. Ta ścieżka ma być utrzymywana na równi z limitem.

Kolory statusów pochodzą ze stałej palety (`--color-status-*` w `globals.css`)
i zawsze idą w parze z ikoną i podpisem — kolor nigdy nie niesie znaczenia sam.
Testy: `tests/ndg.test.ts`.

## Notatki z lekcji

`src/lib/services/lesson-notes.ts`, panele `/nauczyciel/notatki` i
`/admin/notatki`. Szablon z czterech pól: co było / jak poszło / cel / co dalej.

- **zakres liczymy po nauczycielu LEKCJI** (`noteScope`), nie po dzisiejszym
  opiekunie ucznia. Ucznia da się przepisać innemu nauczycielowi — zakres po
  `student.teacherId` oddałby wtedy nowemu nauczycielowi notatki z zajęć,
  których nie prowadził, i odciął autora od własnych. Notatka należy do lekcji,
- **`studentId` bierzemy z lekcji, nigdy z wejścia.** Pole jest zdenormalizowane
  po to, żeby dało się szukać po uczniu; gdyby przychodziło z formularza,
  nauczyciel podpiąłby notatkę pod cudzego ucznia,
- jedna notatka na lekcję (`LessonNote.lessonId` @unique) — zapis to zawsze
  `upsert`, więc druga próba nadpisuje zamiast dublować,
- notatka **nie zawiera żadnej kwoty**, więc ten sam komponent jest bezpieczny
  dla obu ról — nie ma tu odpowiednika `selectFor` z cenami ucznia,
- cudza notatka daje `NotFoundError`, a cudzy `teacherId` w filtrze jest
  **ignorowany**, nie odrzucany — tak samo jak `resolveScope()` w grafiku,
- pusta notatka (wszystkie cztery pola puste) jest odrzucana; jedno wypełnione
  pole wystarczy,
- „do uzupełnienia" to lekcje **zrealizowane i nieobecności** bez notatki.
  Zaplanowanej nie ma czego opisywać, a odwołana się nie odbyła — wisiałyby na
  liście w nieskończoność,
- admin szuka **po stronie bazy** (`query` → `contains` z `mode: insensitive`),
  nie przez ukrywanie wierszy w przeglądarce jak `SearchFilter`: notatek
  przybywa po jednej z każdej lekcji. Szukanie obejmuje treść, ucznia,
  nauczyciela, przedmiot i temat zajęć,
- usunięcie lekcji kasuje notatkę (`onDelete: Cascade` w schemacie).

Wysyłka notatki do ucznia jeszcze nie istnieje — jest przycisk „Kopiuj
notatkę" (schowek), a kanały (Telegram/SMS) żyją w module przypomnień.

Testy: `tests/lesson-notes.test.ts`.

## Baza wiedzy

`src/lib/services/knowledge-base.ts`, panele `/admin/baza-wiedzy`
i `/nauczyciel/baza-wiedzy`. Linki do materiałów pomocniczych, **jedna
zakładka na przedmiot**. Pisze wyłącznie ADMIN, nauczyciel czyta.

Model zmienił się względem fazy 1: `KnowledgeBaseEntry` było per **uczeń**
(tytuł + treść), jest per **przedmiot** (tytuł + adres + opis). Tabela nigdy
nie miała kodu, więc migracja `20261005100000_baza_wiedzy_per_przedmiot`
podmienia kolumnę kluczową bez zachowywania czegokolwiek — i celowo dodaje
`subjectId` jako NOT NULL bez wartości domyślnej, żeby wywalić się zamiast
po cichu przypiąć ewentualne wiersze do przypadkowego przedmiotu.

Niezmienniki:

- **„przypisany przedmiot" = taki, do którego nauczyciel ma `TeacherRate`**
  na którymkolwiek poziomie (`assignedSubjectIds`). To nie proteza z braku
  lepszego pola: stawka JEST przypisaniem, bo bez niej `resolveLessonRates`
  odrzuca zapis lekcji. Gdyby kiedyś powstało osobne przypisanie, zmienia się
  **tylko ta funkcja**,
- zawężenie idzie **w zapytaniu**, nie przez ukrycie zakładek — podstawiony
  `?przedmiot=` z cudzego przedmiotu nie ma czego pokazać,
- materiał z nieswojego przedmiotu daje `NotFoundError`, nie 403,
- **adres musi być `http(s)`** (`linkUrl` w `validation.ts`) i to nie jest
  kosmetyka: `javascript:…` w `href` wykonałoby się po kliknięciu, w sesji
  nauczyciela, a `data:` pozwoliłby podstawić własny dokument HTML. Walidacja
  obowiązuje też przy edycji,
- linki mają `target="_blank"` **i `rel="noopener noreferrer"`** — bez
  `noopener` otwarta strona dostaje `window.opener` i może przestawić naszą
  kartę pod siebie,
- pod tytułem pokazujemy host adresu, żeby było widać, dokąd prowadzi,
  **przed** kliknięciem,
- przedmiot wyłączony zostaje adminowi (archiwum), ale znika nauczycielowi,
- materiał nie zawiera kwot, więc ten sam komponent jest bezpieczny dla obu
  ról — różni się wyłącznie tym, ile zakładek widać,
- usunięcie przedmiotu kasuje jego materiały (`onDelete: Cascade`).

Testy: `tests/knowledge-base.test.ts`.

## Wiadomości

`src/lib/services/messages.ts`, panele `/admin/wiadomosci` i
`/nauczyciel/wiadomosci`. Pisze wyłącznie ADMIN — do jednego nauczyciela albo
do wszystkich aktywnych; nauczyciel tylko czyta swoje.

- stan przeczytania siedzi w `MessageRecipient.readAt`, osobno dla każdego
  odbiorcy — wysyłka zbiorcza to ta sama ścieżka co pojedyncza,
- `countUnreadMessages()` zasila czerwoną kropkę przy zakładce „Wiadomości”
  (pole `dot`/`count` w `NavItem`, liczone w layoucie nauczyciela),
- nauczyciel nie dostaje listy pozostałych odbiorców (`mapMessage` zwraca mu
  pustą tablicę), a oznaczenie cudzej wiadomości daje `NotFoundError`,
- wysyłka zbiorcza bierze nauczycieli aktywnych w chwili wysłania.

Testy: `tests/messages.test.ts`.
