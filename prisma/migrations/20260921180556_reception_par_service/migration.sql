-- AlterTable
ALTER TABLE "order_refills" ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" INTEGER;

-- AddForeignKey
ALTER TABLE "order_refills" ADD CONSTRAINT "order_refills_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
