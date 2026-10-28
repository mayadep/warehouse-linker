"use server";

// 현장(모바일) 재고 조회: 바코드·상품코드·품명·위치코드 하나로 조회
import { prisma } from "@/lib/prisma";
import { dbToDateOnly } from "@/lib/datetime";
import { authorize, NO_PERMISSION_MESSAGE } from "@/modules/user/auth";

export type LookupBalance = {
  locationCode: string | null;
  expiryDate: string | null;
  lotNo: string | null;
  quantity: number;
};

export type LookupProduct = {
  sku: string;
  name: string;
  baseUnit: string;
  stock: number;
  boxQty: number;
  safetyStock: number;
  defaultLocation: string | null;
  balances: LookupBalance[];
};

export type LookupResult =
  | { ok: true; kind: "product" | "location"; title: string; products: LookupProduct[]; more: boolean }
  | { ok: false; message: string };

const MAX_PRODUCTS = 10;

const productSelect = {
  id: true,
  sku: true,
  name: true,
  baseUnit: true,
  stock: true,
  boxQty: true,
  safetyStock: true,
  location: { select: { code: true } },
} as const;

/** 입력값 판별: 위치코드 정확 일치 → 바코드 정확 일치 → 상품코드 → 품명·코드 부분 일치 */
export async function mobileLookupAction(raw: string): Promise<LookupResult> {
  const user = await authorize("stock.view");
  if (!user) return { ok: false, message: NO_PERMISSION_MESSAGE };
  const q = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 50) : "";
  if (!q) return { ok: false, message: "바코드, 상품코드, 품명, 위치코드 중 하나를 입력하거나 스캔하세요." };

  const compact = q.replace(/\s+/g, "");
  const location = await prisma.location.findUnique({ where: { code: compact.toUpperCase() }, select: { id: true, code: true } });

  let products: { id: string; sku: string; name: string; baseUnit: string; stock: number; boxQty: number; safetyStock: number; location: { code: string } | null }[];
  let kind: "product" | "location" = "product";
  let title = q;
  let more = false;

  if (location) {
    kind = "location";
    title = `위치 ${location.code}`;
    const onLocation = await prisma.stockBalance.findMany({
      where: { locationId: location.id },
      select: { productId: true },
      distinct: ["productId"],
      take: MAX_PRODUCTS + 1,
    });
    more = onLocation.length > MAX_PRODUCTS;
    products = await prisma.product.findMany({
      where: { id: { in: onLocation.slice(0, MAX_PRODUCTS).map((b) => b.productId) } },
      select: productSelect,
      orderBy: { sku: "asc" },
    });
  } else {
    const byBarcode = await prisma.productBarcode.findUnique({ where: { code: compact }, select: { product: { select: { ...productSelect, status: true } } } });
    if (byBarcode && byBarcode.product.status === "ACTIVE") {
      products = [byBarcode.product];
      title = `[${byBarcode.product.sku}] ${byBarcode.product.name}`;
    } else {
      const found = await prisma.product.findMany({
        where: {
          status: "ACTIVE",
          OR: [{ sku: { equals: compact, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }],
        },
        select: productSelect,
        orderBy: { sku: "asc" },
        take: MAX_PRODUCTS + 1,
      });
      more = found.length > MAX_PRODUCTS;
      products = found.slice(0, MAX_PRODUCTS);
    }
  }
  if (products.length === 0) {
    return { ok: false, message: `"${q}"에 해당하는 상품·위치를 찾을 수 없습니다. 코드를 다시 확인하세요.` };
  }

  const balances = await prisma.stockBalance.findMany({
    where: { productId: { in: products.map((p) => p.id) }, ...(location ? { locationId: location.id } : {}) },
    select: { productId: true, quantity: true, expiryDate: true, lotNo: true, location: { select: { code: true } } },
    orderBy: [{ expiryDate: "asc" }, { location: { code: "asc" } }],
  });
  const byProduct = new Map<string, LookupBalance[]>();
  for (const b of balances) {
    const list = byProduct.get(b.productId) ?? [];
    list.push({
      locationCode: b.location?.code ?? null,
      expiryDate: b.expiryDate ? dbToDateOnly(b.expiryDate) : null,
      lotNo: b.lotNo,
      quantity: b.quantity,
    });
    byProduct.set(b.productId, list);
  }

  return {
    ok: true,
    kind,
    title,
    more,
    products: products.map((p) => ({
      sku: p.sku,
      name: p.name,
      baseUnit: p.baseUnit,
      stock: p.stock,
      boxQty: p.boxQty,
      safetyStock: p.safetyStock,
      defaultLocation: p.location?.code ?? null,
      balances: byProduct.get(p.id) ?? [],
    })),
  };
}
