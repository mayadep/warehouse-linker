-- CreateEnum
CREATE TYPE "OutboundStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'OUTBOUND_CANCEL';

-- AlterTable
ALTER TABLE "Outbound" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "status" "OutboundStatus" NOT NULL DEFAULT 'CONFIRMED';

-- CreateIndex
CREATE INDEX "Outbound_status_shippedAt_idx" ON "Outbound"("status", "shippedAt");

-- AddForeignKey
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 수동 추가: 취소된 출고는 취소 일시·사유 필수, 대기 출고는 수주 연결 불가(수주 출고는 즉시 확정)
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_cancel_info" CHECK ("status" <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL));
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_pending_no_order" CHECK ("status" <> 'PENDING' OR "orderLineId" IS NULL);
