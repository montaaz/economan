-- CreateEnum
CREATE TYPE "StockEntryType" AS ENUM ('ARRIVAGE', 'INVENTAIRE');

-- AlterTable
ALTER TABLE "stock_entries" ADD COLUMN     "type" "StockEntryType" NOT NULL DEFAULT 'ARRIVAGE';
