-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'INBOUND_CORRECTION';

-- DropIndex
DROP INDEX "StockMovement_inboundId_key";

-- AlterTable
ALTER TABLE "Inbound" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "InboundRevision" (
    "id" TEXT NOT NULL,
    "inboundId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "quantityDelta" INTEGER NOT NULL DEFAULT 0,
    "stockMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundRevision_stockMovementId_key" ON "InboundRevision"("stockMovementId");

-- CreateIndex
CREATE INDEX "InboundRevision_inboundId_createdAt_idx" ON "InboundRevision"("inboundId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_inboundId_idx" ON "StockMovement"("inboundId");

-- AddForeignKey
ALTER TABLE "InboundRevision" ADD CONSTRAINT "InboundRevision_inboundId_fkey" FOREIGN KEY ("inboundId") REFERENCES "Inbound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundRevision" ADD CONSTRAINT "InboundRevision_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
