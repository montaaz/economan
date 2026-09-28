-- DropIndex
DROP INDEX "order_refills_orderId_idx";

-- DropIndex
DROP INDEX "orders_businessDay_departmentId_ticketNumber_idx";

-- DropIndex
DROP INDEX "orders_departmentId_createdAt_idx";

-- DropIndex
DROP INDEX "orders_status_businessDay_idx";

-- DropIndex
DROP INDEX "preparations_businessDay_idx";

-- DropIndex
DROP INDEX "products_kind_idx";

-- DropIndex
DROP INDEX "sales_reports_businessDay_idx";

-- DropIndex
DROP INDEX "stock_entries_businessDay_idx";

-- CreateIndex
CREATE INDEX "declared_sales_productId_idx" ON "declared_sales"("productId");

-- CreateIndex
CREATE INDEX "declared_sales_createdById_idx" ON "declared_sales"("createdById");

-- CreateIndex
CREATE INDEX "order_lines_unitId_idx" ON "order_lines"("unitId");

-- CreateIndex
CREATE INDEX "order_refills_createdById_idx" ON "order_refills"("createdById");

-- CreateIndex
CREATE INDEX "order_refills_receivedById_idx" ON "order_refills"("receivedById");

-- CreateIndex
CREATE INDEX "orders_departmentId_businessDay_ticketNumber_idx" ON "orders"("departmentId", "businessDay", "ticketNumber");

-- CreateIndex
CREATE INDEX "orders_processedById_idx" ON "orders"("processedById");

-- CreateIndex
CREATE INDEX "orders_receivedById_idx" ON "orders"("receivedById");

-- CreateIndex
CREATE INDEX "preparations_businessDay_createdAt_idx" ON "preparations"("businessDay", "createdAt");

-- CreateIndex
CREATE INDEX "preparations_createdById_idx" ON "preparations"("createdById");

-- CreateIndex
CREATE INDEX "products_baseUnitId_idx" ON "products"("baseUnitId");

-- CreateIndex
CREATE INDEX "stock_entries_businessDay_createdAt_idx" ON "stock_entries"("businessDay", "createdAt");

-- CreateIndex
CREATE INDEX "stock_entries_createdById_idx" ON "stock_entries"("createdById");

-- Unicité insensible à la casse des noms d'articles : le code la suppose
-- (« Acme » et « ACME » sont le même article), la base ne l'imposait pas.
-- Un index sur lower(name) sert aussi les recherches ILIKE du catalogue.
CREATE UNIQUE INDEX "products_name_lower_key" ON "products" (lower("name"));
CREATE UNIQUE INDEX "suppliers_name_lower_key" ON "suppliers" (lower("name"));
CREATE UNIQUE INDEX "categories_name_lower_key" ON "categories" (lower("name"));
