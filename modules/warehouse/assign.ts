import "server-only";
// 상품 기본 보관위치 랜덤 자동 배정
import { prisma } from "@/lib/prisma";
import { STORAGE_TYPES, STORAGE_TYPE_LABELS, type StorageTypeCode } from "./codes";
import { recordAudit } from "@/modules/audit/service";

/** 상품 분류 → 보관할 창고 유형 (목록에 없는 분류는 실온) */
export const CATEGORY_STORAGE: Record<string, StorageTypeCode> = {
  냉동식품: "FROZEN",
  유제품: "REFRIGERATED",
};

export function storageTypeForCategory(category: string): StorageTypeCode {
  return CATEGORY_STORAGE[category] ?? "AMBIENT";
}

/** 보관 온도 검사: 상품 분류의 보관 유형과 칸이 속한 창고 유형이 다르면 경고 문구, 맞으면 null */
export function storageMismatchWarning(
  product: { name: string; category: string },
  location: { code: string; warehouse: { name: string; storageType: StorageTypeCode } }
): string | null {
  const want = storageTypeForCategory(product.category);
  const actual = location.warehouse.storageType;
  if (want === actual) return null;
  return `보관 온도가 맞지 않습니다: ${product.name}은(는) ${product.category}(${STORAGE_TYPE_LABELS[want]} 보관)인데 ${location.code}은(는) ${location.warehouse.name}(${STORAGE_TYPE_LABELS[actual]})입니다.`;
}

type Counts = Record<StorageTypeCode, number>;
const zero = (): Counts => ({ REFRIGERATED: 0, FROZEN: 0, AMBIENT: 0 });

/**
 * 위치가 없는 상품에만 빈 칸을 랜덤 배정 (단일 트랜잭션)
 * - advisory lock 으로 동시 실행(버튼 연타)을 한 번에 하나씩 처리
 * - 한 칸에 한 상품만 (DB unique 가 최종 보장)
 * - 해당 유형 창고에 빈 칸이 모자라면 남은 상품은 배정하지 않음
 */
export async function assignRandomLocations() {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('assign-product-locations'))`;

      const products = await tx.product.findMany({
        where: { locationId: null, status: "ACTIVE" }, // 확정 대기 상품 제외
        select: { id: true, category: true },
        orderBy: { sku: "asc" },
      });

      const byType: Record<StorageTypeCode, string[]> = { REFRIGERATED: [], FROZEN: [], AMBIENT: [] };
      for (const p of products) byType[storageTypeForCategory(p.category)].push(p.id);

      const assigned = zero();
      const unassigned = zero();

      for (const type of STORAGE_TYPES) {
        const ids = byType[type];
        if (ids.length === 0) continue;
        const free = await tx.$queryRaw<{ id: string }[]>`
          SELECT l."id"
          FROM "Location" l
          JOIN "Warehouse" w ON w."id" = l."warehouseId"
          JOIN "Rack" r ON r."id" = l."rackId"
          WHERE w."storageType" = ${type}::"StorageType"
            AND w."isActive" AND r."isActive"
            AND NOT EXISTS (SELECT 1 FROM "Product" p WHERE p."locationId" = l."id")
          ORDER BY random()
          LIMIT ${ids.length}`;
        for (let i = 0; i < free.length; i++) {
          await tx.product.update({ where: { id: ids[i] }, data: { locationId: free[i].id } });
        }
        assigned[type] = free.length;
        unassigned[type] = ids.length - free.length;
      }

      const total = (c: Counts) => c.REFRIGERATED + c.FROZEN + c.AMBIENT;
      const byLabel = (c: Counts) => STORAGE_TYPES.map((t) => `${STORAGE_TYPE_LABELS[t]} ${c[t]}`).join(", ");
      if (products.length > 0) {
        await recordAudit(tx, {
          category: "WAREHOUSE",
          action: "LOCATION_AUTO_ASSIGN",
          summary: `보관위치 자동 배정 ${total(assigned).toLocaleString()}개${total(unassigned) ? `, 빈 칸 부족으로 미배정 ${total(unassigned).toLocaleString()}개` : ""}`,
          detail: { assigned: byLabel(assigned), unassigned: byLabel(unassigned) },
        });
      }
      return { assigned, unassigned, assignedTotal: total(assigned), unassignedTotal: total(unassigned) };
    },
    { timeout: 30_000 }
  );
}
