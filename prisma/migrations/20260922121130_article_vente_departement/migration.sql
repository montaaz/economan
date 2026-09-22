-- AlterTable
ALTER TABLE "sales_items" ADD COLUMN     "departmentId" INTEGER;

-- CreateIndex
CREATE INDEX "sales_items_departmentId_idx" ON "sales_items"("departmentId");

-- AddForeignKey
ALTER TABLE "sales_items" ADD CONSTRAINT "sales_items_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
