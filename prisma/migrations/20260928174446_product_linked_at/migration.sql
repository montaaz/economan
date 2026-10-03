-- AlterTable
ALTER TABLE "products" ADD COLUMN     "linkedAt" TIMESTAMP(3);

-- Les articles déjà rattachés reçoivent leur date d'entrée dans la famille :
-- celle de leur première préparation si elle existe — c'est elle qui les a
-- liés — sinon celle de leur dernière modification.
UPDATE "products" p
SET "linkedAt" = COALESCE(
  (SELECT min(x."createdAt") FROM "preparations" x WHERE x."productId" = p."id"),
  p."updatedAt"
)
WHERE p."parentId" IS NOT NULL;
