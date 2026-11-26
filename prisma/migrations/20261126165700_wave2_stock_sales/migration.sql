-- CreateEnum
CREATE TYPE "StockDocType" AS ENUM ('RECEIPT', 'TRANSFER', 'WRITEOFF', 'INVENTORY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMoveType" ADD VALUE 'TRANSFER';
ALTER TYPE "StockMoveType" ADD VALUE 'WRITEOFF';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "docSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "minPrice" INTEGER,
ADD COLUMN     "repairPrice" INTEGER,
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "discount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isReturn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnOfId" TEXT;

-- CreateTable
CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockDoc" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" "StockDocType" NOT NULL,
    "locationId" TEXT NOT NULL,
    "toLocationId" TEXT,
    "supplierId" TEXT,
    "userId" TEXT,
    "comment" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockDocItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockDocItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashShift" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "openedById" TEXT,
    "closedById" TEXT,
    "openCash" INTEGER NOT NULL DEFAULT 0,
    "expectedCash" INTEGER,
    "closeCash" INTEGER,
    "comment" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductGroup_companyId_idx" ON "ProductGroup"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductGroup_companyId_id_key" ON "ProductGroup"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_id_key" ON "Supplier"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_name_key" ON "Supplier"("companyId", "name");

-- CreateIndex
CREATE INDEX "StockDoc_companyId_createdAt_idx" ON "StockDoc"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockDoc_companyId_id_key" ON "StockDoc"("companyId", "id");

-- CreateIndex
CREATE INDEX "StockDocItem_companyId_docId_idx" ON "StockDocItem"("companyId", "docId");

-- CreateIndex
CREATE INDEX "CashShift_companyId_locationId_openedAt_idx" ON "CashShift"("companyId", "locationId", "openedAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_groupId_fkey" FOREIGN KEY ("companyId", "groupId") REFERENCES "ProductGroup"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "Supplier"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductGroup" ADD CONSTRAINT "ProductGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductGroup" ADD CONSTRAINT "ProductGroup_companyId_parentId_fkey" FOREIGN KEY ("companyId", "parentId") REFERENCES "ProductGroup"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDoc" ADD CONSTRAINT "StockDoc_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDoc" ADD CONSTRAINT "StockDoc_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDoc" ADD CONSTRAINT "StockDoc_companyId_toLocationId_fkey" FOREIGN KEY ("companyId", "toLocationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDoc" ADD CONSTRAINT "StockDoc_companyId_supplierId_fkey" FOREIGN KEY ("companyId", "supplierId") REFERENCES "Supplier"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocItem" ADD CONSTRAINT "StockDocItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocItem" ADD CONSTRAINT "StockDocItem_companyId_docId_fkey" FOREIGN KEY ("companyId", "docId") REFERENCES "StockDoc"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDocItem" ADD CONSTRAINT "StockDocItem_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "Product"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
