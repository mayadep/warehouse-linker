import { randomUUID } from "node:crypto";
import type { Prisma, StockMovementType } from "@prisma/client";
import { dateOnlyToDb, dbToDateOnly } from "@/lib/datetime";

/** 재고 부족 (차감 후 음수가 되는 경우) */
export class InsufficientStockError extends Error {
  constructor(
    public readonly currentStock: number,
    public readonly requested: number
  ) {
    super(`재고가 부족합니다. (현재고 ${currentStock.toLocaleString()}, 필요 ${requested.toLocaleString()})`);
  }
}

/** 지정한 칸의 재고 부족 (총재고는 충분해도 그 칸이 모자란 경우) */
export class BucketStockError extends Error {
  constructor(
    public readonly locationCode: string,
    public readonly expiryDate: string | null,
    public readonly available: number,
    public readonly requested: number
  ) {
    super(
      `선택한 위치의 재고가 부족합니다. (${locationCode} · 유통기한 ${expiryDate ?? "미상"}: 현재 ${available.toLocaleString()}, 필요 ${requested.toLocaleString()})`
    );
  }
}

/** 같은 상품·거래처·수량 유사 건 확인 기간 */
export const SIMILAR_WINDOW_MS = 10 * 60 * 1000;

/** 칸: 위치(null = 미지정) × 유통기한("YYYY-MM-DD", null = 미상) */
export type StockBucket = { locationId: string | null; expiryDate: string | null };

const bucketKey = (b: StockBucket) => `${b.locationId ?? ""}|${b.expiryDate ?? ""}`;

/**
 * 자동 차감 순서: 유통기한 미상 먼저 → 유통기한 빠른 순 → 상품 기본 보관위치 먼저 → (나머지는 고정 순서)
 * 유통기한을 모르는 재고(이관된 기존 재고 등)를 먼저 소진한다
 */
function fefoCompare(defaultLocationId: string | null) {
  return (a: StockBucket, b: StockBucket) => {
    if ((a.expiryDate === null) !== (b.expiryDate === null)) return a.expiryDate === null ? -1 : 1;
    if (a.expiryDate !== b.expiryDate) return a.expiryDate! < b.expiryDate! ? -1 : 1;
    const ad = a.locationId === defaultLocationId ? 0 : 1;
    const bd = b.locationId === defaultLocationId ? 0 : 1;
    if (ad !== bd) return ad - bd;
    const ak = bucketKey(a);
    const bk = bucketKey(b);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  };
}

/** 이 입고/출고로 칸마다 순수하게 들어간(+)/나간(-) 수량. 먼저 생긴 칸 순 */
async function netByBucket(tx: Prisma.TransactionClient, where: { inboundId: string } | { outboundId: string }) {
  const rows = await tx.stockMovement.groupBy({
    by: ["locationId", "expiryDate"],
    where,
    _sum: { quantity: true },
    _min: { createdAt: true },
  });
  return rows
    .map((r) => ({
      locationId: r.locationId,
      expiryDate: r.expiryDate ? dbToDateOnly(r.expiryDate) : null,
      net: r._sum.quantity ?? 0,
      first: r._min.createdAt?.getTime() ?? 0,
    }))
    .sort((a, b) => a.first - b.first);
}

type Plan = { bucket: StockBucket; quantity: number; balanceId?: string; balanceQty?: number }[];

/**
 * 늘릴 칸 정하기
 * - 출고 취소·출고 수량 감소: 그 출고가 뺐던 칸으로 되돌림 (나중에 뺀 칸부터)
 * - 그 외: 지정한 칸 → 입고 정정이면 그 입고의 칸 → 상품 기본 보관위치(유통기한 미상)
 */
async function planIncrease(
  tx: Prisma.TransactionClient,
  product: { locationId: string | null },
  args: { delta: number; bucket?: StockBucket; inboundId?: string; outboundId?: string }
): Promise<Plan> {
  const fallback: StockBucket = args.bucket ?? { locationId: product.locationId, expiryDate: null };
  if (args.outboundId) {
    const taken = (await netByBucket(tx, { outboundId: args.outboundId }))
      .filter((b) => b.net < 0)
      .sort(fefoCompare(product.locationId))
      .reverse();
    const plan: Plan = [];
    let left = args.delta;
    for (const b of taken) {
      if (left === 0) break;
      const q = Math.min(left, -b.net);
      plan.push({ bucket: { locationId: b.locationId, expiryDate: b.expiryDate }, quantity: q });
      left -= q;
    }
    if (left > 0) plan.push({ bucket: fallback, quantity: left });
    return plan;
  }
  if (!args.bucket && args.inboundId) {
    const placed = (await netByBucket(tx, { inboundId: args.inboundId })).find((b) => b.net > 0);
    if (placed) return [{ bucket: { locationId: placed.locationId, expiryDate: placed.expiryDate }, quantity: args.delta }];
  }
  return [{ bucket: fallback, quantity: args.delta }];
}

