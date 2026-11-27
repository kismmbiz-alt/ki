-- AlterTable
ALTER TABLE "CashTransaction" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "eventDate" TIMESTAMP(3),
ADD COLUMN     "origAmount" INTEGER,
ADD COLUMN     "recipientId" TEXT,
ADD COLUMN     "stockDocId" TEXT,
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "salaryPeriodCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "salaryPeriodStart" TIMESTAMP(3),
ADD COLUMN     "salaryPeriodType" TEXT NOT NULL DEFAULT 'MONTH';

-- AlterTable
ALTER TABLE "SalaryEntry" ADD COLUMN     "locationId" TEXT;

-- CreateTable
CREATE TABLE "CashTxLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashTxLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashTxLog_companyId_txId_idx" ON "CashTxLog"("companyId", "txId");

-- AddForeignKey
ALTER TABLE "CashTxLog" ADD CONSTRAINT "CashTxLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- платежи по поступлениям: ссылка на документ и поставщика
UPDATE "CashTransaction" c SET "stockDocId" = d."id", "supplierId" = d."supplierId"
FROM "StockDoc" d
WHERE c."stockDocId" IS NULL AND d."companyId" = c."companyId" AND d."locationId" = c."locationId"
  AND c."comment" ~ ('^(Поступление|Возврат поставщику) №' || d."number" || '([^0-9]|$)');
