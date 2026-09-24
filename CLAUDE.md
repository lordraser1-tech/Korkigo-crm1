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
- stawki ucznia (`Student.ratePerLesson`)
- stawek ani danych innych nauczycieli
- lekcji/uczniów przypisanych do innych nauczycieli

To musi być wymuszone **na poziomie API/serwera**, nie tylko ukryte w UI —
endpointy dla roli `TEACHER` nigdy nie powinny zwracać pola `ratePerLesson`
z modelu `Student`, ani rekordów innego `teacherId`. Stawki ustala wyłącznie
admin, ręcznie, w panelu admina.

## Stan: faza 1 gotowa, faza 2 rozliczeniowa gotowa, faza 3 w części limitu NDG gotowa

Zrobione: kartoteka uczniów, kartoteka nauczycieli, kalendarz lekcji
(cykliczne + jednorazowe, statusy: zaplanowana/zrealizowana/odwołana/nieobecność),
panel nauczyciela (dodawanie uczniów, odznaczanie lekcji, podgląd zarobków),
panel admina (pełny widok + ręczne ustawianie stawek), a z fazy 2 — płatności,
zaległości i rachunki z automatyczną numeracją gotowe do druku oraz zakładka
„Grafik i dyspozycja” spinająca dyspozycyjność, zapisy uczniów i status
płatności każdej lekcji.

Makieta panelu nauczyciela już istnieje (Claude Artifact — Design canvas),
z menu: Pulpit, Moi uczniowie, Kalendarz lekcji, Moje wypłaty, Notatki z lekcji,
Baza wiedzy, Wiadomości, Ustawienia.

## Kolejne fazy (nie teraz, ale schemat już to przewiduje)

- **Faza 2 (zostało):** notatki z lekcji (szablon: co było / jak poszło / cel /
  co dalej, z opcją kopiowania i wysyłki do ucznia), baza wiedzy per uczeń,
  synchronizacja z Google Calendar (`Lesson.googleEventId` już zarezerwowane
  w schemacie)
- **Faza 3 (zostało):** eksport ewidencji do PIT-36, automatyczne wezwania do
  zapłaty, pełne raporty — **to dotyka przepisów podatkowych; reguły/wzory do
  zweryfikowania z księgowym przed wdrożeniem w produkcji**
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
  Stawka ucznia dla roli `TEACHER` nie jest pobierana z bazy (`selectFor`),
  a cudzy rekord daje `NotFoundError` (404), nie 403.
- `src/app/api/**` i `src/app/actions/**` — cienkie warstwy wejścia; obie wołają
  te same serwisy, więc nie da się obejść reguł przez API.
- `src/lib/datetime.ts` — konwersja `Europe/Warsaw` ↔ UTC. Lekcje cykliczne
  liczone na czasie ściennym, żeby przetrwały zmianę czasu.
- `tests/authorization.test.ts` — testy reguł z sekcji „Role i uprawnienia”.
  Przy zmianach w dostępie do danych **dopisz tam przypadek**.

Ścieżki paneli: `/admin/*` (admin) i `/nauczyciel/*` (nauczyciel), logowanie `/login`.

## Rozliczenia (faza 2) — reguły

Uczeń ma tryb rozliczeń `Student.billingMode`: `POSTPAID` (rachunek zbiorczy na
koniec miesiąca), `PER_LESSON` (rachunek po każdej lekcji) albo `PREPAID`
(pakiet z góry, lekcje zdejmują jednostki). Cała logika siedzi w
`src/lib/services/billing.ts` i jest **dostępna wyłącznie dla ADMIN-a**.

Jedyny wyjątek to `getPaymentFlags()` — zwraca nauczycielowi sam enum
`OK` / `OVERDUE` dla **jego** uczniów, bez kwot, dat i numerów rachunków.
Ta granica jest świadoma: nauczyciel ma wiedzieć, że uczeń zalega, ale nie ile.

Niezmienniki, których nie wolno naruszyć przy zmianach:

- numeracja `1/09/2026` jest ciągła i resetuje się co miesiąc; numer nadaje się
  w transakcji, a anulowany rachunek **nie** zwalnia numeru,
- jedna lekcja może trafić na jeden rachunek (`InvoiceItem.lessonId` @unique),
- lekcja ujęta na nieanulowanym rachunku jest zamrożona (blokada w
  `lessons.updateLesson` i `deleteLesson`),
- rachunków nie usuwamy — `cancelInvoice()` zmienia status i zwalnia lekcje,
- dane wystawcy trafiają na rachunek jako snapshot przy wystawieniu.

Testy tych reguł: `tests/billing.test.ts`. Przy zmianach w rozliczeniach
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

`getLessonPaymentStates()` (w `billing.ts`) odpowiada na pytanie „za którą lekcję
zapłacono”. Nauczyciel dostaje sam status — bez numeru rachunku i kwoty — i tylko
dla swoich lekcji. W trybie `PREPAID` jednostki pakietu idą chronologicznie:
opłacone → wystawione → brak pokrycia. Testy: `tests/schedule.test.ts`.

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
