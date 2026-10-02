-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('PRODUCT', 'INBOUND', 'OUTBOUND', 'STOCK', 'WAREHOUSE', 'ORDER', 'DISPATCH', 'VEHICLE');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "category" "AuditCategory" NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_category_createdAt_idx" ON "AuditLog"("category", "createdAt");

-- 수동 추가: 감사 로그는 추가만 가능 (수정·삭제·전체 삭제 차단)
CREATE FUNCTION "audit_log_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '감사 로그는 수정하거나 삭제할 수 없습니다.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_no_update_delete"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_immutable"();

CREATE TRIGGER "AuditLog_no_truncate"
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_immutable"();
