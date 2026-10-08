import "server-only";
// 감사 로그 조회 (읽기 전용)
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseKstDate } from "@/lib/datetime";
import { AUDIT_CATEGORIES, AUDIT_PAGE_SIZE, type AuditCategoryCode } from "./codes";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AuditFilter = {
  category: AuditCategoryCode | "";
  q: string;
  from: string; // YYYY-MM-DD (KST) 또는 ""
  to: string;
  page: number;
};

/** 검색 조건 화이트리스트 검증 (잘못된 값은 기본값으로) */
export function parseAuditFilter(sp: Record<string, string | string[] | undefined>): AuditFilter {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const category = one("category");
  const from = one("from");
  const to = one("to");
  const page = Number(one("page"));
  return {
    category: (AUDIT_CATEGORIES as string[]).includes(category) ? (category as AuditCategoryCode) : "",
    q: one("q").slice(0, 100),
    from: parseKstDate(from) ? from : "",
    to: parseKstDate(to) ? to : "",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

export async function listAuditLogs(f: AuditFilter) {
  const where: Prisma.AuditLogWhereInput = {};
  if (f.category) where.category = f.category;
  if (f.q) {
    where.OR = [
      { summary: { contains: f.q, mode: "insensitive" } },
      { targetLabel: { contains: f.q, mode: "insensitive" } },
    ];
  }
  const fromAt = f.from ? parseKstDate(f.from) : null;
  const toAt = f.to ? parseKstDate(f.to) : null;
  if (fromAt || toAt) {
    where.createdAt = {
      ...(fromAt ? { gte: fromAt } : {}),
      ...(toAt ? { lt: new Date(toAt.getTime() + DAY_MS) } : {}), // 종료일 하루 전체 포함
    };
  }

  const total = await prisma.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(f.page, totalPages);
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
  });
  return { rows, total, page, totalPages };
}
