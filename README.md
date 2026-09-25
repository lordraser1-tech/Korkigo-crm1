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

> Uruchamiasz to pierwszy raz na swoim komputerze i chcesz instrukcję krok po
> kroku (z Dockerem, kontami testowymi i rozwiązaniami typowych błędów)?
> Zobacz [`URUCHOMIENIE.md`](./URUCHOMIENIE.md).

```bash
npm install
docker compose up -d          # Postgres do testów (albo własny — patrz niżej)
cp .env.example .env          # uzupełnij DATABASE_URL i AUTH_SECRET
npm run setup                 # migracje + dane demonstracyjne
npm run dev                   # http://localhost:3000
```

`npm run setup` zakłada schemat i wgrywa dane demo: 2 nauczycieli, 4 uczniów,
lekcje wstecz i do przodu, rachunki, wpłaty, limit NDG i wiadomości.

```
logowanie: admin@korkigo.pl / (SEED_ADMIN_PASSWORD z .env)
           anna.kowalska@korkigo.pl / nauczyciel123
```

Samo konto administratora, bez danych demo: `npm run db:seed`.

`AUTH_SECRET` musi mieć min. 32 znaki — wygeneruj przez `openssl rand -base64 32`.

## Role i uprawnienia

Reguły z `CLAUDE.md` są egzekwowane **w warstwie serwisowej** (`src/lib/services/`),
z której korzystają zarówno panele, jak i REST API. Ukrycie czegoś w UI nigdy nie
jest jedynym zabezpieczeniem.

| Zasób | `ADMIN` | `TEACHER` |
| --- | --- | --- |
| Uczniowie | wszyscy, z cennikiem | tylko własni, **bez** cen |
| Ceny uczniów (per przedmiot) | ustawia ręcznie | nie widzi i nie ustawia (`403`) |
| Stawki nauczycieli | ustawia wszystkim | widzi wyłącznie swoje |
| Przedmioty i poziomy | tworzy i edytuje | tylko odczyt (potrzebny do zapisu lekcji) |
| Speaking Club | odznacza każdemu, cofa pomyłki | odznacza swoim uczniom |
| Rachunki, wpłaty, salda | pełny dostęp | `403` — widzi wyłącznie flagę „Rozliczenia OK / Zaległość”, bez kwot |
| Grafik i dyspozycyjność | wszyscy nauczyciele, z filtrem | tylko własny grafik — cudze `teacherId` jest ignorowane |
| Moduł NDG i statystyki | pełny dostęp | `403` na całym module |
| Wiadomości | wysyła i widzi skrzynkę nadawczą z odczytami | tylko wiadomości do siebie; nie wysyła i nie widzi pozostałych odbiorców |
| Status płatności lekcji | ze wskazaniem rachunku | sam status (opłacona / do zapłaty / po terminie), bez numeru i kwoty |
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

## Przedmioty, poziomy i stawki

Cennik jest dwuwymiarowy: **przedmiot → poziom → osoba**.

- admin tworzy dowolne przedmioty (`Polski`, `Matematyka`…) i dowolną liczbę
  poziomów w każdym (`Ogólny`, `Maturalny`, `Rozszerzony`…),
- **stawka nauczyciela** i **cena ucznia** są ustalane osobno dla każdej
  kombinacji — jeden nauczyciel może brać 60 zł za polski ogólny i 80 zł za
  maturalny, a każdy uczeń ma własną cenę,
- **przedmiot i poziom są cechą lekcji, nie ucznia** — jeden uczeń może brać
  kilka przedmiotów; przy dodawaniu lekcji wybiera się uczeń → przedmiot →
  poziom → nauczyciel, a formularz od razu pokazuje obie kwoty,
- **bez ustalonej stawki lekcja się nie zapisze** — serwer odrzuca zapis
  i mówi, czego brakuje, żeby nie powstawały lekcje „za darmo”.

Wszystko w zakładce `/admin/przedmioty`: lista przedmiotów oraz dwie macierze
(nauczyciele × poziomy, uczniowie × poziomy) z edycją w komórkach.

## Speaking Club

Za każde **10 lekcji zrealizowanych** (niezależnie od przedmiotu) uczeń dostaje
jeden darmowy Speaking Club. Licznik i przycisk „Uczestniczył” są w karcie
ucznia w obu panelach — admin u każdego, nauczyciel u swoich. Każde odznaczenie
zapisuje datę i kto je wykonał; admin może cofnąć pomyłkę. Widok nie pokazuje
żadnych kwot.

## Płatności i rachunki (faza 2)

Każdy uczeń ma **tryb rozliczeń** (`Student.billingMode`), który decyduje o tym,
jak powstaje rachunek:

| Tryb | Jak działa | Kiedy lekcja jest „opłacona” |
| --- | --- | --- |
| `POSTPAID` | rachunek zbiorczy na koniec miesiąca | gdy rachunek za ten miesiąc jest opłacony w całości |
| `PER_LESSON` | osobny rachunek po każdej lekcji | gdy wpłaty pokrywają jej koszt |
| `PREPAID` | pakiet opłacany z góry | dopóki starcza wpłaconych środków (chronologicznie) |

