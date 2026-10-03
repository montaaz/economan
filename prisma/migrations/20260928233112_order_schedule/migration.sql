-- AlterTable
ALTER TABLE "users" ADD COLUMN     "orderClosesAt" TEXT,
ADD COLUMN     "orderOpensAt" TEXT;

-- CreateTable
CREATE TABLE "order_schedule" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "opensAt" TEXT NOT NULL DEFAULT '08:00',
    "closesAt" TEXT NOT NULL DEFAULT '12:00',
    "label" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_schedule_pkey" PRIMARY KEY ("id")
);
