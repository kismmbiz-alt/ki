-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "supportUntil" TIMESTAMP(3),
ADD COLUMN     "supportWrite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "supportLogId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SupportLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "write" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "SupportLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "companyId" TEXT,

    CONSTRAINT "PlatformInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSample" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "ms" INTEGER NOT NULL,
    "dbMs" INTEGER,
    "error" TEXT,

    CONSTRAINT "HealthSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "path" TEXT,
    "detail" TEXT,

    CONSTRAINT "PlatformEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportLog_companyId_startedAt_idx" ON "SupportLog"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "SupportLog_startedAt_idx" ON "SupportLog"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformInvite_token_key" ON "PlatformInvite"("token");

-- CreateIndex
CREATE INDEX "HealthSample_at_idx" ON "HealthSample"("at");

-- CreateIndex
CREATE INDEX "PlatformEvent_kind_at_idx" ON "PlatformEvent"("kind", "at");

-- AddForeignKey
ALTER TABLE "SupportLog" ADD CONSTRAINT "SupportLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

