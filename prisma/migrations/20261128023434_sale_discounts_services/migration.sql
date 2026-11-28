-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "maxDiscountPct" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isService" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "discount" INTEGER NOT NULL DEFAULT 0;
