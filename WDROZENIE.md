# Wdrożenie KorkiGO CRM — lista kontrolna

Kolejność ma znaczenie: punkty z sekcji **A** muszą być zrobione, zanim
cokolwiek ruszysz, a **D** zanim wpuścisz pierwszego prawdziwego ucznia.

Przy każdym punkcie stoi, **co się stanie, jeśli go pominiesz** — bo część
rzeczy nie psuje się głośno, tylko po cichu.

---

## A. Zanim uruchomisz (blokujące)

### A1. Hosting z Node i Postgresem

- [ ] Wybrany hosting uruchamia **Node.js**, nie tylko PHP
- [ ] Jest **Postgres** (ten sam hosting albo osobny: Neon, Supabase)
- [ ] CRM stoi na subdomenie, np. `crm.korkigo.pl` — stronę `korkigo.pl` zostaw

> Twój obecny hosting pod `korkigo.pl` prawie na pewno **nie wystarczy**: to
> aplikacja serwerowa z bazą, nie strona WWW. Najprościej Railway (Node +
> Postgres w jednym) albo Vercel + Neon.

### A2. Aplikacja stoi za proxy

- [ ] Przed aplikacją jest proxy nadpisujące `X-Forwarded-For` (Railway,
      Vercel, Cloudflare, nginx)

> **Nie wystawiaj aplikacji bezpośrednio na świat.** Klucz limitu zapytań bierze
> się z tego nagłówka — bez proxy każdy poda w nim losową wartość i limit
> przestaje istnieć. Railway i Vercel robią to same.

### A3. HTTPS

- [ ] Domena ma certyfikat, `http://` przekierowuje na `https://`

> Ciasteczko sesji ma flagę `secure` na produkcji. Po `http://` **logowanie
> po prostu nie zadziała** — i to jest celowe.

### A4. Zmienne środowiskowe — wymagane

- [ ] `DATABASE_URL` — adres Postgresa
- [ ] `AUTH_SECRET` — **min. 32 znaki, losowe**: `openssl rand -base64 32`
- [ ] `SEED_ADMIN_EMAIL` — Twój adres do logowania
- [ ] `SEED_ADMIN_PASSWORD` — min. 12 znaków, spoza listy popularnych
- [ ] `CRON_SECRET` — `openssl rand -base64 32`
- [ ] Żadna z nich nie jest w repozytorium (`.env` jest w `.gitignore`)

> `AUTH_SECRET` krótszy niż 32 znaki nie wywala aplikacji przy starcie —
> **wywala się dopiero przy pierwszym logowaniu**. Serwer wstanie i będzie
> wyglądał zdrowo, więc sprawdź logowanie od razu po wdrożeniu (B3).
> Bez `SEED_ADMIN_PASSWORD` seed się nie wykona: konto admina nie ma hasła
> domyślnego i tak ma zostać.
>
> Bez `CRON_SECRET` oba crony zwracają 503 — czyli nie ma przypomnień,
> nie ma synchronizacji kalendarza **i nie kasują się adresy IP z dziennika
> bezpieczeństwa** (to ostatnie dotyczy RODO, patrz D3).

### A5. Zmienne opcjonalne — świadoma decyzja

- [ ] `ENCRYPTION_KEY` — ustawić albo świadomie zostawić puste

> Puste = klucz wyprowadzamy z `AUTH_SECRET`. Działa, ale wtedy **rotacja
> `AUTH_SECRET` unieważnia tokeny Google** i nauczyciele muszą ponownie
> podłączyć kalendarz. Osobny klucz pozwala wymienić jedno bez drugiego.

- [ ] Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_NAME`, `TELEGRAM_WEBHOOK_SECRET`
- [ ] SMS: `SMS_PROVIDER=smsapi` + `SMS_API_TOKEN` + `SMS_SENDER` **albo**
      świadoma zgoda na brak SMS-ów
- [ ] Google Calendar: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
      `GOOGLE_REDIRECT_URI` (musi wskazywać na `https://…/api/google/callback`)
      oraz `GOOGLE_CALENDAR_PROVIDER=google`

