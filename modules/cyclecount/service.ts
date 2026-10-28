import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyToDb, dbToDateOnly, todayKst } from "@/lib/datetime";
import { recordAudit } from "@/modules/audit/service";
import { changeStock } from "@/modules/stock/service";
import { inactiveLocationMessage } from "@/modules/warehouse/active";
import type { CurrentUser } from "@/modules/user/auth";
import { COUNT_LIMITS } from "./codes";
import type { CountCreateInput, CountFoundInput } from "./validation";

export class CountError extends Error {}

const kstYymmdd = () => todayKst().replaceAll("-", "").slice(2);

/** 실사표 생성: 범위의 칸 재고를 스냅샷으로 뜬다. 같은 requestId 는 1장만 */
export async function createCycleCount(input: CountCreateInput, actor: CurrentUser) {
  const dup = await prisma.cycleCount.findUnique({ where: { requestId: input.requestId }, select: { id: true } });
  if (dup) return { id: dup.id, duplicated: true };

  const locationWhere: Prisma.LocationWhereInput = {
    ...(input.warehouseId ? { warehouseId: input.warehouseId } : {}),
    ...(input.locationPrefix ? { code: { startsWith: input.locationPrefix } } : {}),
  };
  const warehouse = input.warehouseId
    ? await prisma.warehouse.findUnique({ where: { id: input.warehouseId }, select: { name: true } })
    : null;
  if (input.warehouseId && !warehouse) throw new CountError("존재하지 않는 창고입니다.");

  const balances = await prisma.stockBalance.findMany({
    where: { location: locationWhere },
    select: { productId: true, locationId: true, expiryDate: true, lotDate: true, lotNo: true, quantity: true },
    take: COUNT_LIMITS.maxLines + 1,
  });
  if (balances.length === 0) throw new CountError("범위 안에 재고가 있는 칸이 없습니다. 창고나 위치코드 앞부분을 확인하세요.");
  if (balances.length > COUNT_LIMITS.maxLines) {
    throw new CountError(
      `실사표는 한 장에 ${COUNT_LIMITS.maxLines.toLocaleString()}줄까지 만들 수 있습니다. 위치코드 앞부분(랙 단위)으로 범위를 좁히세요.`
    );
  }
  const scope = [warehouse?.name, input.locationPrefix].filter(Boolean).join(" · ").slice(0, COUNT_LIMITS.maxScope);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const prefix = `CC-${kstYymmdd()}-`;
          const seq = (await tx.cycleCount.count({ where: { countNo: { startsWith: prefix } } })) + 1 + attempt;
          const count = await tx.cycleCount.create({
            data: {
              countNo: `${prefix}${String(seq).padStart(3, "0")}`,
              requestId: input.requestId,
              scope,
              warehouseId: input.warehouseId,
              locationPrefix: input.locationPrefix || null,
              memo: input.memo,
              createdById: actor.id,
            },
          });
          await tx.cycleCountLine.createMany({
            data: balances.map((b) => ({
              countId: count.id,
              productId: b.productId,
              locationId: b.locationId,
              expiryDate: b.expiryDate,
              lotDate: b.lotDate,
              lotNo: b.lotNo,
              bookQty: b.quantity,
            })),
          });
          await recordAudit(tx, {
            category: "STOCK",
            action: "CYCLE_COUNT_CREATE",
            targetId: count.id,
            targetLabel: count.countNo,
            summary: `재고 실사표 생성: ${count.countNo} (${scope}, ${balances.length.toLocaleString()}줄)`,
            detail: { scope, lines: balances.length, memo: input.memo },
          });
          return { id: count.id, duplicated: false };
        },
        { timeout: 30_000 }
      );
    } catch (e) {
      // 실사번호 충돌(동시 생성)은 번호를 올려 다시 시도
      const err = e as { code?: string; meta?: { target?: unknown } };
      if (err.code === "P2002" && String(err.meta?.target).includes("countNo")) continue;
      if (err.code === "P2002" && String(err.meta?.target).includes("requestId")) {
        const again = await prisma.cycleCount.findUnique({ where: { requestId: input.requestId }, select: { id: true } });
        if (again) return { id: again.id, duplicated: true };
      }
      throw e;
    }
  }
  throw new CountError("실사번호를 만들지 못했습니다. 다시 시도하세요.");
}

