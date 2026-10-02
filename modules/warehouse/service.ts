import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/modules/stock/service";
import { createRacksWithLocations } from "./builder";
import { STORAGE_TYPES, STORAGE_TYPE_LABELS, WAREHOUSE_LIMITS, nextWarehouseCode, type StorageTypeCode } from "./codes";
import { recordAudit } from "@/modules/audit/service";
import type { AddRacksInput, WarehouseInput } from "./validation";

export class WarehouseError extends Error {}

const TX_OPTIONS = { timeout: 30_000 }; // 구획 수천 칸 생성 대비

/** 창고 추가 (+ 처음 랙·구획 함께 생성) — 단일 트랜잭션 */
export async function createWarehouse(input: WarehouseInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const dup = await tx.warehouse.findUnique({ where: { code: input.code }, select: { id: true } });
      if (dup) throw new WarehouseError(`이미 사용 중인 창고코드입니다: ${input.code}`);
      const wh = await tx.warehouse.create({
        data: {
          code: input.code,
          name: input.name,
          storageType: input.storageType,
          memo: input.memo,
        },
      });
      const r = await createRacksWithLocations(tx, wh, {
        startNumber: 1,
        count: input.rackCount,
        levels: input.levels,
        binsPerLevel: input.binsPerLevel,
      });
      await recordAudit(tx, {
        category: "WAREHOUSE",
        action: "WAREHOUSE_CREATE",
        targetId: wh.id,
        targetLabel: `${wh.code} ${wh.name}`,
        summary: `창고 추가: ${wh.code} ${wh.name} (랙 ${r.rackCount}개, 구획 ${r.locationCount.toLocaleString()}칸)`,
        detail: {
          code: wh.code,
          name: wh.name,
          storageType: STORAGE_TYPE_LABELS[wh.storageType],
          racks: r.rackCount,
          levels: input.levels,
          binsPerLevel: input.binsPerLevel,
          locations: r.locationCount,
          memo: wh.memo,
        },
      });
      return { warehouse: wh, ...r };
    }, TX_OPTIONS);
  } catch (e) {
    if (isUniqueViolation(e, "code")) throw new WarehouseError(`이미 사용 중인 창고코드입니다: ${input.code}`);
    throw e;
  }
}

/**
 * 랙 추가 — 단일 트랜잭션
 * 1) 창고 행 잠금 (같은 창고에 동시 추가 시 순서대로 처리)
 * 2) 화면에서 본 랙 수와 현재 랙 수 비교 → 다르면 거부 (연타·동시 추가로 인한 중복 생성 방지)
 * 3) 마지막 번호 다음부터 생성
 */
export async function addRacks(input: AddRacksInput) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; code: string }[]>`
      SELECT "id", "code" FROM "Warehouse" WHERE "id" = ${input.warehouseId} FOR UPDATE`;
    const wh = locked[0];
    if (!wh) throw new WarehouseError("존재하지 않는 창고입니다.");

    const agg = await tx.rack.aggregate({
      where: { warehouseId: wh.id },
      _count: { _all: true },
      _max: { number: true },
    });
    if (agg._count._all !== input.expectedRackCount) {
      throw new WarehouseError(
        `그 사이 랙 수가 바뀌었습니다 (화면 ${input.expectedRackCount}개, 현재 ${agg._count._all}개). 새로고침 후 다시 확인하세요.`
      );
    }
    const startNumber = (agg._max.number ?? 0) + 1;
    const lastNumber = startNumber + input.count - 1;
    if (lastNumber > WAREHOUSE_LIMITS.maxRackNumber) {
      throw new WarehouseError(
        `랙 번호는 ${WAREHOUSE_LIMITS.maxRackNumber}번까지입니다. (요청 시 마지막 번호 ${lastNumber})`
      );
    }

    const r = await createRacksWithLocations(tx, wh, {
      startNumber,
      count: input.count,
      levels: input.levels,
      binsPerLevel: input.binsPerLevel,
    });
    await recordAudit(tx, {
      category: "WAREHOUSE",
      action: "RACK_ADD",
      targetId: wh.id,
      targetLabel: wh.code,
      summary: `${wh.code} 랙 ${r.rackCount}개 추가 (R${String(startNumber).padStart(2, "0")}~R${String(lastNumber).padStart(2, "0")}, 구획 ${r.locationCount.toLocaleString()}칸)`,
      detail: {
        racks: `${startNumber}~${lastNumber}번`,
        levels: input.levels,
        binsPerLevel: input.binsPerLevel,
        locations: r.locationCount,
      },
    });
    return { warehouseCode: wh.code, startNumber, lastNumber, ...r };
  }, TX_OPTIONS);
}

export async function listWarehouses() {
  const rows = await prisma.warehouse.findMany({
    orderBy: [{ storageType: "asc" }, { code: "asc" }],
    include: { _count: { select: { racks: true, locations: true } } },
  });
  // 랙 구성 요약 (예: 4단×6구획 50개), 상품이 배정된 칸 수
  const [configs, used] = await Promise.all([
    prisma.rack.groupBy({
      by: ["warehouseId", "levels", "binsPerLevel"],
      _count: { _all: true },
    }),
    prisma.location.groupBy({
      by: ["warehouseId"],
      where: { product: { isNot: null } },
      _count: { _all: true },
    }),
  ]);
  const usedMap = new Map(used.map((u) => [u.warehouseId, u._count._all]));
  return rows.map((w) => ({
    ...w,
    usedLocations: usedMap.get(w.id) ?? 0,
    rackConfigs: configs
      .filter((c) => c.warehouseId === w.id)
      .map((c) => ({ levels: c.levels, binsPerLevel: c.binsPerLevel, count: c._count._all })),
  }));
}

/** 보관유형별 다음 창고코드 제안 */
export async function suggestWarehouseCodes(): Promise<Record<StorageTypeCode, string>> {
  const codes = (await prisma.warehouse.findMany({ select: { code: true } })).map((w) => w.code);
  return Object.fromEntries(STORAGE_TYPES.map((t) => [t, nextWarehouseCode(t, codes)])) as Record<
    StorageTypeCode,
    string
  >;
}

/** 보관위치가 없는 상품 수 */
export async function countProductsWithoutLocation() {
  return prisma.product.count({ where: { locationId: null, status: "ACTIVE" } });
}

/** 창고 안에서 상품이 배정된 칸 (배치도 표시용) */
export async function listOccupiedLocations(warehouseId: string) {
  return prisma.location.findMany({
    where: { warehouseId, product: { isNot: null } },
    select: { code: true, rackId: true, product: { select: { sku: true, name: true } } },
  });
}

export async function getWarehouseDetail(id: string) {
  return prisma.warehouse.findUnique({
    where: { id },
    include: {
      racks: {
        orderBy: { number: "asc" },
        include: { _count: { select: { locations: true } } },
      },
      _count: { select: { locations: true } },
    },
  });
}
