-- Une ligne peut être « en préparation » : rien ne sort au premier servi,
-- l'article part sur un servi suivant une fois prêt.
ALTER TYPE "LineStatus" ADD VALUE IF NOT EXISTS 'PREPARING';
