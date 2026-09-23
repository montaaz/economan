/*
  Warnings:

  - You are about to drop the column `portionRatio` on the `products` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "products" DROP COLUMN "portionRatio",
ADD COLUMN     "motherQuantity" DECIMAL(14,4);
