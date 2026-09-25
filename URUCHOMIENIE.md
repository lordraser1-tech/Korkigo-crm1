# Jak uruchomić KorkiGO CRM na swoim komputerze

Instrukcja do **testów lokalnych** — krok po kroku, od zera do działającej
aplikacji z przykładowymi danymi. Całość zajmuje kilkanaście minut, z czego
większość to pobieranie plików.

Aplikacja działa wtedy pod adresem **http://localhost:3000** i jest widoczna
tylko na Twoim komputerze.

---

## 1. Zainstaluj dwie rzeczy

**Node.js 20 lub nowszy** — https://nodejs.org (wersja LTS, instalator „next,
next, finish”).

**Docker Desktop** — https://www.docker.com/products/docker-desktop
Posłuży wyłącznie do uruchomienia bazy danych, żebyś nie musiał instalować
PostgreSQL ręcznie. Po instalacji **uruchom Docker Desktop** i poczekaj, aż
w rogu pokaże się, że działa.

> Masz już PostgreSQL na komputerze? Możesz pominąć Dockera — patrz
> „Wariant bez Dockera” na końcu.

Sprawdź w terminalu (Windows: PowerShell, macOS: Terminal), że działają:

```bash
node -v      # powinno pokazać v20.x albo nowszą
docker -v    # powinno pokazać wersję Dockera
```

---

## 2. Pobierz kod

```bash
git clone https://github.com/lordraser1-tech/Korkigo-crm1.git
cd Korkigo-crm1
git checkout claude/crm-nextjs-cloude-x1u8po
```

Nie masz `git`? Wejdź na stronę repozytorium, **Code → Download ZIP**,
rozpakuj i otwórz folder w terminalu.

---

## 3. Zainstaluj zależności

```bash
npm install
```

Potrwa 1–3 minuty i wypisze sporo tekstu — to normalne. Ostrzeżenia
(`warn`) można zignorować, liczy się brak `error`.

---

## 4. Uruchom bazę danych

```bash
docker compose up -d
```

To wszystko — Postgres wstaje w tle na porcie 5432, z użytkownikiem `korkigo`
i hasłem `korkigo`. Sprawdzisz to komendą `docker ps`.

---

## 5. Utwórz plik `.env`

W folderze projektu skopiuj `.env.example` do `.env`:

- **Windows (PowerShell):** `Copy-Item .env.example .env`
- **macOS / Linux:** `cp .env.example .env`

Otwórz `.env` w notatniku i wklej poniższe dwie linie w miejsce istniejących
(pozostałe zostaw):

```
DATABASE_URL="postgresql://korkigo:korkigo@localhost:5432/korkigo?schema=public"
AUTH_SECRET="wklej-tutaj-wynik-komendy-ponizej"
```

`AUTH_SECRET` to losowy ciąg podpisujący ciasteczko logowania — musi mieć
min. 32 znaki. Wygenerujesz go tak (działa na każdym systemie):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Zostaw też `SEED_ADMIN_EMAIL` i `SEED_ADMIN_PASSWORD` — to dane konta
administratora, którym się zalogujesz.

Reszty zmiennych z `.env.example` (`CRON_SECRET`, `TELEGRAM_*`, `SMS_*`) do
testów na własnym komputerze **nie musisz uzupełniać** — dotyczą wysyłki
przypomnień i przydadzą się dopiero na produkcji. Bez nich aplikacja działa
normalnie, a próba wysyłki zapisuje w bazie czytelny błąd zamiast się wywalać.

---

## 6. Przygotuj bazę i wgraj dane testowe

```bash
npm run setup
```

Jedna komenda: tworzy tabele i wypełnia je przykładowymi danymi
(2 nauczycieli, 4 uczniów, lekcje wstecz i do przodu, rachunki, wpłaty,
limit NDG i wiadomości). Na końcu zobaczysz listę utworzonych rzeczy.

Możesz ją spokojnie powtórzyć — drugi przebieg niczego nie dubluje, tylko
wypisze „już istnieje — pomijam”. Żeby zacząć od czystych danych, użyj
`npm run db:reset`.

---

## 7. Uruchom aplikację

```bash
npm run dev
```

Otwórz **http://localhost:3000**

Zatrzymasz ją w terminalu skrótem **Ctrl + C**.

---

## Konta do testów

| Rola | Login | Hasło |
| --- | --- | --- |
| Administrator | `admin@korkigo.pl` | to z `SEED_ADMIN_PASSWORD` w `.env` |
| Nauczycielka | `anna.kowalska@korkigo.pl` | `nauczyciel123` |
| Nauczyciel | `piotr.nowak@korkigo.pl` | `nauczyciel123` |

**Zaloguj się na dwa konta naraz** — jedno w zwykłym oknie, drugie w oknie
prywatnym/incognito. Wtedy najlepiej widać granice uprawnień: Anna nie widzi
stawek uczniów ani danych Piotra, a administrator widzi wszystko.

