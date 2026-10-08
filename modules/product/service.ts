import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { productVersion, type ProductInput, type ProductUpdateInput } from "./validation";
import { recordAudit } from "@/modules/audit/service";
import type { CurrentUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { STORAGE_TEMP_LABELS, type StorageTempCode } from "./storage";

export class DuplicateSkuError extends Error {
  constructor(sku: string) {
    super(`이미 등록된 품목코드입니다: ${sku}`);
  }
}

export class ProductError extends Error {}

/**
 * 박스 수 → 기본단위 수량 환산 (박스당 입수는 서버의 상품 정보로 계산).
 * 입고·출고 등록에서 사용하며 재고는 항상 기본단위로만 저장한다.
 */
export async function convertBoxesToBase(
  productId: string,
  boxes: number,
  max: number,
  verb: "입고" | "출고",
): Promise<{ ok: true; quantity: number; boxQty: number; unit: string } | { ok: false; message: string }> {
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { baseUnit: true, boxQty: true } });
  if (!p) return { ok: false, message: "존재하지 않는 상품입니다." };
  const quantity = boxes * p.boxQty;
  if (quantity > max) {
    return { ok: false, message: `한 번에 ${max.toLocaleString()}${p.baseUnit}까지 ${verb}할 수 있습니다. (${boxes.toLocaleString()}박스 × ${p.boxQty.toLocaleString()} = ${quantity.toLocaleString()}${p.baseUnit})` };
  }
  return { ok: true, quantity, boxQty: p.boxQty, unit: p.baseUnit };
}

/**
 * 상품 등록. 재고는 항상 0으로 시작한다 (재고 변경은 입고/출고 이력을 통해서만).
 * - 관리자: 바로 확정(ACTIVE)
 * - 직원: 확정 대기(PENDING), 판매가는 받지 않음(0) → 관리자가 확정할 때 입력
 */
