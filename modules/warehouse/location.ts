// 상품 보관위치 직접 변경 (변경·교환·해제) + 이력
import { prisma } from "@/lib/prisma";
import { storageTypeForCategory } from "./assign";
import { STORAGE_TYPE_LABELS } from "./codes";
import type { LocationChangeInput } from "./validation";
import { recordAudit } from "@/modules/audit/service";

export class LocationChangeError extends Error {}

export type LocationChangeResult =
  | {
      status: "done";
      productName: string;
      fromCode: string | null;
      toCode: string | null;
      swapped: { sku: string; name: string; toCode: string | null } | null;
    }
  | { status: "confirm"; warnings: string[]; occupantId: string | null };

/**
 * 보관위치 변경 (단일 트랜잭션, 자동 배정과 같은 잠금 사용)
 * - targetCode null → 위치 해제
 * - 대상 칸에 다른 상품이 있으면 확인 후 서로 교환 (상대는 내 원래 자리로)
 * - 분류와 창고 유형이 안 맞으면 확인 후 허용
 * - 확인이 필요하면 아무것도 바꾸지 않고 status "confirm" 반환
 */
export async function changeProductLocation(input: LocationChangeInput): Promise<LocationChangeResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('assign-product-locations'))`;

    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        locationId: true,
        status: true,
        location: { select: { id: true, code: true, warehouse: { select: { storageType: true } } } },
      },
    });
    if (!product) throw new LocationChangeError("존재하지 않는 상품입니다.");
    if (product.status !== "ACTIVE") throw new LocationChangeError("확정되지 않은 상품은 위치를 지정할 수 없습니다.");
    if ((product.locationId ?? null) !== input.expectedLocationId) {
      throw new LocationChangeError("그 사이 이 상품의 위치가 바뀌었습니다. 새로고침 후 다시 시도하세요.");
    }
    const fromCode = product.location?.code ?? null;
    const audit = (toCode: string | null, swappedWith: string | null) =>
      recordAudit(tx, {
        category: "WAREHOUSE",
        action: "LOCATION_CHANGE",
        targetId: product.id,
        targetLabel: `[${product.sku}] ${product.name}`,
        summary: `${product.name} 보관위치 ${fromCode ?? "없음"} → ${toCode ?? "해제"}${swappedWith ? ` (${swappedWith}와 교환)` : ""}`,
        detail: { from: fromCode, to: toCode, swappedWith, reason: input.reason },
      });

    // 위치 해제
    if (input.targetCode === null) {
      if (!product.locationId) throw new LocationChangeError("이미 보관위치가 없습니다.");
      await tx.product.update({ where: { id: product.id }, data: { locationId: null } });
      await tx.productLocationHistory.create({
        data: { productId: product.id, fromCode, toCode: null, reason: input.reason },
      });
      await audit(null, null);
      return { status: "done", productName: product.name, fromCode, toCode: null, swapped: null };
    }

    const target = await tx.location.findUnique({
      where: { code: input.targetCode },
      select: {
        id: true,
        code: true,
        warehouse: { select: { storageType: true, name: true } },
        product: { select: { id: true, sku: true, name: true, category: true } },
      },
    });
    if (!target) throw new LocationChangeError(`없는 위치코드입니다: ${input.targetCode}`);
    if (target.id === product.locationId) throw new LocationChangeError("현재와 같은 위치입니다.");

    const occupant = target.product;
    const warnings: string[] = [];
    if (occupant) {
      warnings.push(
        `${target.code}에 [${occupant.sku}] ${occupant.name}이(가) 있습니다. 두 상품의 자리를 서로 바꿉니다 → ${occupant.name}은(는) ${fromCode ?? "위치 없음"}(으)로 이동합니다.`
      );
    }
    const want = storageTypeForCategory(product.category);
    if (want !== target.warehouse.storageType) {
      warnings.push(
        `${product.name}은(는) ${product.category}(${STORAGE_TYPE_LABELS[want]} 보관)인데 ${target.warehouse.name}(${STORAGE_TYPE_LABELS[target.warehouse.storageType]})입니다.`
      );
    }
    if (occupant && product.location) {
      const occWant = storageTypeForCategory(occupant.category);
      if (occWant !== product.location.warehouse.storageType) {
        warnings.push(
          `교환되는 ${occupant.name}은(는) ${occupant.category}(${STORAGE_TYPE_LABELS[occWant]} 보관)인데 ${fromCode}은(는) ${STORAGE_TYPE_LABELS[product.location.warehouse.storageType]} 창고입니다.`
        );
      }
    }

    // 경고가 있으면 사용자가 그 내용(같은 상대 상품)을 확인했을 때만 진행
    const occupantId = occupant?.id ?? null;
    if (warnings.length > 0 && (!input.confirmed || input.expectedOccupantId !== occupantId)) {
      return { status: "confirm", warnings, occupantId };
    }

    if (occupant) {
      // unique(locationId) 때문에 순서: 나 해제 → 상대를 내 자리로 → 나를 목표 칸으로
      await tx.product.update({ where: { id: product.id }, data: { locationId: null } });
      await tx.product.update({ where: { id: occupant.id }, data: { locationId: product.locationId } });
      await tx.product.update({ where: { id: product.id }, data: { locationId: target.id } });
      await tx.productLocationHistory.createMany({
        data: [
          { productId: product.id, fromCode, toCode: target.code, swappedWithSku: occupant.sku, reason: input.reason },
          { productId: occupant.id, fromCode: target.code, toCode: fromCode, swappedWithSku: product.sku, reason: input.reason },
        ],
      });
      await audit(target.code, `[${occupant.sku}] ${occupant.name}`);
      return {
        status: "done",
        productName: product.name,
        fromCode,
        toCode: target.code,
        swapped: { sku: occupant.sku, name: occupant.name, toCode: fromCode },
      };
    }

    await tx.product.update({ where: { id: product.id }, data: { locationId: target.id } });
    await tx.productLocationHistory.create({
      data: { productId: product.id, fromCode, toCode: target.code, reason: input.reason },
    });
    await audit(target.code, null);
    return { status: "done", productName: product.name, fromCode, toCode: target.code, swapped: null };
  });
}

/** 위치 선택용 창고 목록 */
export async function listWarehouseOptions() {
  return prisma.warehouse.findMany({
    select: { id: true, code: true, name: true, storageType: true },
    orderBy: [{ storageType: "asc" }, { code: "asc" }],
  });
}

/** 위치 선택용 랙 목록 (+칸별 배정 상품) */
export async function listRacksForPicker(warehouseId: string) {
  const [racks, occupied] = await Promise.all([
    prisma.rack.findMany({
      where: { warehouseId },
      select: { number: true, levels: true, binsPerLevel: true },
      orderBy: { number: "asc" },
    }),
    prisma.location.findMany({
      where: { warehouseId, product: { isNot: null } },
      select: { code: true, product: { select: { name: true } } },
    }),
  ]);
  return { racks, occupied: Object.fromEntries(occupied.map((o) => [o.code, o.product!.name])) };
}

export async function getLocationHistory(productId: string, limit = 5) {
  return prisma.productLocationHistory.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
