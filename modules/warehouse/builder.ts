// 랙·구획 생성 (트랜잭션 클라이언트를 받아 동작 → 서비스와 시드에서 공용)
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, StorageType } from "@prisma/client";
import { locationCode, WAREHOUSE_LIMITS } from "./codes";

type Tx = Prisma.TransactionClient;

/**
 * 랙 count 개를 startNumber 부터 만들고, 각 랙의 단×구획 위치를 모두 생성한다.
 * createMany 로 일괄 삽입 (구획 수천 칸도 빠르게).
 */
export async function createRacksWithLocations(
  tx: Tx,
  warehouse: { id: string; code: string },
  args: { startNumber: number; count: number; levels: number; binsPerLevel: number }
) {
  const { startNumber, count, levels, binsPerLevel } = args;
  if (count <= 0) return { rackCount: 0, locationCount: 0 };
  if (startNumber + count - 1 > WAREHOUSE_LIMITS.maxRackNumber) {
    throw new Error(`랙 번호는 ${WAREHOUSE_LIMITS.maxRackNumber}번까지 만들 수 있습니다.`);
  }

  const racks = Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    warehouseId: warehouse.id,
    number: startNumber + i,
    levels,
    binsPerLevel,
  }));
  await tx.rack.createMany({ data: racks });

  const locations: Prisma.LocationCreateManyInput[] = [];
  for (const r of racks) {
    for (let level = 1; level <= levels; level++) {
      for (let bin = 1; bin <= binsPerLevel; bin++) {
        locations.push({
          warehouseId: warehouse.id,
          rackId: r.id,
          level,
          bin,
          code: locationCode(warehouse.code, r.number, level, bin),
        });
      }
    }
  }
  await tx.location.createMany({ data: locations });

  return { rackCount: racks.length, locationCount: locations.length };
}

/** 기본 6개 창고 (시드용) */
export const DEFAULT_WAREHOUSES: { code: string; name: string; storageType: StorageType }[] = [
  { code: "RF1", name: "냉장 1창고", storageType: "REFRIGERATED" },
  { code: "RF2", name: "냉장 2창고", storageType: "REFRIGERATED" },
  { code: "FZ1", name: "냉동 1창고", storageType: "FROZEN" },
  { code: "FZ2", name: "냉동 2창고", storageType: "FROZEN" },
  { code: "AM1", name: "실온 1창고", storageType: "AMBIENT" },
  { code: "AM2", name: "실온 2창고", storageType: "AMBIENT" },
];

/** 기본 창고 생성 (이미 있는 창고코드는 건너뜀 → 여러 번 실행해도 안전) */
export async function seedDefaultWarehouses(
  client: PrismaClient,
  opts = { racks: 50, levels: WAREHOUSE_LIMITS.defaultLevels, binsPerLevel: WAREHOUSE_LIMITS.defaultBinsPerLevel }
) {
  const created: string[] = [];
  for (const w of DEFAULT_WAREHOUSES) {
    const exists = await client.warehouse.findUnique({ where: { code: w.code }, select: { id: true } });
    if (exists) continue;
    await client.$transaction(
      async (tx) => {
        const wh = await tx.warehouse.create({ data: w });
        await createRacksWithLocations(tx, wh, {
          startNumber: 1,
          count: opts.racks,
          levels: opts.levels,
          binsPerLevel: opts.binsPerLevel,
        });
      },
      { timeout: 30_000 }
    );
    created.push(w.code);
  }
  return created;
}
