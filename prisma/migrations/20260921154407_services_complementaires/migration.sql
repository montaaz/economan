-- CreateTable
CREATE TABLE "order_refills" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "order_refills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_refill_lines" (
    "id" SERIAL NOT NULL,
    "refillId" INTEGER NOT NULL,
    "orderLineId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "order_refill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_refills_orderId_idx" ON "order_refills"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "order_refills_orderId_rank_key" ON "order_refills"("orderId", "rank");

-- CreateIndex
CREATE INDEX "order_refill_lines_orderLineId_idx" ON "order_refill_lines"("orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "order_refill_lines_refillId_orderLineId_key" ON "order_refill_lines"("refillId", "orderLineId");

-- AddForeignKey
ALTER TABLE "order_refills" ADD CONSTRAINT "order_refills_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_refills" ADD CONSTRAINT "order_refills_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_refill_lines" ADD CONSTRAINT "order_refill_lines_refillId_fkey" FOREIGN KEY ("refillId") REFERENCES "order_refills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_refill_lines" ADD CONSTRAINT "order_refill_lines_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
