import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/modules/audit/service";
import { partnerAllows, PARTNER_KIND_LABELS, PARTNER_TYPE_LABELS, type PartnerKind, type PartnerTypeCode } from "./codes";
import type { PartnerCreateInput, PartnerUpdateInput } from "./validation";

export class PartnerError extends Error {}

/** 이름 중복: 유니크 인덱스가 lower(name) 식이라 오류 target 에 컬럼명이 잡히지 않으므로 코드만 확인한다 */
function isNameTaken(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

const CONFLICT = "다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요.";

/**
 * 입출고·주문에 쓸 거래처 확인 (트랜잭션 안에서 호출)
 * - 존재하지 않거나, 용도(공급처/출고처)가 맞지 않거나, 사용 중지된 거래처는 거부
 * - opts.keepId: 기존 기록 수정에서 원래 거래처는 사용 중지여도 그대로 둘 수 있음
 * - opts.error: 호출한 도메인의 오류 클래스로 바꿔 던지기 (화면에 그대로 안내되도록)
 */
export async function resolvePartner(
  tx: Prisma.TransactionClient,
  partnerId: string,
  kind: PartnerKind,
  opts: { keepId?: string | null; error?: (message: string) => Error } = {}
): Promise<{ id: string; name: string }> {
  const fail = (m: string) => (opts.error ? opts.error(m) : new PartnerError(m));
  const label = PARTNER_KIND_LABELS[kind];
  const p = await tx.partner.findUnique({ where: { id: partnerId }, select: { id: true, name: true, type: true, isActive: true } });
  if (!p) throw fail(`존재하지 않는 ${label}입니다.`);
  if (!partnerAllows(p.type, kind)) {
    throw fail(`${p.name}은(는) ${PARTNER_TYPE_LABELS[p.type]}로 등록된 거래처라 ${label}로 쓸 수 없습니다.`);
  }
  if (!p.isActive && p.id !== opts.keepId) {
    throw fail(`${p.name}은(는) 사용 중지된 거래처입니다. 거래처 관리에서 다시 사용으로 바꾼 뒤 선택하세요.`);
  }
  return { id: p.id, name: p.name };
}

/** 입출고·주문 폼 선택 목록 (사용 중인 거래처만, 가나다순). keepId 는 수정 중인 기록의 현재 거래처 */
export async function listPartnerOptions(kind: PartnerKind, keepId?: string | null) {
  return prisma.partner.findMany({
    where: {
      type: { in: kind === "SUPPLIER" ? ["SUPPLIER", "BOTH"] : ["CUSTOMER", "BOTH"] },
      OR: keepId ? [{ isActive: true }, { id: keepId }] : [{ isActive: true }],
    },
    select: { id: true, name: true, isActive: true },
    orderBy: { name: "asc" },
  });
}

/** 거래처 관리 화면 목록 (거래 건수 포함) */
export async function listPartners() {
  return prisma.partner.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { _count: { select: { inbounds: true, outbounds: true, orders: true } } },
  });
}

export async function createPartner(input: PartnerCreateInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const p = await tx.partner.create({ data: { name: input.name, type: input.type }, select: { id: true, name: true, type: true } });
      await recordAudit(tx, {
        category: "PARTNER",
        action: "PARTNER_CREATE",
        targetId: p.id,
        targetLabel: p.name,
        summary: `거래처 등록: ${p.name} (${PARTNER_TYPE_LABELS[p.type]})`,
        detail: { name: p.name, type: PARTNER_TYPE_LABELS[p.type] },
      });
      return p;
    });
  } catch (e) {
    if (isNameTaken(e)) throw new PartnerError(`이미 등록된 거래처입니다: ${input.name}`);
    throw e;
  }
}

/** 이름·구분·사용 여부 변경. 이미 거래 기록이 있는 용도는 구분에서 뺄 수 없다 */
export async function updatePartner(input: PartnerUpdateInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const cur = await tx.partner.findUnique({
        where: { id: input.partnerId },
        include: { orders: { select: { type: true }, distinct: ["type"] }, _count: { select: { inbounds: true, outbounds: true } } },
      });
      if (!cur) throw new PartnerError("존재하지 않는 거래처입니다.");
      if (cur.version !== input.version) throw new PartnerError(CONFLICT);

      const usedAs: Record<PartnerKind, boolean> = {
        SUPPLIER: cur._count.inbounds > 0 || cur.orders.some((o) => o.type === "PURCHASE"),
        CUSTOMER: cur._count.outbounds > 0 || cur.orders.some((o) => o.type === "SALES"),
      };
      for (const kind of ["SUPPLIER", "CUSTOMER"] as const) {
        if (usedAs[kind] && !partnerAllows(input.type, kind)) {
          throw new PartnerError(`${PARTNER_KIND_LABELS[kind]}로 거래한 기록이 있어 구분에서 ${PARTNER_KIND_LABELS[kind]}를 뺄 수 없습니다.`);
        }
      }

      const before: Record<string, string> = {};
      const after: Record<string, string> = {};
      if (cur.name !== input.name) [before.name, after.name] = [cur.name, input.name];
      if (cur.type !== input.type) {
        [before.type, after.type] = [PARTNER_TYPE_LABELS[cur.type as PartnerTypeCode], PARTNER_TYPE_LABELS[input.type]];
      }
      if (cur.isActive !== input.isActive) {
        [before.isActive, after.isActive] = [cur.isActive ? "사용" : "중지", input.isActive ? "사용" : "중지"];
      }
      if (Object.keys(after).length === 0) throw new PartnerError("변경된 내용이 없습니다.");

      const r = await tx.partner.updateMany({
        where: { id: cur.id, version: input.version },
        data: { name: input.name, type: input.type, isActive: input.isActive, version: { increment: 1 } },
      });
      if (r.count === 0) throw new PartnerError(CONFLICT);

      await recordAudit(tx, {
        category: "PARTNER",
        action: "PARTNER_UPDATE",
        targetId: cur.id,
        targetLabel: input.name,
        summary: `거래처 수정: ${cur.name} [${Object.keys(after)
          .map((k) => ({ name: "거래처명", type: "구분", isActive: "사용 여부" })[k])
          .join(", ")}]`,
        detail: { before, after },
      });
      return { name: input.name };
    });
  } catch (e) {
    if (isNameTaken(e)) throw new PartnerError(`이미 등록된 거래처입니다: ${input.name}`);
    throw e;
  }
}
