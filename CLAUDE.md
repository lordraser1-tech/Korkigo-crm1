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

## Faza obecna: fundament

Budujemy teraz: kartoteka uczniów, kartoteka nauczycieli, kalendarz lekcji
(cykliczne + jednorazowe, statusy: zaplanowana/zrealizowana/odwołana/nieobecność),
panel nauczyciela (dodawanie uczniów, odznaczanie lekcji, podgląd zarobków),
panel admina (pełny widok + ręczne ustawianie stawek).

Makieta panelu nauczyciela już istnieje (Claude Artifact — Design canvas),
z menu: Pulpit, Moi uczniowie, Kalendarz lekcji, Moje wypłaty, Notatki z lekcji,
Baza wiedzy, Wiadomości, Ustawienia.

## Kolejne fazy (nie teraz, ale schemat już to przewiduje)

- **Faza 2:** płatności i zaległości, rachunki z automatyczną numeracją gotowe
  do druku, notatki z lekcji (szablon: co było / jak poszło / cel / co dalej,
  z opcją kopiowania i wysyłki do ucznia), baza wiedzy per uczeń, synchronizacja
  z Google Calendar (`Lesson.googleEventId` już zarezerwowane w schemacie)
- **Faza 3:** bezpiecznik limitu działalności nierejestrowanej (NDG) z
  przeliczeniem kwartalnym, zakładka przejścia na działalność rejestrowaną,
  eksport ewidencji do PIT-36, automatyczne wezwania do zapłaty, pełne raporty
  — **to dotyka przepisów podatkowych; reguły/wzory do zweryfikowania z
  księgowym przed wdrożeniem w produkcji**
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