export async function listCycleCounts() {
  const rows = await prisma.cycleCount.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      countNo: true,
      status: true,
      scope: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      _count: { select: { lines: true } },
    },
  });
  const counted = await prisma.cycleCountLine.groupBy({
    by: ["countId"],
    where: { countId: { in: rows.map((r) => r.id) }, countedQty: { not: null } },
    _count: { _all: true },
  });
  const countedMap = new Map(counted.map((c) => [c.countId, c._count._all]));
  return rows.map((r) => ({ ...r, countedLines: countedMap.get(r.id) ?? 0 }));
}

const balanceKey = (productId: string, locationId: string | null, exp: Date | null, lot: Date | null, lotNo: string | null) =>
  [productId, locationId ?? "", exp?.getTime() ?? "", lot?.getTime() ?? "", lotNo ?? ""].join("|");

type KeyedLine = { productId: string; locationId: string | null; expiryDate: Date | null; lotDate: Date | null; lotNo: string | null };
type AfterMovement = KeyedLine & { quantity: number; createdAt: Date };

/** 센 시각 이후 해당 상품들의 재고 변동 (입고·출고·이동·조정 모두, 칸·로트별 부호 있는 수량) */
async function movementsSince(
  db: Pick<Prisma.TransactionClient, "stockMovement">,
  productIds: string[],
  since: Date
): Promise<AfterMovement[]> {
  if (productIds.length === 0) return [];
  return db.stockMovement.findMany({
    where: { productId: { in: productIds }, createdAt: { gt: since } },
    select: { productId: true, locationId: true, expiryDate: true, lotDate: true, lotNo: true, quantity: true, createdAt: true },
  });
}

/**
 * 센 시각의 칸 재고 = 지금 칸 재고 − 센 시각 이후의 그 칸·로트 변동 합.
 * 실사 증감 = 실사 수량 − 센 시각의 칸 재고 (센 뒤에 실제로 나간 출고 등은 그대로 둔다)
 */
function stockAtCountTime(line: KeyedLine, current: number, countedAt: Date, after: AfterMovement[]): number {
  const k = balanceKey(line.productId, line.locationId, line.expiryDate, line.lotDate, line.lotNo);
  let moved = 0;
  for (const m of after) {
    if (m.createdAt > countedAt && balanceKey(m.productId, m.locationId, m.expiryDate, m.lotDate, m.lotNo) === k) moved += m.quantity;
  }
  return Math.max(0, current - moved);
}