**Status płatności liczy się na żywo** — od razu po odznaczeniu lekcji jako
zrealizowanej, bez czekania na rachunek. Rachunek pozostaje dokumentem (druk,
NDG), ale nie warunkuje tego, co widać w interfejsie. Tagi `Opłacona /
Częściowo / Nieopłacona / Po terminie` są przy lekcji w kalendarzu, w grafiku
i w historii lekcji ucznia.

**Saldo ucznia = wpłaty − wartość lekcji zrealizowanych.** Dodatnie to środki
na koncie (np. reszta pakietu), ujemne to zaległość. Dzięki liczeniu z lekcji,
a nie z rachunków, lekcja ponad opłacony pakiet od razu daje minus — wcześniej
saldo pokazywało w takiej sytuacji zero.

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

## Temat zajęć

Nauczyciel wpisuje temat **przy samej lekcji** — w kalendarzu (`Kalendarz lekcji`)
i w kafelku dnia w `Grafiku`. Bez osobnej zakładki: pole jest zwinięte do linijki
„+ Dodaj temat”, a po zapisaniu pokazuje „Temat: …”. Temat widać wszędzie tam,
gdzie widać lekcję — również w historii lekcji ucznia i w panelu admina.

- to krótka notka (`Lesson.topic`, do 200 znaków), a nie pełny szablon notatki
  z lekcji (co było / jak poszło / cel / co dalej) — ten zostaje na fazę 2
  jako osobny model `LessonNote`,
- **temat wolno dopisać także do lekcji ujętej na rachunku**: termin i status są
  wtedy zamrożone, ale opis nie zmienia treści dokumentu, a nauczyciel uzupełnia
  go po zajęciach,
- zakres jak wszędzie: nauczyciel edytuje temat tylko własnych lekcji (cudza
  lekcja to `404`), admin może poprawić każdy.

## Wiadomości

Administrator pisze do **jednego nauczyciela albo do wszystkich naraz**
(`/admin/wiadomosci`). Nauczyciel czyta swoją skrzynkę w `/nauczyciel/wiadomosci`.

- stan przeczytania jest **per odbiorca** (`MessageRecipient.readAt`), więc
  wysyłka zbiorcza działa dokładnie tak samo jak pojedyncza,
- przy zakładce „Wiadomości” w menu nauczyciela zapala się **czerwona kropka
  z liczbą nieprzeczytanych**; gaśnie po oznaczeniu wiadomości jako
  przeczytanej (pojedynczo albo hurtem),
- wysyłka zbiorcza trafia do nauczycieli **aktywnych w chwili wysłania** —
  konto założone później nie dostaje starych wiadomości,
- nauczyciel nie widzi listy pozostałych odbiorców; admin widzi potwierdzenia
  odczytu z datami,
- usunięcie wiadomości przez admina kasuje ją też ze skrzynek nauczycieli.

## Limit NDG i statystyki finansowe

Moduł `/admin/ndg` pilnuje limitu przychodu w działalności nierejestrowanej
i liczy statystyki finansowe.

> **To narzędzie pomocnicze, nie doradztwo podatkowe.** Aplikacja nie zna
> przepisów — liczy to, co jej wpiszesz. Kwota limitu, okres rozliczenia
> i podstawa przychodu są ustawieniami; potwierdź je z księgowym przed użyciem
> w rozliczeniach. W kodzie nie ma żadnej zaszytej kwoty ani stawki.

Jak to liczy:

- **kwoty limitu mają historię obowiązywania** (`NdgMonthlyLimit`): limit
  miesięczny obowiązuje od wskazanego miesiąca do kolejnego wpisu, a **limit
  kwartału to suma limitów jego miesięcy** — dzięki temu zmiana kwoty w trakcie
  kwartału liczy się poprawnie,
- brak kwoty dla któregokolwiek miesiąca okresu daje status `UNKNOWN`, a nie
  zmyśloną liczbę,
- **podstawa przychodu** jest przełącznikiem: należny (z wystawionych rachunków,
  bez anulowanych) albo kasowy (z wpłat),
- **prognoza**: średnia dzienna z dotychczasowej części okresu, przewidywany
  przychód na koniec i data wyczerpania limitu przy obecnym tempie.

Progi i ostrzeżenie:

| Status | Próg | Gdzie widać |
| --- | --- | --- |
| `OK` | < 70% | metr na stronie modułu |
| `WATCH` | ≥ 70% | pas u góry strony |
| `WARNING` | ≥ próg ostrzeżenia (domyślnie **90%**) | pas u góry: modułu, pulpitu i ekranu rachunków |
| `EXCEEDED` | ≥ 100% | jw., w wariancie krytycznym |

Próg ostrzeżenia jest ustawieniem (10–100%). Każdy status niesie ikonę
i podpis — kolor nigdy nie jest jedynym nośnikiem znaczenia.

