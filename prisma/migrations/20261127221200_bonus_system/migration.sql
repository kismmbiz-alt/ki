-- CreateEnum
CREATE TYPE "BonusKind" AS ENUM ('ACCRUE', 'SPEND', 'EXPIRE', 'WELCOME', 'MANUAL', 'RETURN');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "bonusAccrueOnBonusPay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bonusDelayDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonusEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bonusExpireDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonusMaxPayPct" INTEGER NOT NULL DEFAULT 3000,
ADD COLUMN     "bonusMinCheck" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonusOrderPct" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "bonusSalePct" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "bonusWelcome" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "bonusPaid" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BonusTx" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "BonusKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "saleId" TEXT,
    "orderId" TEXT,
    "userId" TEXT,
    "comment" TEXT,
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonusTx_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BonusTx_companyId_clientId_createdAt_idx" ON "BonusTx"("companyId", "clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "BonusTx" ADD CONSTRAINT "BonusTx_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusTx" ADD CONSTRAINT "BonusTx_companyId_clientId_fkey" FOREIGN KEY ("companyId", "clientId") REFERENCES "Client"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
