-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "quantityOnHand" DECIMAL(14,3) NOT NULL DEFAULT 0,
ADD COLUMN     "stockFixe" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "stock_fixe" (
    "departmentId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_fixe_pkey" PRIMARY KEY ("departmentId","productId")
);

-- CreateIndex
CREATE INDEX "stock_fixe_productId_idx" ON "stock_fixe"("productId");

-- AddForeignKey
ALTER TABLE "stock_fixe" ADD CONSTRAINT "stock_fixe_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_fixe" ADD CONSTRAINT "stock_fixe_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
