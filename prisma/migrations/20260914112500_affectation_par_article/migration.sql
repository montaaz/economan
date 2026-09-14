-- CreateTable
CREATE TABLE "department_products" (
    "departmentId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_products_pkey" PRIMARY KEY ("departmentId","productId")
);

-- CreateIndex
CREATE INDEX "department_products_productId_idx" ON "department_products"("productId");

-- CreateIndex
CREATE INDEX "department_products_departmentId_sortOrder_idx" ON "department_products"("departmentId", "sortOrder");

-- AddForeignKey
ALTER TABLE "department_products" ADD CONSTRAINT "department_products_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_products" ADD CONSTRAINT "department_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
