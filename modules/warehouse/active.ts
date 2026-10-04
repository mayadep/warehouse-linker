// 창고·랙 비활성화 / 다시 사용 + 새 위치로 지정할 칸의 사용 가능 여부 검사
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/modules/audit/service";
import { rackCode } from "./codes";

export class WarehouseActiveError extends Error {}

type Tx = Prisma.TransactionClient;

/**
 * 칸을 새 위치(입고·위치 이동·보관위치 지정 대상)로 쓸 수 있는지 확인.
 * 창고 행을 FOR SHARE 로 잠가 같은 창고의 비활성화와 동시에 진행되지 않게 한다.
 * 쓸 수 없으면 문구, 쓸 수 있으면 null (없는 칸은 호출하는 쪽에서 먼저 안내)
 */
export async function inactiveLocationMessage(tx: Tx, locationId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<
    { code: string; whActive: boolean; whCode: string; whName: string; rackActive: boolean; rackNumber: number }[]
  >`
    SELECT l."code", w."isActive" AS "whActive", w."code" AS "whCode", w."name" AS "whName",
           r."isActive" AS "rackActive", r."number" AS "rackNumber"
    FROM "Location" l
    JOIN "Rack" r ON r."id" = l."rackId"
    JOIN "Warehouse" w ON w."id" = l."warehouseId"
    WHERE l."id" = ${locationId}
    FOR SHARE OF w`;
  const r = rows[0];
  if (!r) return null;
  if (!r.whActive) return `${r.code}은(는) 비활성 창고(${r.whCode} ${r.whName})의 위치입니다. 다른 위치를 지정하세요.`;
  if (!r.rackActive) return `${r.code}은(는) 비활성 랙(${r.whCode} ${rackCode(r.rackNumber)})의 위치입니다. 다른 위치를 지정하세요.`;
  return null;
}

/** 비활성화를 막는 항목: 재고·기본 보관위치·대기 입고/출고 지정 (없으면 빈 배열) */
async function findBlockers(tx: Tx, where: Prisma.LocationWhereInput): Promise<string[]> {
  const [stock, stockSample, products, productSample, inbounds, outbounds] = await Promise.all([
    tx.stockBalance.count({ where: { quantity: { gt: 0 }, location: where } }),
    tx.stockBalance.findFirst({
      where: { quantity: { gt: 0 }, location: where },
      select: { location: { select: { code: true } }, product: { select: { name: true } } },
    }),
    tx.product.count({ where: { location: where } }),
    tx.product.findFirst({ where: { location: where }, select: { name: true, location: { select: { code: true } } } }),
    tx.inbound.count({ where: { status: "PENDING", location: where } }),
    tx.outbound.count({ where: { status: "PENDING", pickLocation: where } }),
  ]);
  const out: string[] = [];
  if (stock > 0) {
    out.push(
      `재고가 남아 있습니다 (${stock.toLocaleString()}건, 예: ${stockSample?.location?.code} ${stockSample?.product.name}). 재고현황에서 위치 이동 후 비활성화하세요.`
    );
  }
  if (products > 0) {
    out.push(
      `기본 보관위치로 지정된 상품이 ${products.toLocaleString()}개 있습니다 (예: ${productSample?.location?.code} ${productSample?.name}). 보관위치를 변경하거나 해제하세요.`
    );
  }
  if (inbounds > 0) out.push(`이 위치를 지정한 확정 대기 입고가 ${inbounds.toLocaleString()}건 있습니다. 확정하거나 삭제하세요.`);
  if (outbounds > 0) out.push(`이 위치를 지정한 확정 대기 출고가 ${outbounds.toLocaleString()}건 있습니다. 확정하거나 삭제하세요.`);
  return out;
}

/** 자동 배정·보관위치 변경과 같은 잠금 → 창고 행 잠금 순서 (교착 방지) */
async function lockWarehouse(tx: Tx, warehouseId: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('assign-product-locations'))`;
  const rows = await tx.$queryRaw<{ id: string; code: string; name: string; isActive: boolean }[]>`
    SELECT "id", "code", "name", "isActive" FROM "Warehouse" WHERE "id" = ${warehouseId} FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * 창고 비활성화 / 다시 사용 (단일 트랜잭션)
 * - 비활성화: 창고 안 칸에 재고·배정 상품·대기 입출고 지정이 없어야 함
 * - 이미 그 상태면 거부 (연타·동시 처리)
 */
export async function setWarehouseActive(warehouseId: string, active: boolean) {
  return prisma.$transaction(async (tx) => {
    const wh = await lockWarehouse(tx, warehouseId);
    if (!wh) throw new WarehouseActiveError("존재하지 않는 창고입니다.");
    if (wh.isActive === active) {
      throw new WarehouseActiveError(`${wh.code}은(는) 이미 ${active ? "사용 중" : "비활성"}입니다. 새로고침 후 확인하세요.`);
    }
    if (!active) {
      const blockers = await findBlockers(tx, { warehouseId });
      if (blockers.length > 0) throw new WarehouseActiveError(`${wh.code} 비활성화 불가: ${blockers.join(" / ")}`);
    }
    await tx.warehouse.update({ where: { id: wh.id }, data: { isActive: active } });
    await recordAudit(tx, {
      category: "WAREHOUSE",
      action: active ? "WAREHOUSE_ACTIVE" : "WAREHOUSE_INACTIVE",
      targetId: wh.id,
      targetLabel: `${wh.code} ${wh.name}`,
      summary: `창고 ${active ? "다시 사용" : "비활성화"}: ${wh.code} ${wh.name}`,
    });
    return { label: `${wh.code} ${wh.name}`, warehouseId: wh.id };
  });
}

/** 랙 비활성화 / 다시 사용 (단일 트랜잭션, 창고 행 잠금) */
export async function setRackActive(rackId: string, active: boolean) {
  return prisma.$transaction(async (tx) => {
    const rack = await tx.rack.findUnique({ where: { id: rackId }, select: { warehouseId: true } });
    if (!rack) throw new WarehouseActiveError("존재하지 않는 랙입니다.");
    const wh = await lockWarehouse(tx, rack.warehouseId);
    const cur = await tx.rack.findUnique({ where: { id: rackId }, select: { id: true, number: true, isActive: true } });
    if (!wh || !cur) throw new WarehouseActiveError("존재하지 않는 랙입니다.");
    const label = `${wh.code} ${rackCode(cur.number)}`;
    if (cur.isActive === active) {
      throw new WarehouseActiveError(`${label}은(는) 이미 ${active ? "사용 중" : "비활성"}입니다. 새로고침 후 확인하세요.`);
    }
    if (!active) {
      const blockers = await findBlockers(tx, { rackId });
      if (blockers.length > 0) throw new WarehouseActiveError(`${label} 비활성화 불가: ${blockers.join(" / ")}`);
    }
    await tx.rack.update({ where: { id: cur.id }, data: { isActive: active } });
    await recordAudit(tx, {
      category: "WAREHOUSE",
      action: active ? "RACK_ACTIVE" : "RACK_INACTIVE",
      targetId: wh.id,
      targetLabel: label,
      summary: `랙 ${active ? "다시 사용" : "비활성화"}: ${label}`,
    });
    return { label, warehouseId: wh.id };
  });
}
