-- Przedmioty, poziomy i stawki per przedmiot/poziom.
--
-- Migracja PRZENOSI istniejące dane zamiast je kasować: zakłada domyślny
-- przedmiot „Polski” z poziomem „Ogólny”, przepisuje tam dotychczasowe
-- stawki nauczycieli i ceny uczniów, a wszystkie istniejące lekcje
-- przypina do tego poziomu. Dopiero potem usuwa stare kolumny.

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_levels" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "subject_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_rates" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectLevelId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "teacher_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_rates" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectLevelId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "student_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speaking_club_uses" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "markedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "speaking_club_uses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_key" ON "subjects"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subject_levels_subjectId_name_key" ON "subject_levels"("subjectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_rates_teacherId_subjectLevelId_key" ON "teacher_rates"("teacherId", "subjectLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "student_rates_studentId_subjectLevelId_key" ON "student_rates"("studentId", "subjectLevelId");

-- CreateIndex
CREATE INDEX "speaking_club_uses_studentId_idx" ON "speaking_club_uses"("studentId");

-- AddForeignKey
ALTER TABLE "subject_levels" ADD CONSTRAINT "subject_levels_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_rates" ADD CONSTRAINT "teacher_rates_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_rates" ADD CONSTRAINT "teacher_rates_subjectLevelId_fkey" FOREIGN KEY ("subjectLevelId") REFERENCES "subject_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_rates" ADD CONSTRAINT "student_rates_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_rates" ADD CONSTRAINT "student_rates_subjectLevelId_fkey" FOREIGN KEY ("subjectLevelId") REFERENCES "subject_levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaking_club_uses" ADD CONSTRAINT "speaking_club_uses_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "speaking_club_uses" ADD CONSTRAINT "speaking_club_uses_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- PRZENIESIENIE ISTNIEJĄCYCH DANYCH ----------

-- Kolumna najpierw dopuszcza NULL — wypełniamy ją poniżej.
ALTER TABLE "lessons" ADD COLUMN "subjectLevelId" TEXT;

-- Domyślny przedmiot i poziom dla danych sprzed tej zmiany.
INSERT INTO "subjects" ("id", "name", "active", "createdAt", "updatedAt")
VALUES ('sbj_domyslny_polski', 'Polski', true, NOW(), NOW());

INSERT INTO "subject_levels" ("id", "subjectId", "name", "active", "createdAt", "updatedAt")
VALUES ('lvl_domyslny_ogolny', 'sbj_domyslny_polski', 'Ogólny', true, NOW(), NOW());

-- Stawki nauczycieli -> TeacherRate na domyślnym poziomie.
INSERT INTO "teacher_rates" ("id", "teacherId", "subjectLevelId", "amount", "createdAt", "updatedAt")
SELECT 'tr_' || "id", "id", 'lvl_domyslny_ogolny', "ratePerLesson", NOW(), NOW()
FROM "teacher_profiles";

-- Ceny uczniów -> StudentRate na domyślnym poziomie (pomijamy zerowe,
-- czyli te, których admin i tak jeszcze nie ustalił).
INSERT INTO "student_rates" ("id", "studentId", "subjectLevelId", "amount", "createdAt", "updatedAt")
SELECT 'sr_' || "id", "id", 'lvl_domyslny_ogolny', "ratePerLesson", NOW(), NOW()
FROM "students"
WHERE "ratePerLesson" > 0;

-- Wszystkie dotychczasowe lekcje należą do domyślnego poziomu.
UPDATE "lessons" SET "subjectLevelId" = 'lvl_domyslny_ogolny' WHERE "subjectLevelId" IS NULL;

ALTER TABLE "lessons" ALTER COLUMN "subjectLevelId" SET NOT NULL;

ALTER TABLE "lessons" ADD CONSTRAINT "lessons_subjectLevelId_fkey"
  FOREIGN KEY ("subjectLevelId") REFERENCES "subject_levels"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Stare kolumny znikają dopiero po przepisaniu danych.
ALTER TABLE "students" DROP COLUMN "ratePerLesson", DROP COLUMN "subject";
ALTER TABLE "teacher_profiles" DROP COLUMN "ratePerLesson";
