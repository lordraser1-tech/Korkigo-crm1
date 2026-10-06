-- Pełny snapshot wydruku rachunku.
--
-- `sellerSnapshot` był sklejonym blokiem tekstu, więc stopka wydruku (numer
-- konta, adnotacja podatkowa, stopka) brała dane z BIEŻĄCYCH ustawień.
-- Zmiana konta bankowego zmieniała wygląd dokumentu wystawionego pół roku
-- wcześniej (audyt zewnętrzny, F19).
--
-- Kolumny są NULL-owalne świadomie: rachunki wystawione przed tą zmianą nie
-- mają czego skopiować. Wydruk dla nich nadal pokazuje bieżące ustawienia —
-- i jawnie to zaznacza — zamiast udawać, że zna historyczną wartość.

ALTER TABLE "invoices"
  ADD COLUMN "bankAccountSnapshot" TEXT,
  ADD COLUMN "taxNoteSnapshot"     TEXT,
  ADD COLUMN "footerSnapshot"      TEXT;
