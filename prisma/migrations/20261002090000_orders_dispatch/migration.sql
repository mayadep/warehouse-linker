-- CreateEnum
CREATE TYPE "TradeOrderType" AS ENUM ('PURCHASE', 'SALES');

-- CreateEnum
CREATE TYPE "TradeOrderStatus" AS ENUM ('OPEN', 'PARTIAL', 'DONE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('PLANNED', 'LOADED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Inbound" ADD COLUMN     "orderLineId" TEXT;

-- AlterTable
ALTER TABLE "Outbound" ADD COLUMN     "orderLineId" TEXT;

-- CreateTable
CREATE TABLE "TradeOrder" (
    "id" TEXT NOT NULL,
    "type" "TradeOrderType" NOT NULL,
    "orderNo" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "status" "TradeOrderStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "memo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER,
    "processedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TradeOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "plateNo" TEXT NOT NULL,
    "storageType" "StorageType" NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT,
    "memo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "dispatchNo" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'PLANNED',
    "memo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchItem" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "outboundId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inbound_orderLineId_idx" ON "Inbound"("orderLineId");

-- CreateIndex
CREATE INDEX "Outbound_orderLineId_idx" ON "Outbound"("orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOrder_orderNo_key" ON "TradeOrder"("orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOrder_requestId_key" ON "TradeOrder"("requestId");

-- CreateIndex
CREATE INDEX "TradeOrder_type_status_createdAt_idx" ON "TradeOrder"("type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TradeOrderLine_productId_idx" ON "TradeOrderLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOrderLine_orderId_productId_key" ON "TradeOrderLine"("orderId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plateNo_key" ON "Vehicle"("plateNo");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_dispatchNo_key" ON "Dispatch"("dispatchNo");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_requestId_key" ON "Dispatch"("requestId");

-- CreateIndex
CREATE INDEX "Dispatch_deliveryDate_idx" ON "Dispatch"("deliveryDate");

-- CreateIndex
CREATE INDEX "Dispatch_vehicleId_deliveryDate_idx" ON "Dispatch"("vehicleId", "deliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchItem_outboundId_key" ON "DispatchItem"("outboundId");

-- CreateIndex
CREATE INDEX "DispatchItem_dispatchId_idx" ON "DispatchItem"("dispatchId");

-- AddForeignKey
ALTER TABLE "Inbound" ADD CONSTRAINT "Inbound_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "TradeOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "TradeOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOrderLine" ADD CONSTRAINT "TradeOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TradeOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeOrderLine" ADD CONSTRAINT "TradeOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_outboundId_fkey" FOREIGN KEY ("outboundId") REFERENCES "Outbound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 수동 추가: 주문 수량은 양수, 처리 수량은 0 ~ 주문 수량
ALTER TABLE "TradeOrderLine" ADD CONSTRAINT "TradeOrderLine_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "TradeOrderLine" ADD CONSTRAINT "TradeOrderLine_processed_range" CHECK ("processedQty" >= 0 AND "processedQty" <= "quantity");
