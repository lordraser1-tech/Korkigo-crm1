# Odpowiedź na audyt zewnętrzny

Dotyczy: „Audyt KorkiGO CRM", raport niezależnej weryfikacji z 5–6 października 2026.
Weryfikacja wykonana wobec `HEAD` = `255ae53`, gałąź `claude/crm-nextjs-cloude-x1u8po`.

---

## Wniosek na wstępie

**Audyt jest rzetelny i znalazł prawdziwe błędy, których sam nie wykryłem.**

Audytor badał kopię **sprzed 15 commitów** i sam to zaznaczył — uczciwie, na
pierwszej stronie. Część znalezisk dotyczy kodu, którego już nie ma. Ale
**22 z 34 ustaleń są nadal aktualne w najnowszej wersji**, w tym cztery
poważne, i trzy z nich **zaprzeczają wprost temu, co napisałem we własnej
dokumentacji**.

Nie traktuję tego jako sporu o wersję. Traktuję jako listę do naprawy.

---

## 1. Ustalenie wersji

Audytor podał, że badana kopia ma 8 serwisów, 15 modeli, 5 migracji, 126 testów
i ostatnią migrację `20260925133652_temat_lekcji`.

Sprawdziłem to w historii Gita. Odpowiada dokładnie commitowi:

```
333cf94  2026-09-25  Temat zajęć wpisywany przy lekcji
```

```bash
git show 333cf94:prisma/schema.prisma | grep -c "^model "   # 15 — zgadza się
git ls-tree 333cf94 src/lib/services/ --name-only | wc -l    # 8  — zgadza się
git rev-list 333cf94..HEAD --count                            # 15 commitów różnicy
```

Audytor miał rację także w tym, że nazwa katalogu nie jest dowodem wersji
i że bez `.git` nie da się tego potwierdzić. Paczka została mu przekazana bez
historii — to błąd po mojej stronie przy przygotowaniu materiału, nie jego.

**Wniosek operacyjny:** każdy kolejny audyt dostaje commit, lockfile i listę
migracji jako jedną całość. To zresztą punkt 1 z jego własnej listy TOP 10
i jest słuszny.

---

## 2. Co zostało naprawione przed audytem (11 ustaleń)

Audytor nie mógł tego zobaczyć. Każde z poniższych da się sprawdzić w HEAD.

| Ustalenie | Stan w HEAD | Commit | Jak sprawdzić |
|---|---|---|---|
| **F01** domyślne hasło admina w seedzie | naprawione — seed **nie wystartuje** bez `SEED_ADMIN_PASSWORD`, które przechodzi politykę haseł | `bef7b15` | `grep -n "adminPassword" prisma/seed.ts` |
| **F02** zmiana hasła nie unieważnia sesji | naprawione — `User.sessionsValidFrom` vs `iat` tokenu | `a9f1746` | `grep -rn "sessionsValidFrom" src/lib/auth.ts` |
| **F03** brak ochrony logowania | naprawione — blokada po 10 próbach (w bazie), limit 10/min w middleware, TOTP + kody zapasowe | `a9f1746`, `d39d84a`, `14baef1` | `src/lib/services/login-guard.ts`, `src/lib/services/two-factor.ts` |
| **F11** brak polityki odwołań | naprawione — `policy.ts`, `cancelLesson()`, `cancelledReportedAt`, progi; NO_SHOW **płatny** nauczycielowi | `3c793c1` | `grep -n "countsTowardsTeacherPayout" -A 6 src/lib/policy.ts` |
| **F20** „Moje wypłaty" to nie rejestr | naprawione — model `Payout`, `Lesson.teacherPayoutId`, blokada zmiany rozliczonej lekcji | `3c793c1` | `src/lib/services/payouts.ts` |
| **F22** brak obsługi cyklu życia danych osobowych | naprawione — eksport, anonimizacja (łącznie z `Invoice.buyerSnapshot`), przegląd retencji | `14baef1` | `src/lib/services/privacy.ts` |
| **F23** brak nagłówków ochronnych | naprawione — CSP z nonce'em losowanym per odpowiedź, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, HSTS na produkcji | `a9f1746`, `bef7b15` | `curl -I .../login` dwa razy — nonce musi się różnić |
| **F25** otwarte przekierowanie `//evil.pl` | naprawione — `safeNextPath()` | `a9f1746` | `src/lib/safe-redirect.ts` |
| **F26** REST ujawniał istnienie konta czasem odpowiedzi | naprawione — obie ścieżki mają `DUMMY_HASH_PROMISE` | `a9f1746` | `grep -n "DUMMY_HASH" src/app/api/auth/login/route.ts src/app/actions/auth.ts` |
| **F27** pełne wyjątki w logach | naprawione — `logError()`: pierwszy wiersz, kod, **nazwy pól bez wartości**, identyfikator dla użytkownika | `bef7b15` | `src/lib/log.ts` |
| **F28** podatności zależności | częściowo — 12 → 7 przez `overrides` (postcss, deepmerge-ts). Reszta to zależności deweloperskie | `bef7b15` | `npm audit` |

