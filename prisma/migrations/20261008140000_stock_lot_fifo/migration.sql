-- 선입선출(FIFO): 칸을 입고일(lotDate)까지 나눠 오래된 입고분부터 출고
ALTER TABLE "StockBalance" ADD COLUMN "lotDate" DATE;
ALTER TABLE "StockMovement" ADD COLUMN "lotDate" DATE;

-- 칸 유일성에 입고일 포함 (null 끼리도 같은 칸: NULLS NOT DISTINCT, PostgreSQL 15+)
DROP INDEX "StockBalance_productId_locationId_expiryDate_key";
CREATE UNIQUE INDEX "StockBalance_productId_locationId_expiryDate_lotDate_key"
  ON "StockBalance"("productId", "locationId", "expiryDate", "lotDate") NULLS NOT DISTINCT;

-- 기존 재고·이력의 입고일은 알 수 없으므로 null(미상) 그대로 둔다 → 새 입고분보다 먼저 출고된다
