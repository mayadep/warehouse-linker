-- CreateEnum
CREATE TYPE "CycleCountStatus" AS ENUM ('COUNTING', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CycleCount" (
    "id" TEXT NOT NULL,
    "countNo" TEXT NOT NULL,
    "requestId" TEXT,
    "status" "CycleCountStatus" NOT NULL DEFAULT 'COUNTING',
    "scope" TEXT NOT NULL,
    "memo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT,
    "expiryDate" DATE,
    "lotDate" DATE,
    "lotNo" TEXT,
    "bookQty" INTEGER NOT NULL,
    "countedQty" INTEGER,
    "countedById" TEXT,
    "countedAt" TIMESTAMP(3),
    "appliedDelta" INTEGER,

    CONSTRAINT "CycleCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CycleCount_countNo_key" ON "CycleCount"("countNo");

-- CreateIndex
CREATE UNIQUE INDEX "CycleCount_requestId_key" ON "CycleCount"("requestId");

-- CreateIndex
CREATE INDEX "CycleCount_status_createdAt_idx" ON "CycleCount"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CycleCountLine_countId_idx" ON "CycleCountLine"("countId");

-- CreateIndex
CREATE UNIQUE INDEX "CycleCountLine_countId_productId_locationId_expiryDate_lotD_key" ON "CycleCountLine"("countId", "productId", "locationId", "expiryDate", "lotDate", "lotNo") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "CycleCount" ADD CONSTRAINT "CycleCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleCount" ADD CONSTRAINT "CycleCount_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleCountLine" ADD CONSTRAINT "CycleCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "CycleCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleCountLine" ADD CONSTRAINT "CycleCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleCountLine" ADD CONSTRAINT "CycleCountLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 수량 CHECK
ALTER TABLE "CycleCountLine" ADD CONSTRAINT "CycleCountLine_bookQty_check" CHECK ("bookQty" >= 0);
ALTER TABLE "CycleCountLine" ADD CONSTRAINT "CycleCountLine_countedQty_check" CHECK ("countedQty" IS NULL OR "countedQty" >= 0);
