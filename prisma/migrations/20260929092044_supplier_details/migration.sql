-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "commerceRegister" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notes" TEXT;
