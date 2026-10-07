-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "activeStockFixe" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "stock_fixe_sets" (
    "departmentId" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_fixe_sets_pkey" PRIMARY KEY ("departmentId","slot","productId")
);

-- CreateIndex
CREATE INDEX "stock_fixe_sets_productId_idx" ON "stock_fixe_sets"("productId");

-- AddForeignKey
ALTER TABLE "stock_fixe_sets" ADD CONSTRAINT "stock_fixe_sets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_fixe_sets" ADD CONSTRAINT "stock_fixe_sets_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les trois jeux partent du stock fixe actuel : rien ne change tant qu'on n'en modifie pas un.
INSERT INTO "stock_fixe_sets" ("departmentId", "slot", "productId", "quantity", "updatedAt")
SELECT sf."departmentId", s.slot, sf."productId", sf."quantity", now()
FROM "stock_fixe" sf CROSS JOIN (VALUES (1), (2), (3)) AS s(slot)
ON CONFLICT DO NOTHING;
