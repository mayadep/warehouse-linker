-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'OUTBOUND_CORRECTION';

-- AlterTable
ALTER TABLE "Inbound" ADD COLUMN     "requestId" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "outboundId" TEXT;

-- CreateTable
CREATE TABLE "Outbound" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER,
    "customer" TEXT,
    "memo" TEXT,
    "shippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Outbound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundRevision" (
    "id" TEXT NOT NULL,
    "outboundId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "quantityDelta" INTEGER NOT NULL DEFAULT 0,
    "stockMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Inbound_requestId_key" ON "Inbound"("requestId");

-- CreateIndex
CREATE INDEX "StockMovement_outboundId_idx" ON "StockMovement"("outboundId");

-- CreateIndex
CREATE UNIQUE INDEX "Outbound_requestId_key" ON "Outbound"("requestId");

-- CreateIndex
CREATE INDEX "Outbound_productId_shippedAt_idx" ON "Outbound"("productId", "shippedAt");

-- CreateIndex
CREATE INDEX "Outbound_shippedAt_idx" ON "Outbound"("shippedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundRevision_stockMovementId_key" ON "OutboundRevision"("stockMovementId");

-- CreateIndex
CREATE INDEX "OutboundRevision_outboundId_createdAt_idx" ON "OutboundRevision"("outboundId", "createdAt");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_outboundId_fkey" FOREIGN KEY ("outboundId") REFERENCES "Outbound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundRevision" ADD CONSTRAINT "OutboundRevision_outboundId_fkey" FOREIGN KEY ("outboundId") REFERENCES "Outbound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundRevision" ADD CONSTRAINT "OutboundRevision_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 수동 추가: 출고 수량은 항상 양수
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_quantity_positive" CHECK ("quantity" > 0);

-- 수동 추가: 재고는 음수 불가 (애플리케이션 버그가 있어도 DB가 거부)
-- 기존 데이터에 음수 재고가 있으면 이 단계에서 실패하므로 먼저 확인할 것:
--   SELECT sku, stock FROM "Product" WHERE stock < 0;
ALTER TABLE "Product" ADD CONSTRAINT "Product_stock_nonnegative" CHECK ("stock" >= 0);
