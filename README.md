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
  z lekcji (co było / jak poszło / cel / co dalej) — ten siedzi osobno,
  na zakładce „Notatki z lekcji”,
- **temat wolno dopisać także do lekcji ujętej na rachunku**: termin i status są
  wtedy zamrożone, ale opis nie zmienia treści dokumentu, a nauczyciel uzupełnia
  go po zajęciach,
- zakres jak wszędzie: nauczyciel edytuje temat tylko własnych lekcji (cudza
  lekcja to `404`), admin może poprawić każdy.

## Notatki z lekcji

Po zajęciach nauczyciel opisuje je szablonem z czterech pól: **co było / jak
poszło / cel / co dalej**. Zakładka `Notatki z lekcji` dzieli się na dwie
części: „do uzupełnienia" (odbyte lekcje bez notatki — stąd liczba przy
pozycji w menu) i „zapisane notatki".

- nauczyciel widzi **wyłącznie notatki ze swoich lekcji**, admin wszystkie
  i może po nich szukać (`/admin/notatki`) — po treści, uczniu, nauczycielu,
  przedmiocie i temacie zajęć,
- zakres idzie po **nauczycielu lekcji**, nie po dzisiejszym opiekunie ucznia:
  przepisanie ucznia nie oddaje nowemu nauczycielowi notatek z zajęć, których
  nie prowadził, ani nie odcina autora od własnych,
- jedna notatka na lekcję — ponowny zapis nadpisuje. Wystarczy wypełnić jedno
  pole, ale notatki całkiem pustej nie zapiszemy,
- na liście „do uzupełnienia" są lekcje **zrealizowane i nieobecności**.
  Zaplanowanej nie ma czego opisywać, a odwołana się nie odbyła,
- notatka **nie zawiera żadnych kwot**, więc widok jest ten sam dla obu ról,
- „Kopiuj notatkę" wkleja ją do schowka jako zwykły tekst z etykietami — do
  przesłania uczniowi. Wysyłki wprost z systemu jeszcze nie ma,
- w karcie ucznia stoi skrót z trzema ostatnimi notatkami i odnośnikiem do
  pełnej listy tego ucznia.

## Baza wiedzy

Linki do materiałów pomocniczych — podręczników, słowników, kanałów —
z **osobną zakładką dla każdego przedmiotu**. Dodaje, poprawia i kasuje
wyłącznie administrator (`/admin/baza-wiedzy`); nauczyciel czyta
(`/nauczyciel/baza-wiedzy`).

- **nauczyciel widzi tylko swoje przedmioty**: te, do których administrator
  ustawił mu stawkę. Stawka jest w tym systemie przypisaniem — bez niej
  nauczyciel i tak nie zapisze lekcji z danego przedmiotu,
- zawężenie dzieje się w zapytaniu do bazy, nie przez ukrycie zakładek:
  podstawiony `?przedmiot=` z cudzego przedmiotu nic nie pokaże,
- **przyjmujemy wyłącznie adresy http:// i https://**. `javascript:` wpisane
  w to pole wykonałoby się w przeglądarce nauczyciela po kliknięciu linku,
- linki otwierają się w nowej karcie z `rel="noopener"`, a pod tytułem widać
  adres strony, dokąd prowadzą,
- przedmiot wyłączony zostaje w panelu admina jako archiwum, ale znika
  nauczycielom.

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
- dyspozycyjność ustawia się **na konkretny dzień**, nie „na poniedziałki” —
  dzięki temu da się odwołać jeden tydzień bez ruszania reszty. Żeby to nie
  było mordęgą, są dwa skróty: „Powtórz z zeszłego tygodnia” i „Skopiuj ten
  tydzień na cały miesiąc” (duplikaty są pomijane, istniejące okna zostają),
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
kalendarzu (`/nauczyciel/kalendarz`, `/admin/lekcje`), który przełącza się
między listą a siatką miesiąca — wybór pamięta przeglądarka.

## Odwołania i nieobecności

Progi regulaminu siedzą **wyłącznie** w `src/lib/policy.ts` — reszta kodu pyta
o wynik, nie o liczby. Domyślnie:

