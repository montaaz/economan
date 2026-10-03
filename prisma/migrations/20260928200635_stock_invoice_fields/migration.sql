-- AlterTable
ALTER TABLE "stock_entries" ADD COLUMN     "deliveryNote" TEXT,
ADD COLUMN     "discountPct" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN     "listPrice" DECIMAL(14,3),
ADD COLUMN     "vatPct" DECIMAL(6,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "address" TEXT;
