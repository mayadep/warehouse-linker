-- 공지사항

-- AlterEnum
ALTER TYPE "AuditCategory" ADD VALUE IF NOT EXISTS 'NOTICE';

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "authorName" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- 제목·내용은 공백만으로 둘 수 없음
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_text_check" CHECK (length(btrim("title")) > 0 AND length(btrim("body")) > 0);

-- CreateIndex
CREATE UNIQUE INDEX "Notice_requestId_key" ON "Notice"("requestId");
CREATE INDEX "Notice_isPublished_isPinned_createdAt_idx" ON "Notice"("isPublished", "isPinned", "createdAt");