| Kiedy uczeń zgłosił odwołanie | Ile płaci |
| --- | --- |
| 24 h przed lekcją i wcześniej | 0% |
| 12–24 h przed lekcją | 50% |
| poniżej 12 h (albo po terminie) | 100% |

Nieobecność bez odwołania to zawsze pełna cena. Nauczycielowi należy się
wypłata za nieobecność (czekał), ale nie za odwołanie — nawet gdy uczeń
zapłacił karę.

Odwołanie przechodzi **zawsze** przez `cancelLesson()` — `updateLesson()`
odrzuca status `CANCELLED`, więc ani REST, ani Server Action, ani skrypt nie
zapisze odwołania z pominięciem naliczenia. Nauczyciel nie dostaje kwot
odwołania (przy progu 100% byłyby dokładnie ceną ucznia) — widzi status
i moment zgłoszenia.

Liczy się moment **zgłoszenia**, nie moment kliknięcia w systemie: formularz
odwołania ma pole „Kiedy uczeń zgłosił odwołanie” (domyślnie teraz) i to od
niego zależy próg. Kwotę wyliczoną z regulaminu zapisujemy obok faktycznej
(`Lesson.cancellationAutoAmount` vs `cancellationAmount`), więc każda korekta
jest widoczna. Korektę wprowadza **tylko admin** i musi podać powód —
nauczyciel odwołuje lekcję, ale kwoty nie rusza.

## Zmiana terminu lekcji cyklicznej

Przy lekcji z serii formularz „Zmień termin” pyta o zakres:

- **tylko ta** — przesuwa jedną lekcję i odczepia ją od serii
  (`Lesson.detachedFromSeries`), więc kolejne zmiany zbiorcze jej nie ruszą,
- **ta i kolejne** — przesuwa następne lekcje serii o **tę samą różnicę**
  (nie ustawia im wspólnego terminu). Lekcje odczepione i ujęte na
  nieanulowanym rachunku zostają nietknięte.

## Wypłaty dla nauczycieli

`src/lib/services/payouts.ts`. „Ile się należy” to suma stawek nauczyciela za
lekcje kwalifikujące się do wypłaty (patrz wyżej), które nie zostały jeszcze
przypisane do żadnej wypłaty. Oznaczenie wypłaty (`Payout`) przypina do niej te
lekcje przez `Lesson.teacherPayoutId`, więc kolejne wyliczenie ich nie policzy —
ta sama lekcja nie trafi na dwie wypłaty. Cofnięcie wypłaty zwraca lekcje do
nierozliczonych.

- **admin**: rejestr wszystkich nauczycieli w `/admin/rozliczenia`, oznaczanie
  i cofanie wypłaty w karcie nauczyciela,
- **nauczyciel**: w „Moich wypłatach” widzi kwotę oczekującą i własną historię —
  bez informacji, kto wypłatę oznaczył, i bez cudzych rozliczeń.

Lekcja rozliczona z nauczycielem jest **zamrożona** dokładnie tak jak lekcja
na rachunku: nie da się jej usunąć, przestawić ani odwołać, dopóki admin nie
cofnie wypłaty. Bez tego wypłata zostawałaby z kwotą bez pokrycia w lekcjach.

Kwota wypłaty jest edytowalna (wypłata częściowa), ale lekcje przypinamy
zawsze wszystkie nierozliczone — inaczej nie dałoby się potem powiedzieć, co
jeszcze czeka na pieniądze.

## Przypomnienia o lekcji

`src/lib/services/reminders.ts`. Cron (`GET /api/cron/reminders`, chroniony
`CRON_SECRET`) bierze lekcje z okna 23–25 h przed terminem i wysyła jedno
przypomnienie na lekcję.

- kanał wybiera się per uczeń (`Student.reminderChannel`: brak / Telegram / SMS),
- **treść wiadomości jest w jednym miejscu** — `src/lib/reminders/template.ts`;
  adaptery kanałów tylko ją przenoszą,
