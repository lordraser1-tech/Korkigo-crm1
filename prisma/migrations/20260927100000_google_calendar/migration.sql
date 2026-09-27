-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "googleSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "google_calendar_links" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendar_deletions" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_calendar_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_links_teacherId_key" ON "google_calendar_links"("teacherId");

-- CreateIndex
CREATE INDEX "google_calendar_deletions_teacherId_idx" ON "google_calendar_deletions"("teacherId");

-- CreateIndex
CREATE INDEX "lessons_googleSyncedAt_idx" ON "lessons"("googleSyncedAt");

-- AddForeignKey
ALTER TABLE "google_calendar_links" ADD CONSTRAINT "google_calendar_links_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