/**
 * 뺄 칸 정하기: 지정한 칸 → (입고 취소·입고 수량 감소면) 그 입고가 넣었던 칸 → 같은 유통기한 칸(위치 이동된 재고)
 * → 자동 순서(fefoCompare)
 * 총재고는 이미 충분함이 확인된 상태(칸별 합계 == 총재고)이므로 모자라면 데이터 불일치
 */
async function planDecrease(
  tx: Prisma.TransactionClient,
  productId: string,
  product: { locationId: string | null },
  args: { delta: number; bucket?: StockBucket; strict?: boolean; inboundId?: string }
): Promise<Plan> {
  const balances = (
    await tx.stockBalance.findMany({
      where: { productId },
      select: { id: true, locationId: true, expiryDate: true, quantity: true },
    })
  ).map((b) => ({ ...b, expiryDate: b.expiryDate ? dbToDateOnly(b.expiryDate) : null }));

  const preferred: StockBucket[] = args.bucket
    ? [args.bucket]
    : args.inboundId
      ? (await netByBucket(tx, { inboundId: args.inboundId })).filter((b) => b.net > 0)
      : [];
  // 칸 지정 출고(strict): 그 칸에서만, 모자라면 거부
  if (args.strict && args.bucket) {
    const want = bucketKey(args.bucket);
    const b = balances.find((x) => bucketKey(x) === want);
    const need = -args.delta;
    if (!b || b.quantity < need) {
      const loc = args.bucket.locationId
        ? await tx.location.findUnique({ where: { id: args.bucket.locationId }, select: { code: true } })
        : null;
      throw new BucketStockError(loc?.code ?? "미지정", args.bucket.expiryDate, b?.quantity ?? 0, need);
    }
    return [{ bucket: args.bucket, quantity: args.delta, balanceId: b.id, balanceQty: b.quantity }];
  }

  const prefKeys = preferred.map(bucketKey);
  // 입고 취소 때 원래 칸에서 다른 칸으로 옮겨졌으면, 유통기한이 같은 칸이 그 재고일 가능성이 높음
  const prefExpiries = args.inboundId ? new Set(preferred.map((b) => b.expiryDate)) : new Set<string | null>();
  const rank = (b: StockBucket) => {
    const i = prefKeys.indexOf(bucketKey(b));
    if (i !== -1) return i;
    return prefExpiries.has(b.expiryDate) ? prefKeys.length : Infinity;
  };
  const ordered = [...balances].sort((a, b) => {
    const ar = rank(a);
    const br = rank(b);
    if (ar !== br) return ar - br;
    return fefoCompare(product.locationId)(a, b);
  });

  const plan: Plan = [];
  let left = -args.delta;
  for (const b of ordered) {
    if (left === 0) break;
    const q = Math.min(left, b.quantity);
    plan.push({
      bucket: { locationId: b.locationId, expiryDate: b.expiryDate },
      quantity: -q,
      balanceId: b.id,
      balanceQty: b.quantity,
    });
    left -= q;
  }
  if (left > 0) throw new Error("칸별 재고 합계가 총재고와 맞지 않습니다. 관리자에게 문의하세요.");
  return plan;
}

