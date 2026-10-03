-- CreateTable
CREATE TABLE "prepared_compositions" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "prepared_compositions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prepared_compositions_departmentId_idx" ON "prepared_compositions"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "prepared_compositions_productId_departmentId_key" ON "prepared_compositions"("productId", "departmentId");

-- AddForeignKey
ALTER TABLE "prepared_compositions" ADD CONSTRAINT "prepared_compositions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepared_compositions" ADD CONSTRAINT "prepared_compositions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
