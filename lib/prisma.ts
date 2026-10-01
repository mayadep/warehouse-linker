import { PrismaClient } from "@prisma/client";

// 개발 모드 HMR 시 커넥션이 계속 늘어나지 않도록 전역에 1개만 유지
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