export async function createProduct(input: ProductInput, actor: CurrentUser) {
  const confirmed = can(actor.role, "product.confirm");
  let sku = "";
  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      // 품목코드 자동 채번: P-000001 (DB 시퀀스라 동시 등록에도 중복되지 않음)
      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('product_sku_seq') AS n`;
      sku = `P-${n.toString().padStart(6, "0")}`;
      const p = await tx.product.create({
        data: {
          sku,
          name: input.name,
          category: input.category,
          price: confirmed ? input.price : 0,
          stock: 0,
          safetyStock: input.safetyStock,
          baseUnit: input.baseUnit,
          storageTemp: input.storageTemp,
          boxQty: input.baseUnit === "BOX" ? 1 : input.boxQty,
          trackExpiry: input.trackExpiry,
          status: confirmed ? "ACTIVE" : "PENDING",
          createdById: actor.id,
          confirmedById: confirmed ? actor.id : null,
          confirmedAt: confirmed ? now : null,
        },
      });
      await recordAudit(tx, {
        category: "PRODUCT",
        action: "PRODUCT_CREATE",
        targetId: p.id,
        targetLabel: `[${p.sku}] ${p.name}`,
        summary: `상품 등록${confirmed ? "" : "(확정 대기)"}: [${p.sku}] ${p.name}`,
        detail: {
          sku: p.sku,
          name: p.name,
          category: p.category,
          ...(confirmed ? { price: p.price } : {}),
          baseUnit: p.baseUnit,
          storageTemp: STORAGE_TEMP_LABELS[p.storageTemp],
          boxQty: p.boxQty,
          safetyStock: p.safetyStock,
          status: confirmed ? "확정" : "확정 대기",
        },
      });
      return { ...p, confirmed };
    });
  } catch (e) {
    // sku unique 제약 위반 (예전에 수동 입력한 코드와 채번 코드가 겹치는 경우)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DuplicateSkuError(sku);
    }
    throw e;
  }
}

/** 대기 상품 행 잠금 후 조회 (확정·반려 공통) */
async function lockPending(tx: Prisma.TransactionClient, productId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
  if (rows.length === 0) throw new ProductError("존재하지 않는 상품입니다.");
  const p = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    select: { id: true, sku: true, name: true, status: true, createdBy: { select: { name: true, loginId: true } } },
  });
  if (p.status !== "PENDING") throw new ProductError(`[${p.sku}] ${p.name}은(는) 이미 확정된 상품입니다.`);
  return p;
}

/** 상품 등록 확정 (관리자): 판매가 입력 + ACTIVE */
export async function confirmProduct(input: { productId: string; price: number }, actor: CurrentUser) {
  return prisma.$transaction(async (tx) => {
    const p = await lockPending(tx, input.productId);
    await tx.product.update({
      where: { id: p.id },
      data: { status: "ACTIVE", price: input.price, confirmedById: actor.id, confirmedAt: new Date() },
    });
    await recordAudit(tx, {
      category: "PRODUCT",
      action: "PRODUCT_CONFIRM",
      targetId: p.id,
      targetLabel: `[${p.sku}] ${p.name}`,
      summary: `상품 등록 확정: [${p.sku}] ${p.name} (판매가 ${input.price.toLocaleString()}원)`,
      detail: {
        price: input.price,
        status: "확정",
        ...(p.createdBy ? { createdBy: `${p.createdBy.name}(${p.createdBy.loginId})` } : {}),
      },
    });
    return { sku: p.sku, name: p.name };
  });
}

/** 상품 등록 반려 (관리자): 대기 상품만 삭제. 대기 상품은 입출고·주문·위치에 쓰일 수 없으므로 연결 데이터가 없다 */
export async function rejectProduct(input: { productId: string; reason: string }) {
  return prisma.$transaction(async (tx) => {
    const p = await lockPending(tx, input.productId);
    await tx.product.delete({ where: { id: p.id } });
    await recordAudit(tx, {
      category: "PRODUCT",
      action: "PRODUCT_REJECT",
      targetId: p.id,
      targetLabel: `[${p.sku}] ${p.name}`,
      summary: `상품 등록 반려(삭제): [${p.sku}] ${p.name} — ${input.reason}`,
      detail: {
        reason: input.reason,
        ...(p.createdBy ? { createdBy: `${p.createdBy.name}(${p.createdBy.loginId})` } : {}),
      },
    });
    return { sku: p.sku, name: p.name };
  });
}

/** 상품 행 잠금 후 조회 (수정·비활성화 공통). 보관위치 변경과 같은 잠금 순서(advisory → 상품 행) */
async function lockProduct(tx: Prisma.TransactionClient, productId: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('assign-product-locations'))`;
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
  if (rows.length === 0) throw new ProductError("존재하지 않는 상품입니다.");
  return tx.product.findUniqueOrThrow({
    where: { id: productId },
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      storageTemp: true,
      price: true,
      boxQty: true,
      baseUnit: true,
      safetyStock: true,
      stock: true,
      status: true,
      locationId: true,
      location: { select: { code: true } },
    },
  });
}

/**
 * 상품 수정 (관리자): 품명·분류·판매가·박스당 입수·안전재고.
 * 품목코드·기본단위·유통기한 관리는 이력의 의미가 바뀌므로 수정하지 않는다.
 * 확정 대기 상품은 판매가를 바꾸지 않는다(확정 시 입력).
 */
