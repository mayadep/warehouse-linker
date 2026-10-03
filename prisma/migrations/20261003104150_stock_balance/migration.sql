-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'EXPIRY_CHANGE';

-- AlterTable
ALTER TABLE "Inbound" ADD COLUMN     "expiryDate" DATE,
ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "expiryDate" DATE,
ADD COLUMN     "locationId" TEXT;

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT,
    "expiryDate" DATE,
    "quantity" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockBalance_locationId_idx" ON "StockBalance"("locationId");

-- CreateIndex
-- null(미지정 위치·유통기한 미상)끼리도 같은 칸으로 취급 (수동 수정: NULLS NOT DISTINCT, PostgreSQL 15+)
CREATE UNIQUE INDEX "StockBalance_productId_locationId_expiryDate_key" ON "StockBalance"("productId", "locationId", "expiryDate") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "Inbound" ADD CONSTRAINT "Inbound_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 수동 추가: 칸별 수량은 양수 (0이 되면 행 삭제)
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_quantity_check" CHECK ("quantity" > 0);

-- 수동 추가: 기존 이력은 상품의 현재 기본 보관위치(없으면 미지정)에서 일어난 것으로 이관
UPDATE "StockMovement" m SET "locationId" = p."locationId" FROM "Product" p WHERE m."productId" = p."id";

-- 수동 추가: 기존 재고 → 기본 보관위치(없으면 미지정) · 유통기한 미상 칸 1개
INSERT INTO "StockBalance" ("id", "productId", "locationId", "expiryDate", "quantity", "updatedAt")
SELECT gen_random_uuid()::text, p."id", p."locationId", NULL, p."stock", CURRENT_TIMESTAMP
FROM "Product" p WHERE p."stock" > 0;