-- AlterTable
ALTER TABLE "stock_entries" ADD COLUMN     "modifiedAt" TIMESTAMP(3),
ADD COLUMN     "modifiedById" INTEGER;

-- AddForeignKey
ALTER TABLE "stock_entries" ADD CONSTRAINT "stock_entries_modifiedById_fkey" FOREIGN KEY ("modifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