### Wyłączenie po założeniu firmy

Przełącznik **„Pilnuj limitu działalności nierejestrowanej”** (`NdgSettings.enabled`)
wyłącza całą część limitową: znika metr, tabela okresów i pas ostrzegawczy,
a moduł zostaje jako **statystyki finansowe** — miesiąc / kwartał / rok,
z rozbiciem na każdego nauczyciela (lekcje, przychód, koszt wypłat, marża).
Datę przejścia na działalność rejestrowaną można zapisać w ustawieniach.

## Grafik i dyspozycja

Zakładka `Grafik i dyspozycja` (`/nauczyciel/grafik`, `/admin/grafik`) pokazuje
tydzień w siedmiu kolumnach: okna dyspozycyjności, zapisanych uczniów i **status
płatności każdej lekcji**.

- **nauczyciel** zarządza własnymi oknami i zapisuje uczniów; przy zapisie
  dostaje listę wolnych godzin wyliczoną z jego dyspozycyjności (okna minus
  lekcje już zajmujące termin; odwołana lekcja zwalnia termin),
- **admin** widzi dyspozycyjność i zajęcia wszystkich, filtruje po nauczycielu,
  a po wybraniu jednego może dopisać mu okno albo zapisać ucznia na lekcję.

Status płatności lekcji (`getLessonPaymentStates`) liczy się tak:

| Status | Kiedy |
| --- | --- |
| `PAID` | lekcja jest na rachunku, który ma zerowe saldo — albo mieści się w **opłaconym** pakiecie |
| `UNPAID` | rachunek wystawiony, termin jeszcze nie minął |
| `OVERDUE` | rachunek wystawiony, termin minął |
| `NOT_INVOICED` | lekcja nie trafiła jeszcze na żaden rachunek ani nie mieści się w pakiecie |

W trybie `PREPAID` jednostki pakietu przydzielane są **chronologicznie**: pierwsze
lekcje zużywają to, co opłacone, kolejne to, co wystawione, a reszta czeka na
nowy pakiet. Lekcje odwołane nie zużywają jednostek. Te same statusy widać na
kalendarzu (`/nauczyciel/kalendarz`, `/admin/lekcje`).

## Struktura

```
prisma/
  schema.prisma        # model danych (faza 1 + pola pod kolejne fazy)
  seed.ts              # admin + opcjonalne dane demo
src/
  app/
    login/             # logowanie
    nauczyciel/        # panel nauczyciela (pulpit, grafik, kalendarz, wypłaty)
    admin/             # panel administratora
    api/               # REST API (te same serwisy, ta sama autoryzacja)
    actions/           # Server Actions formularzy
  components/          # UI współdzielone przez oba panele
  lib/
    auth.ts            # Actor (kto pyta) + strażnicy ról
    services/          # LOGIKA I UPRAWNIENIA: students, teachers, lessons,
                       # finance, billing, schedule, ndg, messages
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
| `GET` | `/api/schedule` | `?week=RRRR-MM-DD&teacherId=` — grafik tygodnia; nauczyciel zawsze dostaje własny |
| `GET` | `/api/subjects` | przedmioty z poziomami |
| `GET`/`POST` | `/api/messages` | GET: admin — skrzynka nadawcza, nauczyciel — odbiorcza. POST (admin): `{subject, body, recipient: "ALL" \| teacherId}` |
| `POST`/`DELETE` | `/api/messages/{id}` | POST: nauczyciel oznacza swoją wiadomość jako przeczytaną. DELETE: admin usuwa |
| `GET` | `/api/ndg` | `?year=&period=` — przegląd limitu; `?scope=MONTH\|QUARTER\|YEAR` — statystyki finansowe |

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
rozliczeń. Grafik ma własny zestaw: zawężenie do własnej dyspozycyjności,
ignorowanie cudzego `teacherId`, wyliczanie wolnych godzin i statusy płatności
lekcji (także dla pakietów). Moduł NDG ma własny zestaw: sumowanie limitu
kwartału z limitów miesięcy, zmianę kwoty w trakcie roku, progi ostrzeżeń,
prognozę, obie podstawy przychodu i pracę po wyłączeniu pilnowania limitu.
Wiadomości sprawdzają zakres skrzynek, wysyłkę zbiorczą (z pominięciem kont
zablokowanych) i licznik nieprzeczytanych stojący za czerwoną kropką.

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
| `npm run setup` | migracje + dane demonstracyjne (pierwsze uruchomienie) |
| `npm run db:seed` | samo konto admina |
| `npm run db:seed:demo` | dane demonstracyjne |
| `npm run db:reset` | czyści bazę i wgrywa świeże demo |
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
(`Lesson.googleEventId` jest już zarezerwowane). Z fazy 3 zostały: eksport
ewidencji do PIT-36 i automatyczne wezwania do zapłaty (**reguły podatkowe do
potwierdzenia z księgowym**). Faza 4 to wsparcie AI przy notatkach.
