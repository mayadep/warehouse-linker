-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "safetyStock" INTEGER NOT NULL DEFAULT 0;

-- 수동 추가: 안전재고는 0 이상
ALTER TABLE "Product" ADD CONSTRAINT "Product_safetyStock_nonnegative" CHECK ("safetyStock" >= 0);
