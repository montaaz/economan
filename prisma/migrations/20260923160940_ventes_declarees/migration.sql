-- CreateTable
CREATE TABLE "declared_sales" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "businessDay" DATE NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "declared_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "declared_sales_departmentId_businessDay_idx" ON "declared_sales"("departmentId", "businessDay");

-- CreateIndex
CREATE UNIQUE INDEX "declared_sales_departmentId_productId_businessDay_key" ON "declared_sales"("departmentId", "productId", "businessDay");

-- AddForeignKey
ALTER TABLE "declared_sales" ADD CONSTRAINT "declared_sales_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declared_sales" ADD CONSTRAINT "declared_sales_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declared_sales" ADD CONSTRAINT "declared_sales_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