- każda próba, także nieudana, zostawia wpis w `ReminderLog`
  (`@@unique([lessonId])`), więc cron nie zapętla się na błędzie, a admin ma
  ślad. Uczeń z kanałem „brak” jest pomijany bez wpisu — to nie jest próba,
- Telegram podpina się linkiem `/start <token>` z karty ucznia; token jest
  **jednorazowy** i wygasa po tygodniu. Webhook wymaga
  `TELEGRAM_WEBHOOK_SECRET`,
- SMS idzie przez dostawcę z `SMS_PROVIDER`; domyślne `log` tylko wypisuje treść
  do logów, więc cały przepływ da się przetestować bez płatnego konta,
- licznik wysyłek za bieżący miesiąc stoi w `/admin/ustawienia` — SMS-y kosztują.

Klucze API czytamy **wyłącznie ze zmiennych środowiskowych**, nigdy z kodu
i nigdy z bazy.

## Synchronizacja z Google Calendar

Jednokierunkowo: **CRM wypycha grafik, Google go tylko odzwierciedla.** Zmiana
zrobiona w kalendarzu nie wraca do systemu — terminy przestawia się w panelu.

Każdy nauczyciel podłącza własne konto w `Ustawienia → Kalendarz Google`
(OAuth). Admin widzi stan każdego połączenia w karcie nauczyciela i może je
wstrzymać albo rozłączyć, ale nie zaloguje się za kogoś.

- **w zdarzeniu nie ma żadnej kwoty** — ani ceny ucznia, ani stawki
  nauczyciela. Kalendarz bywa współdzielony i eksportowany, więc pieniądze tam
  nie trafiają. Idzie tytuł (`Polski · Ogólny — Olena Tkachenko`), temat zajęć
  i link do pokoju,
- lekcja odwołana jest usuwana z kalendarza; zrealizowana i nieobecność zostają,
- usunięcie lekcji zostawia nagrobek, więc zdarzenie znika także wtedy, gdy
  wiersza lekcji już nie ma,
- czas idzie jako ścienny plus strefa `Europe/Warsaw`, więc lekcja o 16:00
  zostaje o 16:00 po zmianie czasu,
- błąd jednego nauczyciela nie zatrzymuje pozostałych — ląduje w jego karcie.

Cron: `curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/calendar`.
Bez konta Google całość przetestujesz z `GOOGLE_CALENDAR_PROVIDER=log` —
wywołania lądują w pamięci zamiast lecieć do sieci.

## Ewidencja przychodu (PIT-36)

`/admin/ewidencja` — zestawienie roku: liczba porządkowa, data, dokument,
uczeń, kwota i suma narastająca. Do pobrania jako CSV i do druku.

**Aplikacja nie wylicza podatku.** Nie zna stawek ani kwoty wolnej i tak ma
zostać — podaje wyłącznie kwoty wynikające z dokumentów. Sposób ujęcia
przychodu potwierdź z księgowym; w interfejsie stoi to samo zastrzeżenie.

- podstawa (`przychód należny` z rachunków albo `kasowy` z wpłat) pochodzi
  z ustawień NDG, więc ewidencja i pas ostrzegawczy limitu liczą to samo,
