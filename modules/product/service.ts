import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ProductInput } from "./validation";

export class DuplicateSkuError extends Error {
  constructor(sku: string) {
    super(`이미 등록된 품목코드입니다: ${sku}`);
  }
}

/**
 * 상품 등록. 재고는 항상 0으로 시작한다 (재고 변경은 입고/출고 이력을 통해서만).
 */
export async function createProduct(input: ProductInput) {
  try {
    return await prisma.product.create({
      data: {
        sku: input.sku,
        name: input.name,
        category: input.category,
        price: input.price,
        stock: 0,
        baseUnit: input.baseUnit,
        boxQty: input.baseUnit === "BOX" ? 1 : input.boxQty,
        trackExpiry: input.trackExpiry,
      },
    });
  } catch (e) {
    // sku unique 제약 위반 (동시 등록 포함)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new DuplicateSkuError(input.sku);
    }
    throw e;
  }
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
    },
    orderBy: [{ createdAt: "desc" }, { sku: "asc" }],
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
