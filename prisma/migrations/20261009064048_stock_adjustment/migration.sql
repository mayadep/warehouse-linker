-- CreateEnum
CREATE TYPE "StockAdjustReason" AS ENUM ('EXPIRED', 'SPOILED', 'DAMAGED', 'LOST', 'COUNT_MINUS', 'COUNT_PLUS', 'OTHER_MINUS', 'OTHER_PLUS');

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "adjustmentId" TEXT;

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "productId" TEXT NOT NULL,
    "reason" "StockAdjustReason" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_requestId_key" ON "StockAdjustment"("requestId");

-- CreateIndex
CREATE INDEX "StockAdjustment_productId_createdAt_idx" ON "StockAdjustment"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_adjustmentId_idx" ON "StockMovement"("adjustmentId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 조정 수량은 0이 될 수 없음
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_quantity_nonzero_check" CHECK ("quantity" <> 0);
