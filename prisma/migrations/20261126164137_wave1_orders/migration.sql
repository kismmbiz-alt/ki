-- CreateEnum
CREATE TYPE "DictKind" AS ENUM ('DEVICE_TYPE', 'BRAND', 'MODEL', 'COLOR', 'EQUIPMENT', 'APPEARANCE', 'DEFECT', 'ORDER_TYPE');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "color" TEXT,
ADD COLUMN     "discountPct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountSum" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "orderType" TEXT NOT NULL DEFAULT 'Платный',
ADD COLUMN     "urgent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verdict" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "warrantyDays" INTEGER;

-- CreateTable
CREATE TABLE "DictItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "DictKind" NOT NULL,
    "value" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DictItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DictItem_companyId_kind_idx" ON "DictItem"("companyId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "DictItem_companyId_kind_value_key" ON "DictItem"("companyId", "kind", "value");

-- CreateIndex
CREATE INDEX "OrderFile_companyId_orderId_idx" ON "OrderFile"("companyId", "orderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_companyId_managerId_fkey" FOREIGN KEY ("companyId", "managerId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictItem" ADD CONSTRAINT "DictItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFile" ADD CONSTRAINT "OrderFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFile" ADD CONSTRAINT "OrderFile_companyId_orderId_fkey" FOREIGN KEY ("companyId", "orderId") REFERENCES "Order"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
