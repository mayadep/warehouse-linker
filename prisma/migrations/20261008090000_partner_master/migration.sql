-- 거래처 마스터: 공급처·출고처 문자열 입력 → Partner 선택

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('SUPPLIER', 'CUSTOMER', 'BOTH');

-- AlterEnum
ALTER TYPE "AuditCategory" ADD VALUE IF NOT EXISTS 'PARTNER';

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- 이름은 앞뒤 공백 없이, 대소문자 무시로 중복 불가
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_name_check" CHECK ("name" = btrim("name") AND length("name") > 0);
CREATE UNIQUE INDEX "Partner_name_lower_key" ON "Partner" (lower("name"));

-- AlterTable: 새 FK 컬럼 (백필 전까지 nullable)
ALTER TABLE "Inbound" ADD COLUMN "partnerId" TEXT;
ALTER TABLE "Outbound" ADD COLUMN "partnerId" TEXT;
ALTER TABLE "TradeOrder" ADD COLUMN "partnerId" TEXT;

-- 기존 문자열 값 → Partner (대소문자·앞뒤 공백만 다른 값은 한 거래처로 합침, 표기는 가장 먼저 정렬되는 것)
INSERT INTO "Partner" ("id", "name", "type", "updatedAt")
SELECT
    gen_random_uuid()::text,
    min(n),
    (CASE
        WHEN bool_or(k = 'S') AND bool_or(k = 'C') THEN 'BOTH'
        WHEN bool_or(k = 'S') THEN 'SUPPLIER'
        ELSE 'CUSTOMER'
    END)::"PartnerType",
    CURRENT_TIMESTAMP
FROM (
    SELECT btrim("supplier") AS n, 'S' AS k FROM "Inbound" WHERE btrim(coalesce("supplier", '')) <> ''
    UNION ALL
    SELECT btrim("customer"), 'C' FROM "Outbound" WHERE btrim(coalesce("customer", '')) <> ''
    UNION ALL
    SELECT btrim("partner"), CASE WHEN "type" = 'PURCHASE' THEN 'S' ELSE 'C' END FROM "TradeOrder" WHERE btrim("partner") <> ''
) src
GROUP BY lower(n);

UPDATE "Inbound" t SET "partnerId" = p."id" FROM "Partner" p WHERE lower(p."name") = lower(btrim(t."supplier"));
UPDATE "Outbound" t SET "partnerId" = p."id" FROM "Partner" p WHERE lower(p."name") = lower(btrim(t."customer"));
UPDATE "TradeOrder" t SET "partnerId" = p."id" FROM "Partner" p WHERE lower(p."name") = lower(btrim(t."partner"));

-- 문자열 컬럼 제거
ALTER TABLE "Inbound" DROP COLUMN "supplier";
ALTER TABLE "Outbound" DROP COLUMN "customer";
ALTER TABLE "TradeOrder" DROP COLUMN "partner";
ALTER TABLE "TradeOrder" ALTER COLUMN "partnerId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Inbound_partnerId_idx" ON "Inbound"("partnerId");
CREATE INDEX "Outbound_partnerId_idx" ON "Outbound"("partnerId");
CREATE INDEX "TradeOrder_partnerId_idx" ON "TradeOrder"("partnerId");

-- AddForeignKey
ALTER TABLE "Inbound" ADD CONSTRAINT "Inbound_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Outbound" ADD CONSTRAINT "Outbound_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TradeOrder" ADD CONSTRAINT "TradeOrder_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