- numeracja i suma narastająca idą przez cały rok, nie per miesiąc,
- anulowany rachunek wypada z ewidencji,
- CSV jest przygotowany pod polski Excel: średnik, przecinek dziesiętny i BOM.

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
                       # finance, billing, schedule, ndg, messages,
                       # payouts, reminders, calendar-sync, evidence,
                       # lesson-notes, knowledge-base
    policy.ts          # progi regulaminu (odwołania, wypłaty) — jedno miejsce
    password-policy.ts # siła hasła: długość + lista zakazanych
    log.ts             # błędy do logu bez danych osobowych
    reminders/         # treść przypomnień + adaptery kanałów
    google/            # OAuth Google + zapis zdarzeń w kalendarzu
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
Notatki z lekcji (`tests/lesson-notes.test.ts`) pilnują granicy ról — w tym
tego, że przepisanie ucznia innemu nauczycielowi **nie** przenosi notatek
z dawnych lekcji, że ucznia bierzemy z lekcji a nie z formularza i że szukanie
admina nie wycieka nauczycielowi. Baza wiedzy
(`tests/knowledge-base.test.ts`) sprawdza zakres przedmiotów nauczyciela,
odmowę zapisu dla roli TEACHER i odrzucanie adresów innych niż http(s) —
także przy edycji.
Dochodzą do tego: progi regulaminu odwołań (`tests/policy.test.ts`, bez bazy),
odwoływanie lekcji wraz z korektą kwoty zastrzeżoną dla admina i zakres edycji
serii (`tests/lessons.test.ts`), wypłaty — w tym to, że lekcja nie trafi na dwie
wypłaty (`tests/payouts.test.ts`), przypomnienia wraz ze śladem po nieudanej
wysyłce i jednorazowością tokenu Telegrama (`tests/reminders.test.ts`) oraz
dyspozycyjność i kopiowanie układu tygodnia (`tests/availability.test.ts`),
synchronizacja z Google Calendar — w tym brak kwot w zdarzeniu i to, że lekcje
jednego nauczyciela nie trafiają do kalendarza drugiego
(`tests/calendar-sync.test.ts`) — oraz ewidencja przychodu wraz z pilnowaniem,
że w wyniku nie ma żadnej stawki podatkowej (`tests/evidence.test.ts`).

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

## Bezpieczeństwo

Stan po przeglądzie przed wdrożeniem:

- uprawnienia egzekwowane w warstwie serwisowej, nie w UI (osobny rozdział wyżej),
- hasła: bcrypt z kosztem 12; blokada konta na 15 minut po 10 nieudanych próbach —
  czasowa, bo trwała pozwalałaby odciąć nauczyciela od pracy cudzymi próbami,
- logowanie nie zdradza, które konta istnieją: ten sam komunikat i ten sam czas
  odpowiedzi dla nieistniejącego adresu,
- sesja to podpisany JWT w ciasteczku `httpOnly`, `sameSite=lax`, `secure`
  na produkcji; **zmiana hasła unieważnia wszystkie wcześniejsze sesje**,
- powrót po zalogowaniu (`?next=`) przechodzi przez filtr odcinający adresy
  bezwzględne, także te protokołowo-względne (`//evil.pl`),