> **Pułapka:** `SMS_PROVIDER=log` na produkcji jest traktowany jako BRAK
> konfiguracji i zwraca błąd. To zamierzone — wcześniej raportował sukces,
> więc przypomnienie zapisywało się jako wysłane, choć nikt go nie dostał.
> Jeśli nie podpinasz SMS-ów, ustaw uczniom kanał Telegram albo „brak".
>
> To samo z `GOOGLE_CALENDAR_PROVIDER=log` — nie rusza sieci.

---

## B. Uruchomienie

### B1. Migracje

- [ ] `npx prisma migrate deploy`
- [ ] `npx prisma migrate status` mówi „Database schema is up to date"

> **Nigdy `migrate dev` na produkcji** — potrafi skasować i odtworzyć bazę.
> Wpisz `migrate deploy` w procedurę każdego wdrożenia, nie tylko pierwszego.

### B2. Konto administratora

- [ ] `npm run db:seed`
- [ ] **NIE** `npm run setup` ani `npm run db:seed:demo`

> `npm run setup` to `migrate deploy` **+ seed z danymi demonstracyjnymi** —
> wrzuci Ci przykładowych uczniów, nauczycieli z hasłem `nauczyciel123`
> i rachunki. Na produkcji to ostatnia rzecz, jakiej chcesz.
>
> Gdyby jednak trafiły: skasuj je przed wpuszczeniem prawdziwych danych.

### B3. Pierwsze logowanie

- [ ] Logowanie na `/login` działa po HTTPS
- [ ] **Włącz 2FA** w Ustawieniach
- [ ] **Zapisz 8 kodów zapasowych poza komputerem**

> Bez kodów zapasowych utrata telefonu zamyka Ci dostęp do własnego CRM-a
> na zawsze. Pokazujemy je **jeden raz**.

### B4. Crony — raz na godzinę

