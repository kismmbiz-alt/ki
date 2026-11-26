-- CreateEnum
CREATE TYPE "ListingSourceKind" AS ENUM ('VK', 'TELEGRAM', 'AVITO', 'YOULA');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('NEW', 'IN_WORK', 'BOUGHT', 'REJECTED');

-- CreateTable
CREATE TABLE "ListingSource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "ListingSourceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '',
    "stopWords" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastFound" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "price" INTEGER,
    "photoUrl" TEXT,
    "postedAt" TIMESTAMP(3),
    "status" "ListingStatus" NOT NULL DEFAULT 'NEW',
    "assigneeId" TEXT,
    "takenAt" TIMESTAMP(3),
    "boughtAt" TIMESTAMP(3),
    "buyPrice" INTEGER,
    "productId" TEXT,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListingSource_companyId_idx" ON "ListingSource"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingSource_companyId_id_key" ON "ListingSource"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ListingSource_companyId_url_key" ON "ListingSource"("companyId", "url");

-- CreateIndex
CREATE INDEX "Listing_companyId_status_createdAt_idx" ON "Listing"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_companyId_assigneeId_idx" ON "Listing"("companyId", "assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_companyId_id_key" ON "Listing"("companyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_companyId_url_key" ON "Listing"("companyId", "url");

-- AddForeignKey
ALTER TABLE "ListingSource" ADD CONSTRAINT "ListingSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_companyId_sourceId_fkey" FOREIGN KEY ("companyId", "sourceId") REFERENCES "ListingSource"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_companyId_assigneeId_fkey" FOREIGN KEY ("companyId", "assigneeId") REFERENCES "User"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_companyId_productId_fkey" FOREIGN KEY ("companyId", "productId") REFERENCES "Product"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