- tokeny Google leżą w bazie zaszyfrowane (AES-256-GCM, klucz ze środowiska),
- nagłówki: CSP z `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS na produkcji,
- endpointy crona i webhooka Telegrama chroni sekret ze środowiska.

- limit zapytań na całym `/api/*`: 120/min, a na logowaniu 10/min (odpowiedź
  429 z nagłówkiem `Retry-After`). Panel chodzi na Server Actions, więc
  zwykłego użytkownika to nie dotyka,
- dziennik zdarzeń w `/admin/bezpieczenstwo`: logowania udane i nieudane,
  blokady kont, zmiany haseł, adresy z największą liczbą prób. Wpisy starsze
  niż 90 dni kasują się same.

- **logowanie dwuetapowe (TOTP)** dla każdego konta, do włączenia w Ustawieniach:
  kod z aplikacji (Google Authenticator, Aegis, 1Password) plus 8 jednorazowych
  kodów zapasowych. Konfiguracja pokazuje kod QR do zeskanowania (rysowany
  u nas, bez żadnej usługi zewnętrznej), a sekret i adres `otpauth://`
  zostają schowane pod „Nie mogę zeskanować". Obowiązuje też w REST
  (`code` w `/api/auth/login`),
- **obsługa żądań RODO**: eksport danych ucznia do pliku JSON i anonimizacja,
  która nadpisuje dane osobowe — także snapshot nabywcy na rachunkach — ale
  zachowuje dokumenty księgowe. Przegląd retencji podpowiada, przy kim warto
  to rozważyć, i nic nie kasuje sam.

- **polityka haseł**: min. 12 znaków i lista zakazanych (`src/lib/password-policy.ts`),
  bez wymuszania wielkich liter i znaków specjalnych — za NIST SP 800-63B.
  Obowiązuje każdą ścieżkę: zakładanie konta, zmianę własnego hasła, reset
  przez admina i seed,
- **CSP z nonce'em** zamiast `'unsafe-inline'` w `script-src`, losowanym przy
  każdej odpowiedzi w `src/middleware.ts`,
- **limit rozmiaru żądania** 256 kB — odrzucany, zanim cokolwiek go sparsuje,
- **błędy w logach bez danych osobowych**: komunikat Prismy niesie wartości
  pól, więc zapisujemy tylko pierwszy wiersz, kod błędu i nazwy pól. Użytkownik
  dostaje ośmioznakowy identyfikator, po którym znajdziesz wpis w logu.

Czego **nie** ma i warto o tym wiedzieć przed wystawieniem na świat:

- licznik limitu zapytań żyje w pamięci procesu — zeruje się przy restarcie
  i nie jest współdzielony między instancjami. Dla jednego serwera wystarcza;
  przy kilku albo za CDN-em dołóż limit po stronie hostingu. Blokada logowania
  po nieudanych próbach jest osobną warstwą i **siedzi w bazie**, więc restart
  jej nie kasuje,
- klucz limitu bierze się z `x-forwarded-for`. **Nie wystawiaj aplikacji
  bezpośrednio na świat** — bez proxy, które ten nagłówek nadpisuje, każdy może
  go podać dowolny i ominąć limit,
- limit rozmiaru żądania opiera się na `Content-Length`; żądanie „chunked" go
  ominie, więc limit po stronie hostingu zostaje drugą barierą,
- `style-src` w CSP nadal ma `'unsafe-inline'` — React wstawia style atrybutem,
  którego nonce nie obejmuje. Stylem nie wykonasz kodu,
- `npm audit` zgłasza jeszcze podatności w `braces`/`micromatch` (przez
  `eslint-config-next`) i `@vitest/mocker`. Oba łańcuchy to **zależności
  deweloperskie** — nie trafiają na produkcję — a dla `braces` nie ma jeszcze
  wersji z poprawką. Podatności `postcss` i `deepmerge-ts` są domknięte przez
  `overrides` w `package.json`.

## Wdrożenie

Potrzebny jest Postgres i host uruchamiający Node (Railway, Vercel + Neon/Supabase).
Zmienne środowiskowe: `DATABASE_URL`, `AUTH_SECRET` oraz `SEED_ADMIN_EMAIL`
i `SEED_ADMIN_PASSWORD` przy pierwszym seedzie — hasło **nie ma wartości
domyślnej** i musi przejść politykę haseł, inaczej seed się nie wykona. Przypomnienia dokładają `CRON_SECRET`, a zależnie od kanału
`TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_NAME` / `TELEGRAM_WEBHOOK_SECRET` albo
`SMS_PROVIDER` / `SMS_API_TOKEN` / `SMS_SENDER` — komplet w `.env.example`.
Synchronizacja kalendarza dokłada `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
i `GOOGLE_REDIRECT_URI` (musi wskazywać na `/api/google/callback`).
Crony wołaj raz na godzinę: `/api/cron/reminders` i `/api/cron/calendar`,
oba z nagłówkiem `Authorization: Bearer $CRON_SECRET`. Na produkcji migracje uruchamiaj przez
`npx prisma migrate deploy`. Ciasteczko sesji jest `httpOnly`, `sameSite=lax`
i `secure` w trybie produkcyjnym — wymaga HTTPS.

## Co dalej

Z fazy 2 została wysyłka notatki do ucznia — dziś jest samo kopiowanie do
schowka, a kanały Telegram/SMS żyją w module przypomnień. Z fazy 3
zostały automatyczne wezwania do zapłaty i pełne raporty (**reguły podatkowe do
potwierdzenia z księgowym**). Faza 4 to wsparcie AI przy notatkach.

Aplikacja mobilna jest odłożona świadomie. Gdy wróci, pierwsze do zrobienia
jest uwierzytelnianie tokenem — dziś sesja to ciasteczko `httpOnly`, którego
apka nie użyje — i domknięcie REST-a: nie ma endpointów dla wypłat, Speaking
Clubu, dyspozycyjności ani zapisu przedmiotów.