export async function getCycleCount(id: string) {
  const count = await prisma.cycleCount.findUnique({
    where: { id },
    select: {
      id: true,
      countNo: true,
      status: true,
      scope: true,
      memo: true,
      version: true,
      createdAt: true,
      confirmedAt: true,
      createdBy: { select: { name: true } },
      confirmedBy: { select: { name: true } },
    },
  });
  if (!count) return null;
  const lines = await prisma.cycleCountLine.findMany({
    where: { countId: id },
    select: {
      id: true,
      productId: true,
      locationId: true,
      expiryDate: true,
      lotDate: true,
      lotNo: true,
      bookQty: true,
      countedQty: true,
      countedAt: true,
      appliedDelta: true,
      product: { select: { sku: true, name: true, baseUnit: true } },
      location: { select: { code: true } },
    },
    orderBy: [{ location: { code: "asc" } }, { product: { sku: "asc" } }, { expiryDate: "asc" }],
  });
  // 진행 중이면 현재 장부 수량도 함께 (실사표를 뜬 뒤 입출고로 달라졌는지 표시)
  let current = new Map<string, number>();
  let after: AfterMovement[] = [];
  if (count.status === "COUNTING") {
    const sinceTimes = lines.flatMap((l) => (l.countedAt ? [l.countedAt.getTime()] : []));
    if (sinceTimes.length > 0) {
      after = await movementsSince(
        prisma,
        [...new Set(lines.filter((l) => l.countedAt).map((l) => l.productId))],
        new Date(Math.min(...sinceTimes))
      );
    }
    const bals = await prisma.stockBalance.findMany({
      where: { productId: { in: [...new Set(lines.map((l) => l.productId))] } },
      select: { productId: true, locationId: true, expiryDate: true, lotDate: true, lotNo: true, quantity: true },
    });
    current = new Map(bals.map((b) => [balanceKey(b.productId, b.locationId, b.expiryDate, b.lotDate, b.lotNo), b.quantity]));
  }
  return {
    count,
    lines: lines.map((l) => ({
      id: l.id,
      sku: l.product.sku,
      name: l.product.name,
      baseUnit: l.product.baseUnit,
      locationCode: l.location?.code ?? null,
      expiryDate: l.expiryDate ? dbToDateOnly(l.expiryDate) : null,
      lotNo: l.lotNo,
      bookQty: l.bookQty,
      currentQty:
        count.status === "COUNTING"
          ? (current.get(balanceKey(l.productId, l.locationId, l.expiryDate, l.lotDate, l.lotNo)) ?? 0)
          : null,
      countedQty: l.countedQty,
      // 진행 중: 확정하면 실제로 반영될 증감 (센 시각 기준). 아직 안 셌으면 null
      expectedDelta:
        count.status === "COUNTING" && l.countedQty !== null && l.countedAt
          ? l.countedQty -
            stockAtCountTime(
              l,
              current.get(balanceKey(l.productId, l.locationId, l.expiryDate, l.lotDate, l.lotNo)) ?? 0,
              l.countedAt,
              after
            )
          : null,
      appliedDelta: l.appliedDelta,
    })),
  };
}

async function requireCounting(tx: Prisma.TransactionClient, countId: string) {
  // 공유 잠금: 확정·취소(UPDATE)가 진행 중이면 끝날 때까지 기다린 뒤 최신 상태를 읽는다
  await tx.$queryRaw`SELECT "id" FROM "CycleCount" WHERE "id" = ${countId} FOR SHARE`;
  const c = await tx.cycleCount.findUnique({ where: { id: countId }, select: { id: true, countNo: true, status: true } });
  if (!c) throw new CountError("존재하지 않는 실사표입니다.");
  if (c.status !== "COUNTING") {
    throw new CountError(`${c.countNo}은(는) 이미 ${c.status === "CONFIRMED" ? "확정" : "취소"}되어 수정할 수 없습니다.`);
  }
  return c;
}

/** 실사 수량 입력 (null = 입력 취소) */
export async function saveCount(input: { lineId: string; countedQty: number | null }, actor: CurrentUser) {
  return prisma.$transaction(async (tx) => {
    const line = await tx.cycleCountLine.findUnique({ where: { id: input.lineId }, select: { countId: true } });
    if (!line) throw new CountError("존재하지 않는 실사 줄입니다. 새로고침하세요.");
    await requireCounting(tx, line.countId);
    await tx.cycleCountLine.update({
      where: { id: input.lineId },
      data:
        input.countedQty === null
          ? { countedQty: null, countedById: null, countedAt: null }
          : { countedQty: input.countedQty, countedById: actor.id, countedAt: new Date() },
    });
  });
}

