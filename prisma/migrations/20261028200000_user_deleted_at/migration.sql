-- Un compte supprimé qui porte de l'historique est archivé plutôt qu'effacé.
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);