- [ ] `GET /api/cron/reminders` z nagłówkiem `Authorization: Bearer $CRON_SECRET`
- [ ] `GET /api/cron/calendar` z tym samym nagłówkiem
- [ ] Sprawdzone, że zwracają 200, a nie 503 (= brak sekretu) ani 401 (= zły sekret)

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" https://crm.korkigo.pl/api/cron/reminders
```

---

## C. Pierwsze dane — w tej kolejności

Kolejność nie jest dowolna: **lekcji nie da się zapisać bez stawki nauczyciela
I ceny ucznia** dla danej kombinacji przedmiot/poziom. To celowa blokada —
nie chcemy lekcji „za darmo", które potem nie wejdą do rozliczeń.

- [ ] **1. Przedmioty i poziomy** (`/admin/przedmioty`)
- [ ] **2. Nauczyciele** — konta z hasłami startowymi (min. 12 znaków)
- [ ] **3. Stawki nauczycieli** — macierz w `/admin/przedmioty`
- [ ] **4. Uczniowie** + ich ceny per przedmiot/poziom
- [ ] **5. Tryb rozliczeń każdego ucznia** (POSTPAID / PER_LESSON / PREPAID)
- [ ] **6. Dane wystawcy** (`/admin/ustawienia`) — trafiają na rachunki
- [ ] **7. Limit NDG** (`/admin/ndg`) — kwoty miesięczne i próg ostrzeżenia
- [ ] **8. Materiały w bazie wiedzy** (opcjonalnie)

> Stawka nauczyciela jest też **przypisaniem przedmiotu**: decyduje, co widzi
> w bazie wiedzy i jakie lekcje może zapisać. Bez niej nauczyciel jest
> odcięty od przedmiotu.

- [ ] Hasła startowe przekazane nauczycielom **bezpiecznym kanałem**, nie mailem
- [ ] Nauczyciele poproszeni o zmianę hasła przy pierwszym logowaniu

---

## D. Zanim wpuścisz prawdziwych uczniów

### D1. Kopie zapasowe bazy

- [ ] Automatyczne kopie włączone po stronie hostingu
- [ ] **Odtworzenie przetestowane raz, na próbę**

> To jedyna rzecz z całej listy, której **nie da się nadrobić po fakcie**.
> Aplikacja nie robi kopii sama — to zadanie hostingu. Kopia, której nigdy
> nie odtworzyłeś, nie jest kopią, tylko nadzieją.

### D2. Przypomnienia naprawdę docierają

- [ ] Wysłane przypomnienie testowe na własny numer/konto
- [ ] W panelu widać status `SENT`, a wiadomość faktycznie przyszła

> Status w panelu i wiadomość w telefonie to dwie różne rzeczy. Sprawdź obie.

### D3. RODO — dokumenty, nie kod

- [ ] Polityka prywatności opublikowana
- [ ] Ustalona podstawa prawna przetwarzania
- [ ] Umowa powierzenia z hostingiem (i z dostawcą SMS, jeśli jest)
- [ ] Zgody opiekunów, jeśli uczniowie są nieletni

> Trzymasz `parentName`, `parentPhone`, `parentEmail` — dane wskazujące na
> nieletnich. Aplikacja ma narzędzia (eksport, anonimizacja, przegląd
> retencji), ale **o tym, czy wolno i jak długo, decydujesz Ty**, nie kod.

### D4. Podatki do potwierdzenia z księgowym

- [ ] Reguły limitu NDG potwierdzone
- [ ] Ewidencja przychodu (PIT-36) obejrzana przez księgowego

> Moduły nie mają zaszytej **ani jednej** stawki podatkowej — liczą to, co
> wpiszesz. W interfejsie stoi zastrzeżenie, że to narzędzie pomocnicze.
> Zanim oprzesz na tym rozliczenie, pokaż je komuś, kto za to odpowiada.

---

## E. Pierwszy tydzień

- [ ] `/admin/bezpieczenstwo` sprawdzone — czy ktoś próbuje się dobijać
- [ ] Logi hostingu przejrzane pod kątem błędów `[identyfikator]`
- [ ] Nauczyciele weszli na swoje konta i zmienili hasła
- [ ] Pierwszy rachunek wystawiony i wydrukowany na próbę
- [ ] Pas ostrzegawczy limitu NDG pokazuje sensowną liczbę

---

## F. Rzeczy, o których warto wiedzieć

Nie blokują wdrożenia, ale lepiej je znać, niż odkryć w złym momencie.

| Rzecz | Stan |
|---|---|
| Licznik limitu zapytań | w pamięci procesu — zeruje się przy restarcie i nie jest wspólny dla kilku instancji. Blokada logowania po nieudanych próbach jest osobna i **siedzi w bazie**, więc ta przeżyje |
| Limit rozmiaru żądania | 256 kB, liczony z `Content-Length`. Żądanie „chunked" go ominie — limit hostingu zostaje drugą barierą |
| `style-src` w CSP | ma `'unsafe-inline'`, bo React wstawia style atrybutem. Stylem nie wykonasz kodu |
| `npm audit` | zostają podatności w `braces`/`micromatch` i `@vitest/mocker` — **tylko zależności deweloperskie**, nie trafiają na produkcję; dla `braces` nie ma jeszcze poprawki |
| Wysyłka notatki do ucznia | nie istnieje — jest kopiowanie do schowka |
| Aplikacja mobilna | odłożona; wymagałaby uwierzytelniania tokenem (dziś sesja to ciasteczko `httpOnly`) |

---

## G. Procedura każdego kolejnego wdrożenia

- [ ] `npm test` przechodzi
- [ ] `npm run build` przechodzi
- [ ] `npx prisma migrate deploy`
- [ ] Sprawdzone, że logowanie działa po wdrożeniu
