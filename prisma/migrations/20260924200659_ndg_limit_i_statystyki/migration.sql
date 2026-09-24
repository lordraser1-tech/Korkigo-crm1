-- CreateEnum
CREATE TYPE "NdgPeriodMode" AS ENUM ('MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "NdgRevenueBasis" AS ENUM ('INVOICED', 'PAID');

-- CreateTable
CREATE TABLE "ndg_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" "NdgPeriodMode" NOT NULL DEFAULT 'QUARTERLY',
    "revenueBasis" "NdgRevenueBasis" NOT NULL DEFAULT 'INVOICED',
    "warnThresholdPercent" INTEGER NOT NULL DEFAULT 90,
    "businessStartedAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ndg_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ndg_monthly_limits" (
    "id" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ndg_monthly_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ndg_monthly_limits_validFrom_key" ON "ndg_monthly_limits"("validFrom");
