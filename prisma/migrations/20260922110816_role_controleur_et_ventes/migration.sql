-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CONTROLEUR';

-- CreateTable
CREATE TABLE "sales_families" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_items" (
    "id" SERIAL NOT NULL,
    "familyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "price" DECIMAL(12,3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_reports" (
    "id" SERIAL NOT NULL,
    "businessDay" DATE NOT NULL,
    "note" TEXT,
    "sourceFile" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_report_lines" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "amount" DECIMAL(14,3),

    CONSTRAINT "sales_report_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_families_name_key" ON "sales_families"("name");

-- CreateIndex
CREATE INDEX "sales_families_isActive_sortOrder_idx" ON "sales_families"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "sales_items_isActive_sortOrder_idx" ON "sales_items"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "sales_items_code_idx" ON "sales_items"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_items_familyId_name_key" ON "sales_items"("familyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sales_reports_businessDay_key" ON "sales_reports"("businessDay");

-- CreateIndex
CREATE INDEX "sales_reports_businessDay_idx" ON "sales_reports"("businessDay");

-- CreateIndex
CREATE INDEX "sales_report_lines_itemId_idx" ON "sales_report_lines"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_report_lines_reportId_itemId_key" ON "sales_report_lines"("reportId", "itemId");

-- AddForeignKey
ALTER TABLE "sales_items" ADD CONSTRAINT "sales_items_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "sales_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_reports" ADD CONSTRAINT "sales_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_report_lines" ADD CONSTRAINT "sales_report_lines_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "sales_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_report_lines" ADD CONSTRAINT "sales_report_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "sales_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
