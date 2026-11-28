-- CreateTable
CREATE TABLE "SaleTile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "SaleTile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleTile_companyId_side_slot_key" ON "SaleTile"("companyId", "side", "slot");

-- AddForeignKey
ALTER TABLE "SaleTile" ADD CONSTRAINT "SaleTile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
