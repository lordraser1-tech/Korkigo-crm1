# KorkiGO CRM

System do zarządzania korepetycjami z języka polskiego dla Ukraińców i
Białorusinów (korkigo.pl). Aplikacja Next.js z panelem administratora i panelem
nauczyciela w jednym projekcie.

Kontekst produktowy i plan faz: [`CLAUDE.md`](./CLAUDE.md).
Schemat bazy: [`prisma/schema.prisma`](./prisma/schema.prisma).

## Stack

| Warstwa | Technologia |
| --- | --- |
| Framework | Next.js 15 (App Router, React 19, Server Components + Server Actions) |
| Baza | PostgreSQL + Prisma 6 |
| Auth | e-mail + hasło (bcrypt), sesja w podpisanym ciasteczku JWT (`jose`) |
| UI | Tailwind CSS 4 |
| Walidacja | Zod |
| Testy | Vitest (integracyjne, na prawdziwej bazie) |

## Szybki start

```bash
npm install
cp .env.example .env          # uzupełnij DATABASE_URL i AUTH_SECRET
npx prisma migrate dev        # utworzenie schematu
npm run db:seed               # konto administratora z .env
npm run dev                   # http://localhost:3000
```

Dane demonstracyjne (2 nauczycieli, 4 uczniów, lekcje cykliczne wstecz i do przodu):

```bash
SEED_DEMO=true npm run db:seed
# logowanie: admin@korkigo.pl / (SEED_ADMIN_PASSWORD)
#            anna.kowalska@korkigo.pl / nauczyciel123
```

`AUTH_SECRET` musi mieć min. 32 znaki — wygeneruj przez `openssl rand -base64 32`.

## Role i uprawnienia

Reguły z `CLAUDE.md` są egzekwowane **w warstwie serwisowej** (`src/lib/services/`),
z której korzystają zarówno panele, jak i REST API. Ukrycie czegoś w UI nigdy nie
jest jedynym zabezpieczeniem.

| Zasób | `ADMIN` | `TEACHER` |
| --- | --- | --- |
| Uczniowie | wszyscy, z `ratePerLesson` | tylko własni, **bez** `ratePerLesson` |
| Stawka ucznia | ustawia ręcznie | nie widzi i nie ustawia (`403`) |
| Rachunki, wpłaty, salda | pełny dostęp | `403` — widzi wyłącznie flagę „Rozliczenia OK / Zaległość”, bez kwot |
| Tryb rozliczeń ucznia | ustawia | nie widzi i nie zmienia (`403`) |
| Nauczyciele | pełna lista i dane | tylko własny profil (`404` na cudzy) |
| Stawka nauczyciela | ustawia | widzi własną, nie zmienia (`403`) |
| Lekcje | wszystkie | tylko własne; zmiana statusu własnych |
| Zarobki | każdego nauczyciela | tylko własne |
| Rozliczenia (przychód/marża) | tak | `403` |

Szczegóły implementacji:

- stawka ucznia nie jest nawet **pobierana z bazy** dla roli `TEACHER`
  (`selectFor()` w `src/lib/services/students.ts`),
- cudzy rekord zwraca `404`, nie `403` — nie potwierdzamy, że istnieje,
- uczeń dodany przez nauczyciela dostaje stawkę `0` i trafia na listę
  „czeka na ustalenie stawki” na pulpicie admina,
- flaga rozliczeń dla nauczyciela to sam enum `OK` / `OVERDUE` — bez kwoty,
  terminu i numeru rachunku.

## Płatności i rachunki (faza 2)

Każdy uczeń ma **tryb rozliczeń** (`Student.billingMode`), który decyduje o tym,
jak powstaje rachunek:

| Tryb | Jak działa |
| --- | --- |
| `POSTPAID` | rachunek zbiorczy na koniec miesiąca za lekcje zrealizowane |
| `PER_LESSON` | osobny rachunek po każdej zrealizowanej lekcji |
| `PREPAID` | rachunek za pakiet z góry; zrealizowane lekcje zdejmują jednostki |

Zasady, których pilnuje warstwa serwisowa (`src/lib/services/billing.ts`):

- **numeracja** `1/09/2026` — ciągła, liczona w miesiącu wystawienia, resetuje
  się pierwszego dnia miesiąca; numer nadawany w transakcji, kolizja jest
  ponawiana,
- **jedna lekcja = jeden rachunek** — pilnuje tego unikalny `InvoiceItem.lessonId`,
- **lekcja na rachunku jest zamrożona** — nie da się zmienić jej statusu ani
  terminu, dopóki rachunek nie zostanie anulowany,
- **rachunków się nie usuwa**, tylko anuluje (numeracja zostaje ciągła);
  anulowanie zwalnia ujęte lekcje,
- **dane wystawcy są kopiowane na rachunek** w chwili wystawienia — późniejsza
  zmiana w Ustawieniach nie zmienia dokumentów już wydanych uczniom,
- **saldo ucznia** = suma wpłat − suma rachunków (bez anulowanych). Ujemne to
  zaległość, dodatnie to nadpłata; wpłata bez wskazanego rachunku jest
  przedpłatą.

Wydruk: `/admin/rachunki/{id}` ma widok dokumentu i przycisk „Drukuj” —
nawigacja jest ukrywana przez `@media print`.