**Uwaga do F28:** audytor słusznie podważa zdanie „wszystko, co zostało, jest
tylko developerskie" — pisze, że Prisma CLI występuje w drzewie `--omit=dev`.
W HEAD `deepmerge-ts` jest domknięty przez `override`, więc ten konkretny
przypadek odpada, ale **jego metodologiczne zastrzeżenie jest słuszne** i tak
powinienem był to sformułować.

---

## 3. Co jest nadal aktualne (22 ustalenia)

Wszystkie poniższe sprawdziłem w HEAD. Przy tych oznaczonych „odtworzone"
uruchomiłem kod.

### Poważne

| # | Problem | Dowód w HEAD |
|---|---|---|
| **F07** | **Lekcja nie utrwala stawek.** Zmiana stawki dziś zmienia zarobki za zamknięty miesiąc i cenę starej, niezafakturowanej lekcji | model `Lesson` nie ma pól ceny/stawki; `billing.ts` woła `loadRateLookup()` i `resolveLessonRates()`, które czytają **bieżące** `TeacherRate`/`StudentRate` |
| **F04** | **Wyścig przy edycji ucznia.** Odczyt ma zakres właściciela, zapis idzie po samym `id` | `students.ts`: `findFirst({ where: { id, ...studentScope(actor) } })`, potem `update({ where: { id } })` |
| **F05** | **Zamrożenie lekcji nie jest atomowe.** `assertNotInvoiced()` to osobny odczyt przed zapisem, bez transakcji i blokady | `lessons.ts:345` i `:388` |
| **F06** | **Anulowanie rachunku liczy wpłaty poza transakcją** | `billing.ts:748` — odczyt `_count.payments`, dopiero `:763` `$transaction` |
| **F08** | **Brak kontroli kolizji i duplikatów lekcji** — `createMany` bez sprawdzenia zajętości ucznia i nauczyciela | `lessons.ts:272` |
| **F09** | **Brak idempotencji wpłat** — każde wywołanie tworzy nową wpłatę | `billing.ts:835`, brak klucza operacji |
| **F10** | **Lekcję z pakietu można obciążyć osobnym rachunkiem** — `createLessonInvoice` nie sprawdza trybu PREPAID | brak odwołania do `billingMode` w tej funkcji |

### Walidacja — tu wyszły moje własne błędy

| # | Problem | Dowód — **uruchomiony kod** |
|---|---|---|
| **F15** | **Kontrola dwóch miejsc po przecinku nie działa.** Mój własny komunikat obiecuje „maksymalnie dwa miejsca" | `amountSchema.safeParse("1.005")` → **przyjęte jako 1.005**. Tak samo `0.001`, `2.9999`, `0.555` |
| **F16** | **Puste pole liczbowe staje się zerem** | `dueDays: ""` → **0** (termin płatności = dziś), `unitPrice: ""` → **0** |
| **F17** | **Połowicznie naprawione.** Daty kalendarzowe odrzucane (`2026-13-45` → błąd), ale **godzina nieistniejąca przy zmianie czasu przechodzi po cichu**: podano `2026-03-29T02:30`, zapisano `03:30` | `d53bc67` naprawił kalendarz, nie DST |

### Procesowe i eksploatacyjne

