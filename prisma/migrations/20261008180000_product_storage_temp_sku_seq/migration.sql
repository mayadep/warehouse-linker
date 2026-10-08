-- CreateEnum
CREATE TYPE "StorageTemp" AS ENUM ('AMBIENT', 'CHILLED', 'FROZEN');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "storageTemp" "StorageTemp" NOT NULL DEFAULT 'AMBIENT';

-- 수동 추가: 품목코드 자동 채번용 시퀀스 (P-000001 형식)
CREATE SEQUENCE "product_sku_seq" START 1;
