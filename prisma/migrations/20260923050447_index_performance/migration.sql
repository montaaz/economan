-- CreateIndex
CREATE INDEX "order_refills_deliveredAt_idx" ON "order_refills"("deliveredAt");

-- CreateIndex
CREATE INDEX "order_refills_receivedAt_idx" ON "order_refills"("receivedAt");

-- CreateIndex
CREATE INDEX "orders_deliveredAt_idx" ON "orders"("deliveredAt");

-- CreateIndex
CREATE INDEX "products_parentId_idx" ON "products"("parentId");

-- CreateIndex
CREATE INDEX "products_kind_idx" ON "products"("kind");

-- CreateIndex
CREATE INDEX "stock_entries_productId_createdAt_idx" ON "stock_entries"("productId", "createdAt");
