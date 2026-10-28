-- 로트번호 + FEFO 출고 정책
CREATE TYPE "PickPolicy" AS ENUM ('FIFO', 'FEFO');

ALTER TABLE "Product" ADD COLUMN "pickPolicy" "PickPolicy" NOT NULL DEFAULT 'FIFO';
ALTER TABLE "Inbound" ADD COLUMN "lotNo" TEXT;
ALTER TABLE "StockBalance" ADD COLUMN "lotNo" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "lotNo" TEXT;

-- 칸 유일성에 로트번호 포함 (null 끼리도 같은 칸: NULLS NOT DISTINCT, PostgreSQL 15+)
DROP INDEX "StockBalance_productId_locationId_expiryDate_lotDate_key";
CREATE UNIQUE INDEX "StockBalance_productId_locationId_expiryDate_lotDate_lotNo_key"
  ON "StockBalance"("productId", "locationId", "expiryDate", "lotDate", "lotNo") NULLS NOT DISTINCT;

-- 로트 추적 조회용
CREATE INDEX "StockMovement_lotNo_idx" ON "StockMovement"("lotNo");
CREATE INDEX "Inbound_lotNo_idx" ON "Inbound"("lotNo");

-- 기존 재고·이력은 로트 미지정(null) 그대로 둔다
