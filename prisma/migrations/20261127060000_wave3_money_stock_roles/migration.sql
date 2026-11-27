-- AlterEnum
ALTER TYPE "StockDocType" ADD VALUE 'SUPPLIER_RETURN';

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseRole" "Role" NOT NULL DEFAULT 'MANAGER',
    "perms" TEXT[],
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cashbox" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cashbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "cashboxId" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "locationId" TEXT,
    "cashboxId" TEXT,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "amount" INTEGER,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CashShift" ADD COLUMN     "cashboxId" TEXT;

-- AlterTable
ALTER TABLE "CashTransaction" ADD COLUMN     "cashboxId" TEXT,
ADD COLUMN     "transferId" TEXT;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "planRevenue" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "warehouseId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "warehouseId" TEXT;

-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "warehouseId" TEXT;

-- AlterTable
ALTER TABLE "StockDoc" ADD COLUMN     "toWarehouseId" TEXT,
ADD COLUMN     "warehouseId" TEXT;

-- AlterTable
ALTER TABLE "StockMove" ADD COLUMN     "warehouseId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "positionId" TEXT;

-- Перенос данных: у каждой точки появляются «Основная касса» и «Основной склад»
INSERT INTO "Cashbox" ("id", "companyId", "locationId", "name") SELECT 'cb_' || "id", "companyId", "id", 'Основная касса' FROM "Location";
INSERT INTO "Warehouse" ("id", "companyId", "locationId", "cashboxId", "name") SELECT 'wh_' || "id", "companyId", "id", 'cb_' || "id", 'Основной склад' FROM "Location";
UPDATE "CashTransaction" SET "cashboxId" = 'cb_' || "locationId";
UPDATE "CashShift" SET "cashboxId" = 'cb_' || "locationId";
UPDATE "Stock" SET "warehouseId" = 'wh_' || "locationId";
UPDATE "StockMove" SET "warehouseId" = 'wh_' || "locationId";
UPDATE "StockDoc" SET "warehouseId" = 'wh_' || "locationId", "toWarehouseId" = CASE WHEN "toLocationId" IS NULL THEN NULL ELSE 'wh_' || "toLocationId" END;
UPDATE "Sale" SET "warehouseId" = 'wh_' || "locationId";
UPDATE "OrderItem" i SET "warehouseId" = 'wh_' || o."locationId" FROM "Order" o WHERE i."kind" = 'PART' AND i."productId" IS NOT NULL AND o."id" = i."orderId";

ALTER TABLE "CashShift" ALTER COLUMN "cashboxId" SET NOT NULL;
ALTER TABLE "CashTransaction" ALTER COLUMN "cashboxId" SET NOT NULL;
ALTER TABLE "Stock" ALTER COLUMN "warehouseId" SET NOT NULL;
ALTER TABLE "StockDoc" ALTER COLUMN "warehouseId" SET NOT NULL;
ALTER TABLE "StockMove" ALTER COLUMN "warehouseId" SET NOT NULL;

-- DropIndex
DROP INDEX "Stock_companyId_productId_locationId_key";

-- CreateIndex
CREATE INDEX "Position_companyId_idx" ON "Position"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_companyId_id_key" ON "Position"("companyId", "id");

-- CreateIndex
CREATE INDEX "Cashbox_companyId_idx" ON "Cashbox"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Cashbox_companyId_id_key" ON "Cashbox"("companyId", "id");

-- CreateIndex
CREATE INDEX "Warehouse_companyId_idx" ON "Warehouse"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_companyId_id_key" ON "Warehouse"("companyId", "id");

-- CreateIndex
CREATE INDEX "ActionLog_companyId_createdAt_idx" ON "ActionLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CashShift_companyId_cashboxId_openedAt_idx" ON "CashShift"("companyId", "cashboxId", "openedAt");

-- CreateIndex
CREATE INDEX "CashTransaction_companyId_cashboxId_createdAt_idx" ON "CashTransaction"("companyId", "cashboxId", "createdAt");

-- CreateIndex
CREATE INDEX "Stock_companyId_locationId_idx" ON "Stock"("companyId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_companyId_productId_warehouseId_key" ON "Stock"("companyId", "productId", "warehouseId");

-- CreateIndex
CREATE INDEX "StockMove_companyId_warehouseId_createdAt_idx" ON "StockMove"("companyId", "warehouseId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_positionId_fkey" FOREIGN KEY ("companyId", "positionId") REFERENCES "Position"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_companyId_cashboxId_fkey" FOREIGN KEY ("companyId", "cashboxId") REFERENCES "Cashbox"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDoc" ADD CONSTRAINT "StockDoc_companyId_warehouseId_fkey" FOREIGN KEY ("companyId", "warehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockDoc" ADD CONSTRAINT "StockDoc_companyId_toWarehouseId_fkey" FOREIGN KEY ("companyId", "toWarehouseId") REFERENCES "Warehouse"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_companyId_cashboxId_fkey" FOREIGN KEY ("companyId", "cashboxId") REFERENCES "Cashbox"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cashbox" ADD CONSTRAINT "Cashbox_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cashbox" ADD CONSTRAINT "Cashbox_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_locationId_fkey" FOREIGN KEY ("companyId", "locationId") REFERENCES "Location"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_cashboxId_fkey" FOREIGN KEY ("companyId", "cashboxId") REFERENCES "Cashbox"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