export async function updateProduct(input: ProductUpdateInput & { hasBoxQty: boolean }) {
  return prisma.$transaction(async (tx) => {
    const cur = await lockProduct(tx, input.productId);
    if (cur.status === "INACTIVE") throw new ProductError(`[${cur.sku}] ${cur.name}은(는) 비활성 상품입니다. 다시 사용으로 바꾼 뒤 수정하세요.`);
    if (productVersion(cur) !== input.version) {
      throw new ProductError(`[${cur.sku}] ${cur.name}이(가) 그 사이 다른 곳에서 수정되었습니다. 새로고침 후 다시 시도하세요.`);
    }
    const next = {
      name: input.name,
      category: input.category,
      storageTemp: input.storageTemp,
      price: cur.status === "PENDING" ? cur.price : input.price,
      boxQty: cur.baseUnit === "BOX" ? 1 : input.hasBoxQty ? input.boxQty : cur.boxQty,
      safetyStock: input.safetyStock,
    };
    const labels = { name: "품명", category: "분류", storageTemp: "보관 온도", price: "판매가", boxQty: "박스당 입수", safetyStock: "안전재고" } as const;
    const display = (k: keyof typeof labels, v: string | number) => (k === "storageTemp" ? STORAGE_TEMP_LABELS[v as StorageTempCode] : v);
    const changes: Record<string, { from: string | number; to: string | number }> = {};
    for (const k of Object.keys(labels) as (keyof typeof labels)[]) {
      if (cur[k] !== next[k]) changes[labels[k]] = { from: display(k, cur[k]), to: display(k, next[k]) };
    }
    if (Object.keys(changes).length === 0) throw new ProductError("변경된 내용이 없습니다.");

    await tx.product.update({ where: { id: cur.id }, data: next });
    const summaryChanges = Object.entries(changes)
      .map(([k, c]) => `${k} ${c.from.toLocaleString()} → ${c.to.toLocaleString()}`)
      .join(", ");
    await recordAudit(tx, {
      category: "PRODUCT",
      action: "PRODUCT_UPDATE",
      targetId: cur.id,
      targetLabel: `[${cur.sku}] ${cur.name}`,
      summary: `상품 수정: [${cur.sku}] ${cur.name} (${summaryChanges})`,
      detail: changes,
    });
    return { sku: cur.sku, name: next.name };
  });
}

/** 비활성화를 막는 항목: 재고·대기 입출고·진행 중 주문 (없으면 빈 배열) */
async function findProductBlockers(tx: Prisma.TransactionClient, p: { id: string; stock: number }): Promise<string[]> {
  const [inbounds, outbounds, lines] = await Promise.all([
    tx.inbound.count({ where: { productId: p.id, status: "PENDING" } }),
    tx.outbound.count({ where: { productId: p.id, status: "PENDING" } }),
    tx.tradeOrderLine.findMany({
      where: { productId: p.id, order: { status: { in: ["OPEN", "PARTIAL"] } } },
      select: { quantity: true, processedQty: true, order: { select: { orderNo: true } } },
    }),
  ]);
  const openLines = lines.filter((l) => l.processedQty < l.quantity);
  const out: string[] = [];
  if (p.stock > 0) out.push(`재고가 남아 있습니다 (현재고 ${p.stock.toLocaleString()}). 출고 후 비활성화하세요.`);
  if (inbounds > 0) out.push(`확정 대기 입고가 ${inbounds.toLocaleString()}건 있습니다. 확정하거나 삭제하세요.`);
  if (outbounds > 0) out.push(`확정 대기 출고가 ${outbounds.toLocaleString()}건 있습니다. 확정하거나 삭제하세요.`);
  if (openLines.length > 0) {
    const nos = openLines.map((l) => l.order.orderNo).slice(0, 3).join(", ");
    out.push(`진행 중인 발주·수주에 포함되어 있습니다 (${nos}${openLines.length > 3 ? " 외" : ""}). 종결하거나 취소하세요.`);
  }
  return out;
}

/**
 * 상품 비활성화(단종) / 다시 사용 (관리자)
 * - 비활성화: 재고 0, 대기 입출고·진행 중 주문 없음. 기본 보관위치는 비워 칸을 돌려준다(이력 기록). 입출고·재고 이력은 그대로.
 * - 확정 대기 상품은 대상이 아님(반려 사용). 이미 그 상태면 거부(연타·동시 처리)
 */