/** 칸 수량 반영. 늘림은 upsert(null 칸도 한 행: NULLS NOT DISTINCT), 줄임은 0이 되면 행 삭제 */
async function applyBalance(tx: Prisma.TransactionClient, productId: string, step: Plan[number]) {
  const { bucket, quantity } = step;
  if (quantity > 0) {
    await tx.$executeRaw`
      INSERT INTO "StockBalance" ("id", "productId", "locationId", "expiryDate", "quantity", "updatedAt")
      VALUES (${randomUUID()}, ${productId}, ${bucket.locationId}, ${bucket.expiryDate}::date, ${quantity}, now() AT TIME ZONE 'UTC')
      ON CONFLICT ("productId", "locationId", "expiryDate")
      DO UPDATE SET "quantity" = "StockBalance"."quantity" + EXCLUDED."quantity", "updatedAt" = EXCLUDED."updatedAt"`;
    return;
  }
  const take = -quantity;
  const r =
    step.balanceQty === take
      ? await tx.stockBalance.deleteMany({ where: { id: step.balanceId, quantity: take } })
      : await tx.stockBalance.updateMany({
          where: { id: step.balanceId, quantity: { gt: take } },
          data: { quantity: { decrement: take } },
        });
  if (r.count === 0) throw new Error("칸별 재고가 다른 곳에서 바뀌었습니다. 다시 시도하세요.");
}

