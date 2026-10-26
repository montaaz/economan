-- L'unité d'une ligne de commande suit celle de l'article.
--
-- Les lignes anciennes portaient l'unité d'avant (souvent « kg » posé par
-- défaut à la création), alors que les quantités, elles, se comptaient déjà
-- dans l'unité réelle : « SAUMON 150Gr » commandé 10 « kg », c'étaient 10
-- portions. On corrige l'étiquette sans toucher aux quantités.
UPDATE "order_lines" AS l
SET "unitId" = p."baseUnitId"
FROM "products" AS p
WHERE p."id" = l."productId" AND l."unitId" <> p."baseUnitId";

-- Et désormais, quel que soit l'écran qui change l'unité d'un article, ses
-- lignes de commande la suivent.
CREATE OR REPLACE FUNCTION economan_sync_order_line_unit() RETURNS trigger AS $$
BEGIN
  UPDATE "order_lines" SET "unitId" = NEW."baseUnitId"
  WHERE "productId" = NEW."id" AND "unitId" <> NEW."baseUnitId";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "products_unit_sync" ON "products";
CREATE TRIGGER "products_unit_sync"
AFTER UPDATE OF "baseUnitId" ON "products"
FOR EACH ROW WHEN (OLD."baseUnitId" IS DISTINCT FROM NEW."baseUnitId")
EXECUTE FUNCTION economan_sync_order_line_unit();
