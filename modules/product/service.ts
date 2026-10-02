import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ProductInput } from "./validation";
import { recordAudit } from "@/modules/audit/service";
import type { CurrentUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";

export class DuplicateSkuError extends Error {
  constructor(sku: string) {
    super(`이미 등록된 품목코드입니다: ${sku}`);
  }
}

export class ProductError extends Error {}

/**
 * 상품 등록. 재고는 항상 0으로 시작한다 (재고 변경은 입고/출고 이력을 통해서만).
 * - 관리자: 바로 확정(ACTIVE)
 * - 직원: 확정 대기(PENDING), 판매가는 받지 않음(0) → 관리자가 확정할 때 입력
 */
export async function createProduct(input: ProductInput, actor: CurrentUser) {
  const confirmed = can(actor.role, "product.confirm");
  try {
    return await prisma.$transaction(async (tx) => {
      const now = new Date();
      const p = await tx.product.create({
        data: {
          sku: input.sku,
          name: input.name,
          category: input.category,
          price: confirmed ? input.price : 0,
          stock: 0,
          safetyStock: input.safetyStock,
          baseUnit: input.baseUnit,
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
          boxQty: p.boxQty,
          safetyStock: p.safetyStock,
          status: confirmed ? "확정" : "확정 대기",
        },
      });
      return { ...p, confirmed };
    });
  } catch (e) {
    // sku unique 제약 위반 (동시 등록 포함)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DuplicateSkuError(input.sku);
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

export async function listProducts(keyword?: string) {
  const k = keyword?.trim();
  return prisma.product.findMany({
    where: k
      ? {
          OR: [
            { sku: { contains: k, mode: "insensitive" } },
            { name: { contains: k, mode: "insensitive" } },
            { category: { contains: k, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      price: true,
      stock: true,
      baseUnit: true,
      boxQty: true,
      trackExpiry: true,
      status: true,
      createdBy: { select: { name: true } },
    },
    // 확정 대기 상품을 먼저
    orderBy: [{ status: "asc" }, { createdAt: "desc" }, { sku: "asc" }],
  });
}

export async function listCategories() {
  const rows = await prisma.product.findMany({
    distinct: ["category"],
    select: { category: true },
    orderBy: { category: "asc" },
  });
  return rows.map((r) => r.category);
}