/** 상품 행 잠금 (이 상품의 총재고·칸별 재고 변경을 직렬화) */
async function lockProduct(tx: Prisma.TransactionClient, productId: string) {
  await tx.$queryRaw`SELECT 1 FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
}

/**
 * 재고 증감 + 칸별 재고 + 재고 이력 기록. 반드시 호출자의 트랜잭션(tx) 안에서 실행한다.
 * - 먼저 상품 행을 잠그고(FOR UPDATE) 총재고·칸 확인을 끝낸 뒤 쓴다 → 동시 요청에도 음수 불가,
 *   오류(InsufficientStockError·BucketStockError)가 나면 아무것도 바뀌지 않은 상태
 * - 상품 행이 잠긴 상태에서 칸별 재고(StockBalance)를 바꾸므로 합계 == Product.stock 유지
 * - 칸이 여러 개로 나뉘면 칸마다 이력 1건 (movement = 첫 건, movements = 전체)
 * - 칸 지정(bucket): 늘릴 때 넣을 칸 / 줄일 때 먼저 뺄 칸(strict 면 그 칸에서만). 생략 시 planIncrease·planDecrease 규칙
 * - DB CHECK(stock >= 0, 칸 수량 > 0) 가 최종 안전장치
 */
export async function changeStock(
  tx: Prisma.TransactionClient,
  args: {
    productId: string;
    delta: number;
    type: StockMovementType;
    inboundId?: string;
    outboundId?: string;
    bucket?: StockBucket;
    /** 줄일 때 bucket 칸에서만 (모자라면 BucketStockError). 출고 위치 지정용 */
    strict?: boolean;
  }
) {
  const { productId, delta } = args;
  if (!Number.isInteger(delta) || delta === 0) throw new Error("재고 변경 수량이 올바르지 않습니다.");

  // 1) 상품 행 잠금 → 총재고·칸 확인을 모두 끝낸 뒤에 쓰기 (확인 실패 시 아무것도 바뀌지 않음)
  await lockProduct(tx, productId);
  const cur = await tx.product.findUnique({
    where: { id: productId },
    select: { stock: true, name: true, locationId: true },
  });
  if (!cur) throw new Error("존재하지 않는 상품입니다.");
  if (delta < 0 && cur.stock < -delta) throw new InsufficientStockError(cur.stock, -delta);

  // 2) 칸 배분 (지정 칸 부족 등은 여기서 거부)
  const plan = delta > 0 ? await planIncrease(tx, cur, args) : await planDecrease(tx, productId, cur, args);

  // 3) 총재고 반영. 차감은 조건부 UPDATE 로 한 번 더 막음 (DB CHECK stock >= 0 이 최종 안전장치)
  if (delta < 0) {
    const r = await tx.product.updateMany({
      where: { id: productId, stock: { gte: -delta } },
      data: { stock: { decrement: -delta } },
    });
    if (r.count === 0) throw new InsufficientStockError(cur.stock, -delta);
  } else {
    await tx.product.update({ where: { id: productId }, data: { stock: { increment: delta } } });
  }
  const p = { ...cur, stock: cur.stock + delta };

  // 4) 칸별 재고 + 이력
  let running = cur.stock;
  const movements = [];
  for (const step of plan) {
    await applyBalance(tx, productId, step);
    movements.push(
      await tx.stockMovement.create({
        data: {
          productId,
          type: args.type,
          quantity: step.quantity,
          beforeStock: running,
          afterStock: running + step.quantity,
          inboundId: args.inboundId,
          outboundId: args.outboundId,
          locationId: step.bucket.locationId,
          expiryDate: step.bucket.expiryDate ? dateOnlyToDb(step.bucket.expiryDate) : null,
        },
      })
    );
    running += step.quantity;
  }

  return { movement: movements[0], movements, afterStock: p.stock, productName: p.name };
}

export class StockBucketError extends Error {}

/**
 * 유통기한 입력·변경: 한 칸(위치·유통기한)의 재고 일부/전부를 다른 유통기한으로 옮김. 총재고 불변.
 * 이력은 EXPIRY_CHANGE -n / +n 한 쌍 (before/afterStock 은 총재고 그대로)
 */
export async function changeStockExpiry(
  tx: Prisma.TransactionClient,
  args: { productId: string; from: StockBucket; toExpiryDate: string | null; quantity: number }
) {
  if (args.from.expiryDate === args.toExpiryDate) throw new StockBucketError("현재 유통기한과 같습니다.");
  return transferBucket(tx, {
    productId: args.productId,
    from: args.from,
    to: { locationId: args.from.locationId, expiryDate: args.toExpiryDate },
    quantity: args.quantity,
    type: "EXPIRY_CHANGE",
  });
}

/**
 * 위치 이동: 한 칸의 재고 일부/전부를 다른 위치로 옮김 (유통기한은 그대로). 총재고 불변.
 * 이력은 MOVE -n(원래 칸) / +n(새 칸) 한 쌍
 */
export async function moveStock(
  tx: Prisma.TransactionClient,
  args: { productId: string; from: StockBucket; toLocationId: string; quantity: number }
) {
  if (args.from.locationId === args.toLocationId) throw new StockBucketError("현재 위치와 같은 칸으로는 옮길 수 없습니다.");
  return transferBucket(tx, {
    productId: args.productId,
    from: args.from,
    to: { locationId: args.toLocationId, expiryDate: args.from.expiryDate },
    quantity: args.quantity,
    type: "MOVE",
  });
}

/** 칸 → 칸 옮기기 (유통기한 변경·위치 이동 공통). 상품 행 잠금 후 원래 칸 수량 확인 */
async function transferBucket(
  tx: Prisma.TransactionClient,
  args: { productId: string; from: StockBucket; to: StockBucket; quantity: number; type: "EXPIRY_CHANGE" | "MOVE" }
) {
  const { productId, from, to, quantity } = args;
  await lockProduct(tx, productId);
  const p = await tx.product.findUnique({ where: { id: productId }, select: { stock: true, name: true } });
  if (!p) throw new StockBucketError("존재하지 않는 상품입니다.");

  const bal = await tx.stockBalance.findFirst({
    where: {
      productId,
      locationId: from.locationId,
      expiryDate: from.expiryDate ? dateOnlyToDb(from.expiryDate) : null,
    },
    select: { id: true, quantity: true },
  });
  if (!bal) throw new StockBucketError("해당 칸의 재고가 없습니다. 새로고침 후 다시 시도하세요.");
  if (bal.quantity < quantity) {
    throw new StockBucketError(
      `칸의 재고보다 많이 ${args.type === "MOVE" ? "옮길" : "바꿀"} 수 없습니다. (칸 재고 ${bal.quantity.toLocaleString()}, 요청 ${quantity.toLocaleString()})`
    );
  }

  const steps: Plan = [
    { bucket: from, quantity: -quantity, balanceId: bal.id, balanceQty: bal.quantity },
    { bucket: to, quantity },
  ];
  for (const step of steps) {
    await applyBalance(tx, productId, step);
    await tx.stockMovement.create({
      data: {
        productId,
        type: args.type,
        quantity: step.quantity,
        beforeStock: p.stock,
        afterStock: p.stock,
        locationId: step.bucket.locationId,
        expiryDate: step.bucket.expiryDate ? dateOnlyToDb(step.bucket.expiryDate) : null,
      },
    });
  }
  return { productName: p.name };
}

/** unique 제약 위반(P2002)이 특정 컬럼 때문인지 */
export function isUniqueViolation(e: unknown, field: string): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { code?: string; meta?: { target?: unknown } };
  if (err.code !== "P2002") return false;
  const t = err.meta?.target;
  return Array.isArray(t) ? t.includes(field) : typeof t === "string" ? t.includes(field) : true;
}
