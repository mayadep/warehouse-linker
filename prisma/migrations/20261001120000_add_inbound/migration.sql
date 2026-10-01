-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('INBOUND', 'OUTBOUND', 'ADJUST');

-- CreateTable
CREATE TABLE "Inbound" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" INTEGER,
    "supplier" TEXT,
    "memo" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inbound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "beforeStock" INTEGER NOT NULL,
    "afterStock" INTEGER NOT NULL,
    "inboundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inbound_productId_receivedAt_idx" ON "Inbound"("productId", "receivedAt");

-- CreateIndex
CREATE INDEX "Inbound_receivedAt_idx" ON "Inbound"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_inboundId_key" ON "StockMovement"("inboundId");

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "Inbound" ADD CONSTRAINT "Inbound_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inboundId_fkey" FOREIGN KEY ("inboundId") REFERENCES "Inbound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 수동 추가: 입고 수량은 항상 양수 (Prisma 스키마로 표현 불가한 DB 레벨 보호)
ALTER TABLE "Inbound" ADD CONSTRAINT "Inbound_quantity_positive" CHECK ("quantity" > 0);
