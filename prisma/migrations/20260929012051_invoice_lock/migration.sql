-- AlterTable
ALTER TABLE "stock_entries" ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" INTEGER;

-- AddForeignKey
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
