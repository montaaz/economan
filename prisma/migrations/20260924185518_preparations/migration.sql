-- CreateTable
CREATE TABLE "preparations" (
    "id" SERIAL NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantityUsed" DECIMAL(14,3) NOT NULL,
    "quantityMade" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "businessDay" DATE NOT NULL,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preparations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "preparations_sourceId_createdAt_idx" ON "preparations"("sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "preparations_productId_createdAt_idx" ON "preparations"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "preparations_businessDay_idx" ON "preparations"("businessDay");

-- AddForeignKey
ALTER TABLE "preparations" ADD CONSTRAINT "preparations_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparations" ADD CONSTRAINT "preparations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparations" ADD CONSTRAINT "preparations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