/** 발견분 추가: 실사표에 없던 재고. 같은 칸(위치·상품·유통기한, 로트 미지정) 줄이 이미 있으면 그 줄의 수량으로 입력 */
export async function addFoundLine(input: CountFoundInput, actor: CurrentUser) {
  return prisma.$transaction(async (tx) => {
    const c = await requireCounting(tx, input.countId);
    const range = await tx.cycleCount.findUniqueOrThrow({
      where: { id: c.id },
      select: { scope: true, warehouseId: true, locationPrefix: true },
    });
    const [location, bySku, byBarcode] = await Promise.all([
      tx.location.findUnique({ where: { code: input.locationCode }, select: { id: true, code: true, warehouseId: true } }),
      tx.product.findUnique({ where: { sku: input.productKey.toUpperCase() }, select: { id: true, sku: true, name: true, status: true } }),
      tx.productBarcode.findUnique({
        where: { code: input.productKey },
        select: { product: { select: { id: true, sku: true, name: true, status: true } } },
      }),
    ]);
    const product = bySku ?? byBarcode?.product ?? null;
    if (!product) throw new CountError(`상품을 찾을 수 없습니다: ${input.productKey} (상품코드 또는 등록된 바코드)`);
    if (!location) throw new CountError(`존재하지 않는 위치코드입니다: ${input.locationCode}`);
    if (!product || product.status !== "ACTIVE") throw new CountError("확정된 상품만 추가할 수 있습니다.");
    // 발견분 위치는 실사표의 범위(창고·위치코드 앞부분) 안이어야 한다 (범위 밖 칸의 재고를 덮어쓰지 않도록)
    if (
      (range.warehouseId && location.warehouseId !== range.warehouseId) ||
      (range.locationPrefix && !location.code.startsWith(range.locationPrefix))
    ) {
      throw new CountError(`${location.code}은(는) 이 실사표의 범위(${range.scope}) 밖입니다. 범위 안의 위치코드를 입력하세요.`);
    }
    const inactive = await inactiveLocationMessage(tx, location.id);
    if (inactive) throw new CountError(inactive);
    const expiry = input.expiryDate ? dateOnlyToDb(input.expiryDate) : null;
    const existing = await tx.cycleCountLine.findFirst({
      where: { countId: c.id, productId: product.id, locationId: location.id, expiryDate: expiry, lotDate: null, lotNo: null },
      select: { id: true },
    });
    const counted = { countedQty: input.countedQty, countedById: actor.id, countedAt: new Date() };
    if (existing) await tx.cycleCountLine.update({ where: { id: existing.id }, data: counted });
    else {
      await tx.cycleCountLine.create({
        data: { countId: c.id, productId: product.id, locationId: location.id, expiryDate: expiry, bookQty: 0, ...counted },
      });
    }
    return { sku: product.sku, name: product.name };
  });
}

export type ConfirmSummary = { countNo: string; adjusted: number; plus: number; minus: number; skipped: number };

/**
 * 실사 확정 (관리자): 센 줄만 반영한다. 증감 = 실사 수량 − '확정 시점'의 칸 재고
 * (실사표를 뜬 뒤 입출고가 있었어도 실제 재고에 맞춘다). 반영은 재고조정(COUNT_PLUS/MINUS) + changeStock
 */
