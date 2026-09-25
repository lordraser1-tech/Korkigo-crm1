-- Dyspozycyjność dzienna, regulamin odwołań, wypłaty i przypomnienia.
--
-- Stare wpisy dyspozycyjności (wzorzec tygodniowy) są kasowane razem
-- z tabelą: nowa logika operuje na konkretnych dniach i nie da się ich
-- przenieść 1:1. Reszta danych zostaje nietknięta.

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('NONE', 'TELEGRAM', 'SMS');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SENT', 'FAILED');

-- DropForeignKey
ALTER TABLE "availabilities" DROP CONSTRAINT "availabilities_teacherId_fkey";

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "cancellationAmount" DECIMAL(10,2),
ADD COLUMN     "cancellationAutoAmount" DECIMAL(10,2),
ADD COLUMN     "cancellationNote" TEXT,
ADD COLUMN     "cancelledReportedAt" TIMESTAMP(3),
ADD COLUMN     "detachedFromSeries" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "teacherPayoutId" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "contactInstagram" TEXT,
ADD COLUMN     "contactTelegram" TEXT,
ADD COLUMN     "meetingLink" TEXT,
ADD COLUMN     "reminderChannel" "ReminderChannel" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "telegramChatId" TEXT;

-- AlterTable
ALTER TABLE "teacher_profiles" ADD COLUMN     "bankAccount" TEXT;

-- DropTable
DROP TABLE "availabilities";

-- CreateTable
CREATE TABLE "availability_slots" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_logs" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "status" "ReminderStatus" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_link_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "availability_slots_teacherId_date_idx" ON "availability_slots"("teacherId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "availability_slots_teacherId_date_startTime_key" ON "availability_slots"("teacherId", "date", "startTime");

-- CreateIndex
CREATE INDEX "payouts_teacherId_paidAt_idx" ON "payouts"("teacherId", "paidAt");

-- CreateIndex
CREATE INDEX "reminder_logs_sentAt_idx" ON "reminder_logs"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_logs_lessonId_key" ON "reminder_logs"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_link_tokens_token_key" ON "telegram_link_tokens"("token");

-- CreateIndex
CREATE INDEX "telegram_link_tokens_studentId_idx" ON "telegram_link_tokens"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "students_telegramChatId_key" ON "students"("telegramChatId");

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_teacherPayoutId_fkey" FOREIGN KEY ("teacherPayoutId") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

