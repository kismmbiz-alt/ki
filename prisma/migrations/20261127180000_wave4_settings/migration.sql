-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "account" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "barcodeSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bik" TEXT,
ADD COLUMN     "companyNote" TEXT,
ADD COLUMN     "contract" TEXT,
ADD COLUMN     "corrAccount" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'RUB',
ADD COLUMN     "director" TEXT,
ADD COLUMN     "directorBasis" TEXT,
ADD COLUMN     "directorTitle" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "hideMinPrice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inn" TEXT,
ADD COLUMN     "kpp" TEXT,
ADD COLUMN     "ogrn" TEXT,
ADD COLUMN     "orderPriceKey" TEXT NOT NULL DEFAULT 'repair',
ADD COLUMN     "salePriceKey" TEXT NOT NULL DEFAULT 'retail',
ADD COLUMN     "statusChains" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "swift" TEXT;

-- AlterTable
ALTER TABLE "OrderStatus" ADD COLUMN     "comment" TEXT,
ADD COLUMN     "deadlineHours" INTEGER,
ADD COLUMN     "denyEdit" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "denySee" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "denySet" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "nextIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requireMaster" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requirePayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "widgetName" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "autoLogoutDays" INTEGER,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "cashboxIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "cashierInn" TEXT,
ADD COLUMN     "defaultCashboxId" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "telegram" TEXT,
ADD COLUMN     "warehouseIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "PriceType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "forProducts" BOOLEAN NOT NULL DEFAULT true,
    "forWorks" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPrice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priceTypeId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "pageSize" TEXT NOT NULL DEFAULT 'A4',
    "width" INTEGER,
    "height" INTEGER,
    "landscape" BOOLEAN NOT NULL DEFAULT false,
    "margins" INTEGER[] DEFAULT ARRAY[10, 10, 10, 10]::INTEGER[],
    "separate" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "base" TEXT NOT NULL DEFAULT 'PROFIT',
    "percent" INTEGER NOT NULL DEFAULT 0,
    "fixed" INTEGER NOT NULL DEFAULT 0,
    "minBase" INTEGER NOT NULL DEFAULT 0,
    "maxAmount" INTEGER,
    "locationId" TEXT,
    "orderType" TEXT,
    "includeWorks" BOOLEAN NOT NULL DEFAULT true,
    "includeParts" BOOLEAN NOT NULL DEFAULT true,
    "subtractNegative" BOOLEAN NOT NULL DEFAULT true,
    "keepOnReturn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "comment" TEXT,
    "cashTxId" TEXT,
    "createdById" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceType_companyId_idx" ON "PriceType"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceType_companyId_id_key" ON "PriceType"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPrice_companyId_productId_priceTypeId_key" ON "ProductPrice"("companyId", "productId", "priceTypeId");

-- CreateIndex
CREATE INDEX "PrintTemplate_companyId_docType_idx" ON "PrintTemplate"("companyId", "docType");

-- CreateIndex
CREATE UNIQUE INDEX "PrintTemplate_companyId_id_key" ON "PrintTemplate"("companyId", "id");

-- CreateIndex
CREATE INDEX "SalaryRule_companyId_userId_idx" ON "SalaryRule"("companyId", "userId");

-- CreateIndex
CREATE INDEX "SalaryEntry_companyId_userId_date_idx" ON "SalaryEntry"("companyId", "userId", "date");

-- AddForeignKey
ALTER TABLE "PriceType" ADD CONSTRAINT "PriceType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "Product"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_companyId_priceTypeId_fkey" FOREIGN KEY ("companyId", "priceTypeId") REFERENCES "PriceType"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintTemplate" ADD CONSTRAINT "PrintTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryRule" ADD CONSTRAINT "SalaryRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryRule" ADD CONSTRAINT "SalaryRule_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryEntry" ADD CONSTRAINT "SalaryEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryEntry" ADD CONSTRAINT "SalaryEntry_companyId_userId_fkey" FOREIGN KEY ("companyId", "userId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "inn" TEXT,
ADD COLUMN     "passport" TEXT,
ADD COLUMN     "passportCode" TEXT,
ADD COLUMN     "passportDate" TIMESTAMP(3),
ADD COLUMN     "passportIssuedBy" TEXT;