| # | Problem | Stan |
|---|---|---|
| **F12** | Testy wykonują `TRUNCATE` na **każdej** niepustej `DATABASE_URL` | `describeDb = process.env.DATABASE_URL ? describe : describe.skip` |
| **F13** | Dwie miary zużycia pakietu (`coverageAmount` vs `charge`) | w HEAD spójne dla NO_SHOW, ale podział nadal istnieje — **wymaga ponownego testu**, nie uznaję za zamknięte |
| **F14** | Brak procesu przypisania zaliczki do rachunku | nadal |
| **F18** | Lekcję można zapisać uczniowi ENDED i nieaktywnemu nauczycielowi | brak kontroli statusu w `resolveLessonTarget` |
| **F19** | **Wydruk starego rachunku bierze bieżące ustawienia** — numer konta, adnotacja podatkowa i stopka | `rachunki/[id]/page.tsx:167-175` używa `settings.*`, nie snapshotu |
| **F21** | Brak dziennika korekt finansowych — wpłatę kasuje się twardo | brak modelu audytu |
| **F24** | Logowanie REST przyjmuje obcy `Origin` i `text/plain` | `readJson()` parsuje bez kontroli typu; brak polityki CSRF |
| **F29** | Brak indeksów na głównych ścieżkach — `Lesson` ma **tylko** `@@index([googleSyncedAt])` | brak `teacherId+scheduledAt`, `studentId+scheduledAt` |
| **F30** | Bez bazy testy „przechodzą", pomijając integracyjne | jak F12 |
| **F31** | `id={name}` — duplikaty identyfikatorów przy kilku formularzach na stronie | `forms.tsx:149`, `:185` |
| **F32** | `deleteStudent` sprawdza tylko lekcje, nie rachunki i wpłaty → techniczne 500 | `students.ts:294` |
| **F33** | Nauczyciel dostaje **numer rachunku** w komunikacie blokady | `lessons.ts:352` |
| **F34** | `.gitignore` nie obejmuje `.env.production` | są `.env`, `.env*.local`, `.env.test` |

---

## 4. Trzy miejsca, gdzie moja dokumentacja mija się z kodem

To najważniejsza część tej odpowiedzi.

**1. `CLAUDE.md` twierdzi:** „dane wystawcy trafiają na rachunek jako snapshot
przy wystawieniu".
**Prawda:** snapshot istnieje i nagłówek go używa, ale **strona wydruku pobiera
numer konta, adnotację podatkową i stopkę z bieżących ustawień**. Zmiana konta
bankowego zmienia wygląd już wystawionego dokumentu. Niezmiennik jest zapisany
w dokumentacji, ale nie jest w pełni wymuszony w kodzie (F19).

**2. `src/lib/validation.ts` obiecuje:** „Maksymalnie dwa miejsca po przecinku".
**Prawda:** `Math.round(v * 100) === Number((v * 100).toFixed(0))` przepuszcza
`1.005`, bo oba wyrażenia dają to samo. Kwota z trzema miejscami przechodzi do
bazy (F15).

**3. `PRZEGLAD-PROJEKTU.md` wymienia niezmienniki finansowe** i pisze, że
„wszystkie mają test".
**Prawda:** lista jest kompletna wobec tego, co zaimplementowałem — ale
**nie ma na niej najważniejszego**: że kwota raz naliczona ma zostać
niezmienna. Tego niezmiennika po prostu nie postawiłem, więc i testu nie ma.
To nie jest nieścisłość w opisie, tylko luka w projekcie (F07).

---

## 5. Czego audyt nie ocenia — i słusznie to zaznacza

Audytor konsekwentnie rozdziela „odtworzone" od „wywnioskowane z kodu"
i oznacza niedostępne moduły jako `N`, zamiast zgadywać. To rzetelne.

Dotyczy to całej warstwy, której w jego kopii nie było: TOTP, Google Calendar,
przypomnienia i cron, Speaking Club, przedmioty ze stawkami, wypłaty, notatki,
baza wiedzy, PIT, dziennik bezpieczeństwa. **Brak oceny nie jest oceną
pozytywną** — ta warstwa nadal czeka na niezależne sprawdzenie.

Jedno zastrzeżenie merytoryczne z mojej strony, nie podważające ustalenia:
dowód współbieżności (F04–F06) powstał na PGlite ze **wspólnym backendem**,
co audytor sam zapisał. To wystarcza, żeby pokazać, że protokół operacji nie
jest atomowy — i tak go czytam — ale nie zastępuje testu na natywnym
PostgreSQL z wieloma połączeniami. Taki test trzeba dołożyć przy naprawie.

