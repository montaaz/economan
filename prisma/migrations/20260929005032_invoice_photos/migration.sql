-- CreateTable
CREATE TABLE "invoice_photos" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER,
    "reference" TEXT,
    "businessDay" DATE NOT NULL,
    "path" TEXT NOT NULL,
    "thumbPath" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_photos_businessDay_supplierId_reference_idx" ON "invoice_photos"("businessDay", "supplierId", "reference");

-- CreateIndex
CREATE INDEX "invoice_photos_supplierId_idx" ON "invoice_photos"("supplierId");

-- CreateIndex
CREATE INDEX "invoice_photos_createdById_idx" ON "invoice_photos"("createdById");

-- AddForeignKey
ALTER TABLE "invoice_photos" ADD CONSTRAINT "invoice_photos_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_photos" ADD CONSTRAINT "invoice_photos_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
