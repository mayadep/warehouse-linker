-- CreateTable
CREATE TABLE "LoginThrottle" (
    "loginId" TEXT NOT NULL,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("loginId")
);

-- 실패 횟수는 음수 불가 (수동 추가)
ALTER TABLE "LoginThrottle" ADD CONSTRAINT "LoginThrottle_failCount_check" CHECK ("failCount" >= 0);