---

## 5a. Stan napraw

Zrobione (commity `86d8e76`, `7d2cc21`, `09574b0`, `5e61378`):

| | Co zrobione | Dowód |
|---|---|---|
| **F07** | Lekcja utrwala `studentPrice` i `teacherRate`. `RateLookup` przyjmuje **lekcję**, nie parę identyfikatorów, więc policzenie historii cennikiem jest niemożliwe z definicji typu. To samo w karze za odwołanie | `tests/historical-rates.test.ts` (8); wyłączenie poprawki wywala 5 z nich objawem z P01 |
| **F15** | Liczba miejsc po przecinku sprawdzana na **zapisie**, nie arytmetycznie. Odpada też notacja wykładnicza | 4 testy; na żywo: `1,005` w formularzu wpłaty odrzucone |
| **F16** | Pusty tekst → `undefined` przed schematem liczbowym. Jawne `"0"` nadal znaczy zero | 3 testy |
| **F17** | Godzina z luki DST odrzucana (kontrola powrotna). Godzina podwójna deterministycznie | 4 testy |
| **F12** | `TRUNCATE` tylko na bazie z jawnym znacznikiem z `npm run db:test:init` | odmowa sprawdzona na bazie bez znacznika |
| **F19** | `bankAccountSnapshot`, `taxNoteSnapshot`, `footerSnapshot`. Stare rachunki mają pas, że pokazują wartości bieżące | test: zmiana wszystkich ustawień nie rusza dokumentu |
| **F30** | Brak `DATABASE_URL` to błąd (kod 1), nie zielony przebieg. `npm run test:unit` z jawną listą plików | sprawdzone oba tryby |
| **F33** | Komunikat blokady zależny od roli | 2 testy: numer nieobecny u nauczyciela, obecny u admina |
| **F34** | `.gitignore` obejmuje `.env*` z wyjątkami na przykłady | `git check-ignore` |

**420 testów przechodzi** (było 398). Zostaje 13 ustaleń — poniżej.

## 6. Co bym naprawiał i w jakiej kolejności

Kolejność inna niż w audycie w jednym miejscu: stawiam **F07 przed
współbieżnością**, bo jest to problem danych (wymaga migracji i decyzji
biznesowej), a każdy tydzień zwłoki powiększa historię do naprawienia.

| | Zakres | Dlaczego tu |
|---:|---|---|
| ~~1–4~~ | ~~F07, F15, F16, F17, F12, F34, F19, F33, F30~~ | **zrobione** — patrz sekcja 5a |
| **5** | **F04, F05, F06** — atomowość: zapis z zakresem w `where`, blokada wiersza przy fakturowaniu | Wymaga testów na natywnym PostgreSQL |
| **6** | **F08, F09, F10** — kolizje, idempotencja wpłat, pakiet kontra rachunek | Wymaga ustalenia reguł (czy admin może nadpisać kolizję?) |
| **7** | **F24, F29, F30, F31, F32, F18** | Eksploatacja, wydajność, dostępność |
| **8** | **F13, F14, F21** — model rozrachunków i dziennik korekt | Największy zakres, wymaga decyzji o modelu danych |

Od punktu 5 w górę część wymaga **Twoich decyzji**: co ma się dziać przy
kolizji terminów, czy admin może ją nadpisać, czy zaliczkę wolno przypisać
do kilku rachunków, od kiedy obowiązuje nowa stawka.

---

## 7. Czego z audytu nie przyjmuję bez zastrzeżenia

Nic z ustaleń. Dwa drobiazgi o charakterze porządkowym:

- **Ocena „D" i noty liczbowe** dotyczą commita `333cf94`, co audytor zapisał
  wprost. Nie przenoszę ich na HEAD ani ich nie podwyższam — po prostu nie są
  policzone dla tej wersji. Właściwą odpowiedzią jest ponowny audyt na
  zamrożonej wersji, nie dyskusja o ocenie.
- **F28** — zgadzam się z metodą liczenia (7 advisory, nie 12 luk aplikacji)
  i to jest lepsze sformułowanie niż moje.

Nie znalazłem w raporcie ani jednego ustalenia, które byłoby fałszywie
pozytywne w HEAD. Każde albo naprawiłem wcześniej, albo potwierdziłem jako
nadal aktualne.