### Co warto kliknąć

- **Panel admina → Limit NDG** — wykorzystanie limitu kwartału (demo jest
  ustawione tak, że wchodzi w próg ostrzeżenia) i statystyki finansowe.
- **Panel admina → Rachunki** — wystaw rachunek i otwórz go: jest przycisk
  „Drukuj”, wydruk zawiera sam dokument.
- **Panel admina → Wiadomości** — wyślij coś do wszystkich; w panelu
  nauczyciela przy „Wiadomości” zapali się czerwona kropka.
- **Panel nauczyciela → Grafik i dyspozycja** — dodaj okno dyspozycyjności na
  konkretny dzień, a potem kliknij „Powtórz z zeszłego tygodnia” albo
  „Skopiuj ten tydzień na cały miesiąc”; zapisz ucznia na wolny termin
  i wpisz temat zajęć przy lekcji.
- **Kalendarz lekcji** — przełącznik „Lista / Miesiąc” nad listą; wybór
  zostaje zapamiętany w przeglądarce.
- **Odwołanie lekcji** — rozwiń „Odwołaj lekcję” przy dowolnej lekcji i cofnij
  datę zgłoszenia: procent naliczenia zmienia się na oczach (24 h → 0%,
  12–24 h → 50%, mniej → 100%). Korektę kwoty zobaczysz tylko jako admin.
- **Panel admina → karta ucznia** — kafelek „Rozliczenia” pokazuje lekcje bez
  rachunku i wystawia rachunek dokładnie na nie; niżej filtry historii lekcji
  (zaplanowane / nieopłacone / opłacone).
- **Panel admina → Rozliczenia** — rejestr wypłat: ile komu się należy;
  wypłatę oznaczasz w karcie nauczyciela.
- **Panel nauczyciela → Moje wypłaty** — kwota oczekująca i historia wypłat
  (bez informacji, kto je oznaczył).

---

## Codzienna praca

| Co chcesz zrobić | Komenda |
| --- | --- |
| Uruchomić aplikację (baza już stoi) | `npm run dev` |
| Zatrzymać aplikację | `Ctrl + C` w terminalu |
| Zatrzymać bazę | `docker compose down` |
| Włączyć bazę z powrotem | `docker compose up -d` |
| Wyczyścić dane i wgrać świeże demo | `npm run db:reset` (kasuje wszystko z bazy) |
| Podejrzeć bazę w przeglądarce | `npm run db:studio` |
| Uruchomić testy | `npm test` |

Po zatrzymaniu komputera dane zostają — wracasz komendami
`docker compose up -d` i `npm run dev`.

---

## Gdy coś nie działa

**`Error: P1001: Can't reach database server`**
Baza nie działa. Uruchom Docker Desktop, potem `docker compose up -d`.

**`AUTH_SECRET musi być ustawiony i mieć min. 32 znaki`**
W `.env` brakuje `AUTH_SECRET` albo jest za krótki — wygeneruj go komendą
z kroku 5.

**`port 5432 is already allocated`**
Masz już PostgreSQL działający na tym porcie. Albo go wyłącz, albo w
`docker-compose.yml` zmień `"5432:5432"` na `"5433:5432"` i w `.env` wpisz
`localhost:5433`.

**`Port 3000 is in use`**
Uruchom na innym porcie: `npm run dev -- -p 3001`.

**Strona pokazuje błąd po zalogowaniu**
Najczęściej znaczy, że baza jest pusta — uruchom `npm run setup`.

**Zmieniłeś `.env`, a aplikacja nadal używa starych ustawień**
Zatrzymaj `npm run dev` (Ctrl + C) i uruchom ponownie.

---

## Wariant bez Dockera

Jeśli masz własnego PostgreSQL:

1. Utwórz bazę i użytkownika, np. `korkigo` / `korkigo` / baza `korkigo`.
2. W `.env` wpisz swój `DATABASE_URL`
   (`postgresql://użytkownik:hasło@localhost:5432/nazwa_bazy?schema=public`).
3. Dalej tak samo: `npm install`, `npm run setup`, `npm run dev`.

---

## Czego ta instrukcja NIE obejmuje

To konfiguracja **testowa na jednym komputerze**, nie produkcyjna: hasło do
bazy jest jawne, aplikacja chodzi po HTTP, a dane demo są zmyślone. Zanim
wpuścisz tu prawdziwych uczniów i nauczycieli, potrzebny jest hosting
z HTTPS (Railway, Vercel + Neon/Supabase), własne `AUTH_SECRET`, kopie
zapasowe bazy i — dla modułu NDG — potwierdzenie kwot limitu z księgowym.
Sekcja „Wdrożenie” w [`README.md`](./README.md) opisuje pierwsze kroki.