export async function setProductActive(productId: string, active: boolean) {
  return prisma.$transaction(async (tx) => {
    const p = await lockProduct(tx, productId);
    const label = `[${p.sku}] ${p.name}`;
    if (p.status === "PENDING") throw new ProductError(`${label}은(는) 확정 대기 상품입니다. 확정 또는 반려로 처리하세요.`);
    const target = active ? "ACTIVE" : "INACTIVE";
    if (p.status === target) {
      throw new ProductError(`${label}은(는) 이미 ${active ? "사용 중" : "비활성"}입니다. 새로고침 후 확인하세요.`);
    }
    if (!active) {
      const blockers = await findProductBlockers(tx, p);
      if (blockers.length > 0) throw new ProductError(`${label} 비활성화 불가: ${blockers.join(" / ")}`);
    }
    const releaseLocation = !active && p.locationId !== null;
    await tx.product.update({
      where: { id: p.id },
      data: { status: target, ...(releaseLocation ? { locationId: null } : {}) },
    });
    if (releaseLocation) {
      await tx.productLocationHistory.create({
        data: { productId: p.id, fromCode: p.location?.code ?? null, toCode: null, reason: "상품 비활성화" },
      });
    }
    await recordAudit(tx, {
      category: "PRODUCT",
      action: active ? "PRODUCT_ACTIVE" : "PRODUCT_INACTIVE",
      targetId: p.id,
      targetLabel: label,
      summary: `상품 ${active ? "다시 사용" : "비활성화"}: ${label}${releaseLocation ? ` (보관위치 ${p.location?.code} 해제)` : ""}`,
    });
    return { sku: p.sku, name: p.name };
  });
}

/** 입출고 화면 상품 선택: 서버 검색 결과 최대 개수 */
export const PRODUCT_SEARCH_LIMIT = 20;

/** 검색어 정리 (문자열이 아니면 빈 값, 앞뒤 공백 제거, 50자까지) */
export function normalizeProductKeyword(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, 50) : "";
}

/** 입출고에 쓸 수 있는 상품(확정 상태)만, 코드·품명·분류 부분일치 (대소문자 무시) */
export function activeProductSearchWhere(keyword?: string): Prisma.ProductWhereInput {
  const k = keyword?.trim();
  return {
    status: "ACTIVE",
    ...(k
      ? {
          OR: [
            { sku: { contains: k, mode: "insensitive" } },
            { name: { contains: k, mode: "insensitive" } },
            { category: { contains: k, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export const PRODUCT_PAGE_SIZE = 30;

/** 상품등록 목록: 검색 조건에 맞는 상품을 PRODUCT_PAGE_SIZE 개씩. 범위를 벗어난 page 는 마지막 페이지로 맞춘다 */
export async function listProducts(keyword?: string, includeInactive = false, page = 1) {
  const k = keyword?.trim();
  const where: Prisma.ProductWhereInput = {
    ...(includeInactive ? {} : { status: { not: "INACTIVE" } }),
    ...(k
      ? {
          OR: [
            { sku: { contains: k, mode: "insensitive" } },
            { name: { contains: k, mode: "insensitive" } },
            { category: { contains: k, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, pendingCount] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.count({ where: { ...where, status: "PENDING" } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), totalPages);
  const rows = await prisma.product.findMany({
    where,
    skip: (current - 1) * PRODUCT_PAGE_SIZE,
    take: PRODUCT_PAGE_SIZE,
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      price: true,
      stock: true,
      baseUnit: true,
      storageTemp: true,
      boxQty: true,
      safetyStock: true,
      trackExpiry: true,
      status: true,
      createdBy: { select: { name: true } },
    },
    // 확정 대기 상품을 먼저
    orderBy: [{ status: "asc" }, { createdAt: "desc" }, { sku: "asc" }, { id: "asc" }],
  });
  return { rows, total, pendingCount, page: current, totalPages };
}

export async function listCategories() {
  const rows = await prisma.product.findMany({
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category);
}
