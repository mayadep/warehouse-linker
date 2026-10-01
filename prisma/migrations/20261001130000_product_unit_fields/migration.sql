-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('EA', 'BOX', 'CAN', 'L', 'KG');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "baseUnit" "ProductUnit" NOT NULL DEFAULT 'EA',
ADD COLUMN     "boxQty" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "trackExpiry" BOOLEAN NOT NULL DEFAULT true;

-- 수동 추가: 박스당 입수는 1 이상
ALTER TABLE "Product" ADD CONSTRAINT "Product_boxQty_positive" CHECK ("boxQty" >= 1);