## Struktura

```
prisma/
  schema.prisma        # model danych (faza 1 + pola pod kolejne fazy)
  seed.ts              # admin + opcjonalne dane demo
src/
  app/
    login/             # logowanie
    nauczyciel/        # panel nauczyciela
    admin/             # panel administratora
    api/               # REST API (te same serwisy, ta sama autoryzacja)
    actions/           # Server Actions formularzy
  components/          # UI współdzielone przez oba panele
  lib/
    auth.ts            # Actor (kto pyta) + strażnicy ról
    services/          # LOGIKA I UPRAWNIENIA: students, teachers, lessons, finance
    validation.ts      # schematy Zod
    datetime.ts        # czas warszawski <-> UTC, lekcje cykliczne
tests/                 # testy uprawnień i konwersji czasu
```

## API

Wszystkie endpointy wymagają ciasteczka sesji i same sprawdzają rolę.

| Metoda | Ścieżka | Uwagi |
| --- | --- | --- |
| `POST` | `/api/auth/login` | `{ email, password }` |
| `POST` | `/api/auth/logout` | |
| `GET` | `/api/auth/me` | kim jestem |
| `GET`/`POST` | `/api/students` | `?q=&status=&teacherId=` |
| `GET`/`PATCH`/`DELETE` | `/api/students/{id}` | |
| `GET`/`POST` | `/api/teachers` | tylko admin |
| `GET`/`PATCH` | `/api/teachers/{id}` | nauczyciel: tylko własny profil |
| `GET`/`POST` | `/api/lessons` | `?month=2026-09&teacherId=&studentId=&status=` |
| `GET`/`PATCH`/`DELETE` | `/api/lessons/{id}` | |
| `GET` | `/api/earnings` | `?teacherId=&month=` |
| `GET` | `/api/finance/summary` | `?month=` — tylko admin |
| `GET`/`POST` | `/api/invoices` | `?month=&studentId=&state=`; POST z `type`: `monthly` / `lesson` / `package` |
| `GET`/`DELETE` | `/api/invoices/{id}` | `DELETE` anuluje rachunek, nie usuwa |
| `GET`/`POST` | `/api/payments` | `?month=&studentId=` |
| `DELETE` | `/api/payments/{id}` | |
| `GET` | `/api/receivables` | salda i zaległości wszystkich uczniów |
| `GET`/`PUT` | `/api/billing-settings` | dane wystawcy i termin płatności |

Błędy mają kształt `{ "error": { "code", "message" } }`,
sukces `{ "data": ... }`.

## Czas i lekcje cykliczne

Baza trzyma UTC, a aplikacja liczy wszystko w strefie `Europe/Warsaw`
(`src/lib/datetime.ts`). Lekcja cykliczna tworzy serię ze wspólnym `seriesId`,
a kolejne terminy liczone są na „czasie ściennym” — lekcja o 16:00 zostaje
o 16:00 również po zmianie czasu letniego na zimowy.

## Testy

```bash
createdb korkigo_test
cp .env.test.example .env.test        # osobna baza — testy ją czyszczą!
DATABASE_URL=... npx prisma migrate deploy
npm test
```

Testy pokrywają m.in.: zakres widoczności uczniów i lekcji, brak stawki ucznia
w odpowiedziach dla nauczyciela, odmowę zmiany stawek przez nauczyciela,
wyliczanie zarobków i marży, serie cykliczne przy zmianie czasu, a dla fazy 2 —
numerację rachunków (w tym reset miesięczny), zakaz dwukrotnego zafakturowania
lekcji, salda, zaległości, pakiety przedpłacone i odcięcie nauczyciela od
rozliczeń.

Bez `DATABASE_URL` testy integracyjne są pomijane (uruchomią się tylko testy
konwersji czasu).

## Skrypty

| Komenda | Opis |
| --- | --- |
| `npm run dev` | serwer deweloperski |
| `npm run build` / `npm start` | build produkcyjny i jego uruchomienie |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Vitest |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | konto admina (+ `SEED_DEMO=true` dane demo) |
| `npm run db:studio` | Prisma Studio |

## Wdrożenie

Potrzebny jest Postgres i host uruchamiający Node (Railway, Vercel + Neon/Supabase).
Zmienne środowiskowe: `DATABASE_URL`, `AUTH_SECRET` (oraz `SEED_ADMIN_*` przy
pierwszym seedzie). Na produkcji migracje uruchamiaj przez
`npx prisma migrate deploy`. Ciasteczko sesji jest `httpOnly`, `sameSite=lax`
i `secure` w trybie produkcyjnym — wymaga HTTPS.

## Co dalej

Z fazy 2 zostały: notatki z lekcji (szablon co było / jak poszło / cel / co
dalej), baza wiedzy per uczeń i synchronizacja z Google Calendar
(`Lesson.googleEventId` jest już zarezerwowane). Dalej faza 3 — limit
działalności nierejestrowanej, eksport ewidencji do PIT-36 i automatyczne
wezwania do zapłaty (**reguły podatkowe do potwierdzenia z księgowym**) — oraz
faza 4, czyli wsparcie AI przy notatkach. Pozycje menu oznaczone „wkrótce” są
miejscami na te moduły.
