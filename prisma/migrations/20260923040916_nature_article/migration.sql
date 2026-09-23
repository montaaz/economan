-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('FINI', 'MERE', 'PREPARE');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'FINI';

-- Reprise de l'existant : qui a des portions est une mère, qui a une mère est préparé.
UPDATE "products" SET "kind" = 'MERE' WHERE "id" IN (SELECT DISTINCT "parentId" FROM "products" WHERE "parentId" IS NOT NULL);
UPDATE "products" SET "kind" = 'PREPARE' WHERE "parentId" IS NOT NULL;
