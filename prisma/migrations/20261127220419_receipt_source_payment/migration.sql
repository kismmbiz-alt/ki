-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "article" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isSerial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'шт',
ADD COLUMN     "warrantyDays" INTEGER;

-- AlterTable
ALTER TABLE "StockDoc" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "inDocDate" TIMESTAMP(3),
ADD COLUMN     "inDocNo" TEXT,
ADD COLUMN     "paid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "responsibleId" TEXT;

-- AddForeignKey
ALTER TABLE "StockDoc" ADD CONSTRAINT "StockDoc_companyId_clientId_fkey" FOREIGN KEY ("companyId", "clientId") REFERENCES "Client"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
