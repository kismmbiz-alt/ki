-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'TALKING', 'AWAITING_PAYMENT', 'PAID', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "approval" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "approvalAt" TIMESTAMP(3),
ADD COLUMN     "approvalNote" TEXT;


-- CreateTable
CREATE TABLE "ConsentLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "docs" TEXT[],
    "ip" TEXT,
    "userAgent" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentLog_companyId_idx" ON "ConsentLog"("companyId");

-- CreateIndex
CREATE INDEX "ConsentLog_userId_idx" ON "ConsentLog"("userId");

