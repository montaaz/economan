-- CreateEnum
CREATE TYPE "RecipeKind" AS ENUM ('PLAT', 'PREPARATION');

-- CreateTable
CREATE TABLE "recipes" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "kind" "RecipeKind" NOT NULL DEFAULT 'PLAT',
    "salesItemId" INTEGER,
    "source" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_lines" (
    "id" SERIAL NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "productId" INTEGER,
    "subRecipeId" INTEGER,
    "cost" DECIMAL(14,4),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "recipe_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recipes_salesItemId_key" ON "recipes"("salesItemId");

-- CreateIndex
CREATE INDEX "recipes_departmentId_kind_idx" ON "recipes"("departmentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_departmentId_name_key" ON "recipes"("departmentId", "name");

-- CreateIndex
CREATE INDEX "recipe_lines_recipeId_sortOrder_idx" ON "recipe_lines"("recipeId", "sortOrder");

-- CreateIndex
CREATE INDEX "recipe_lines_productId_idx" ON "recipe_lines"("productId");

-- CreateIndex
CREATE INDEX "recipe_lines_subRecipeId_idx" ON "recipe_lines"("subRecipeId");

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_salesItemId_fkey" FOREIGN KEY ("salesItemId") REFERENCES "sales_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
