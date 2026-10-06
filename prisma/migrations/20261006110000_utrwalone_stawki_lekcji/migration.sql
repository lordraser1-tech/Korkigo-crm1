-- Utrwalenie ceny ucznia i stawki nauczyciela przy lekcji.
--
-- Dotąd rozliczenia, zarobki i statystyki czytały cennik BIEŻĄCY, więc zmiana
-- stawki przepisywała przeszłość: wynagrodzenie za zamknięty miesiąc zmieniało
-- się po podwyżce, a stara niezafakturowana lekcja dostawała nową cenę
-- (audyt zewnętrzny, F07).
--
-- Kolumny są NULL-owalne świadomie. Lekcji sprzed tej zmiany nie da się
-- uczciwie uzupełnić — nie wiadomo, jaka stawka obowiązywała w dniu zajęć,
-- a wstawienie dzisiejszej utrwaliłoby właśnie ten błąd jako „historię".
-- Dla pustych wartości kod wraca do cennika bieżącego, tak jak dotąd.

ALTER TABLE "lessons"
  ADD COLUMN "studentPrice" DECIMAL(10,2),
  ADD COLUMN "teacherRate"  DECIMAL(10,2);
