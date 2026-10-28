-- 실사 범위를 구조화해 저장 (발견분 추가 때 서버가 범위 안인지 검증)
ALTER TABLE "CycleCount" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "CycleCount" ADD COLUMN "locationPrefix" TEXT;

ALTER TABLE "CycleCount" ADD CONSTRAINT "CycleCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 기존 실사표는 범위 정보가 없으므로 null(제한 없음)로 둔다