export async function confirmCycleCount(input: { countId: string; version: number }, actor: CurrentUser): Promise<ConfirmSummary> {
  return prisma.$transaction(
    async (tx) => {
      // 상태·버전 확인과 확정 표시를 한 번에 (동시 확정·취소 차단)
      const claimed = await tx.cycleCount.updateMany({
        where: { id: input.countId, status: "COUNTING", version: input.version },
        data: { status: "CONFIRMED", confirmedById: actor.id, confirmedAt: new Date(), version: { increment: 1 } },
      });
      if (claimed.count === 0) throw new CountError("그 사이 다른 곳에서 처리되었습니다. 새로고침 후 다시 시도하세요.");
      const count = await tx.cycleCount.findUniqueOrThrow({ where: { id: input.countId }, select: { countNo: true } });

      const lines = await tx.cycleCountLine.findMany({
        where: { countId: input.countId },
        select: { id: true, productId: true, locationId: true, expiryDate: true, lotDate: true, lotNo: true, countedQty: true, countedAt: true },
        orderBy: [{ productId: "asc" }, { id: "asc" }], // 상품 순서 고정 (동시 작업과의 교착 방지)
      });
      // 칸 재고를 읽기 전에 대상 상품을 id 순으로 모두 잠근다 → 읽은 값 이후 출고·입고가 끼어들지 못함
      const productIds = [...new Set(lines.filter((l) => l.countedQty !== null).map((l) => l.productId))].sort();
      if (productIds.length > 0) {
        await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ANY(${productIds}::text[]) ORDER BY "id" FOR UPDATE`;
      }
      // 센 시각 이후의 변동은 반영 전에 한 번에 읽는다 (이 확정이 만드는 조정은 포함되지 않게)
      const counted = lines.filter((l) => l.countedQty !== null && l.countedAt);
      const after = await movementsSince(
        tx,
        productIds,
        counted.length > 0 ? new Date(Math.min(...counted.map((l) => l.countedAt!.getTime()))) : new Date()
      );
      let plus = 0;
      let minus = 0;
      let adjusted = 0;
      let skipped = 0;
      let clamped = 0;
      for (const l of lines) {
        if (l.countedQty === null) {
          skipped++;
          continue;
        }
        const cur = await tx.stockBalance.findFirst({
          where: { productId: l.productId, locationId: l.locationId, expiryDate: l.expiryDate, lotDate: l.lotDate, lotNo: l.lotNo },
          select: { quantity: true },
        });
        const have = cur?.quantity ?? 0;
        let delta = l.countedQty - stockAtCountTime(l, have, l.countedAt ?? new Date(0), after);
        // 센 뒤에 재고가 이미 줄어 지금 칸 재고보다 많이 뺄 수는 없다 (있는 만큼만)
        if (delta < -have) {
          delta = -have;
          clamped++;
        }
        await tx.cycleCountLine.update({ where: { id: l.id }, data: { appliedDelta: delta } });
        if (delta === 0) continue;
        if (delta > 0 && l.locationId) {
          const inactive = await inactiveLocationMessage(tx, l.locationId);
          if (inactive) throw new CountError(inactive);
        }
        const header = await tx.stockAdjustment.create({
          data: {
            productId: l.productId,
            reason: delta > 0 ? "COUNT_PLUS" : "COUNT_MINUS",
            quantity: delta,
            memo: `재고 실사 ${count.countNo}`,
            createdById: actor.id,
          },
        });
        await changeStock(tx, {
          productId: l.productId,
          delta,
          type: "ADJUST",
          adjustmentId: header.id,
          bucket: { locationId: l.locationId, expiryDate: l.expiryDate ? dbToDateOnly(l.expiryDate) : null },
          strict: delta < 0,
          lot: { lotDate: l.lotDate ? dbToDateOnly(l.lotDate) : null, lotNo: l.lotNo },
        });
        adjusted++;
        if (delta > 0) plus += delta;
        else minus += -delta;
      }
      await recordAudit(tx, {
        category: "STOCK",
        action: "CYCLE_COUNT_CONFIRM",
        targetId: input.countId,
        targetLabel: count.countNo,
        summary: `재고 실사 확정: ${count.countNo} (조정 ${adjusted.toLocaleString()}줄, +${plus.toLocaleString()} / -${minus.toLocaleString()}, 미실사 ${skipped.toLocaleString()}줄)`,
        detail: { adjusted, plus, minus, skipped, clamped },
      });
      return { countNo: count.countNo, adjusted, plus, minus, skipped };
    },
    { timeout: 120_000, maxWait: 10_000 }
  );
}

/** 실사 취소 (재고 변동 없음) */
export async function cancelCycleCount(input: { countId: string; version: number }) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.cycleCount.updateMany({
      where: { id: input.countId, status: "COUNTING", version: input.version },
      data: { status: "CANCELLED", version: { increment: 1 } },
    });
    if (claimed.count === 0) throw new CountError("그 사이 다른 곳에서 처리되었습니다. 새로고침 후 다시 시도하세요.");
    const count = await tx.cycleCount.findUniqueOrThrow({ where: { id: input.countId }, select: { countNo: true } });
    await recordAudit(tx, {
      category: "STOCK",
      action: "CYCLE_COUNT_CANCEL",
      targetId: input.countId,
      targetLabel: count.countNo,
      summary: `재고 실사 취소: ${count.countNo}`,
    });
    return { countNo: count.countNo };
  });
}
