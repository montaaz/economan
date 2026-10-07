-- CreateTable
CREATE TABLE "stock_checks" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "businessDay" DATE NOT NULL,
    "realStock" DECIMAL(14,3),
    "note" TEXT,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_check_logs" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "businessDay" DATE NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "userId" INTEGER,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_check_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_checks_departmentId_businessDay_idx" ON "stock_checks"("departmentId", "businessDay");

-- CreateIndex
CREATE INDEX "stock_checks_productId_idx" ON "stock_checks"("productId");

-- CreateIndex
CREATE INDEX "stock_checks_updatedById_idx" ON "stock_checks"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "stock_checks_departmentId_productId_businessDay_key" ON "stock_checks"("departmentId", "productId", "businessDay");

-- CreateIndex
CREATE INDEX "stock_check_logs_departmentId_businessDay_productId_created_idx" ON "stock_check_logs"("departmentId", "businessDay", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_check_logs_productId_idx" ON "stock_check_logs"("productId");

-- CreateIndex
CREATE INDEX "stock_check_logs_userId_idx" ON "stock_check_logs"("userId");

-- AddForeignKey
ALTER TABLE "stock_checks" ADD CONSTRAINT "stock_checks_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_checks" ADD CONSTRAINT "stock_checks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_checks" ADD CONSTRAINT "stock_checks_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_check_logs" ADD CONSTRAINT "stock_check_logs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_check_logs" ADD CONSTRAINT "stock_check_logs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_check_logs" ADD CONSTRAINT "stock_check_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
