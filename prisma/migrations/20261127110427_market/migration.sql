-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "avitoRegion" TEXT NOT NULL DEFAULT 'rossiya',
ADD COLUMN     "bonusFixed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonusPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "marketMargin" INTEGER NOT NULL DEFAULT 500000;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "batteryPct" INTEGER,
ADD COLUMN     "bonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "defects" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "kit" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "memoryGb" INTEGER,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "parsedAt" TIMESTAMP(3),
ADD COLUMN     "replacements" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "memoryGb" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "median" INTEGER NOT NULL,
    "low" INTEGER NOT NULL,
    "high" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketSnapshot_companyId_day_idx" ON "MarketSnapshot"("companyId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSnapshot_companyId_model_memoryGb_day_key" ON "MarketSnapshot"("companyId", "model", "memoryGb", "day");

-- CreateIndex
CREATE INDEX "Listing_companyId_model_memoryGb_idx" ON "Listing"("companyId", "model", "memoryGb");

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- «Сводка» по умолчанию видна должностям с полным доступом
UPDATE "Position" SET "perms" = array_append("perms", 'marketSummary') WHERE "baseRole" = 'ADMIN' AND NOT ('marketSummary' = ANY("perms"));
