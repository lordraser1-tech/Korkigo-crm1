-- Baza wiedzy przypięta do PRZEDMIOTU, nie do ucznia.
--
-- Pierwotny `KnowledgeBaseEntry` (uczeń + tytuł + treść) nigdy nie doczekał
-- się kodu, który by do niego pisał — tabela jest pusta. Dodajemy `subjectId`
-- jako NOT NULL bez wartości domyślnej świadomie: gdyby gdzieś jednak były
-- wiersze, migracja się wywali zamiast po cichu przypiąć je do przypadkowego
-- przedmiotu.

ALTER TABLE "knowledge_base_entries"
  DROP CONSTRAINT "knowledge_base_entries_studentId_fkey";

ALTER TABLE "knowledge_base_entries"
  DROP COLUMN "studentId",
  DROP COLUMN "content",
  ADD COLUMN "subjectId" TEXT NOT NULL,
  ADD COLUMN "url" TEXT NOT NULL,
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '';

CREATE INDEX "knowledge_base_entries_subjectId_idx"
  ON "knowledge_base_entries"("subjectId");

ALTER TABLE "knowledge_base_entries"
  ADD CONSTRAINT "knowledge_base_entries_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "subjects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
