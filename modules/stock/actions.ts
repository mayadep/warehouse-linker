"use server";

import { revalidatePath } from "next/cache";
import { INT_RE, UUID_RE, parseOptionalDate, parseRequestId, text } from "@/lib/form";
import { dbToDateOnly } from "@/lib/datetime";
import { prisma } from "@/lib/prisma";
import { getStockLedger, listProductBalances } from "./queries";
import {
  BucketStockError,
  InsufficientStockError,
  changeStock,
  changeStockExpiry,
  isUniqueViolation,
  moveStock,
  StockBucketError,
} from "./service";
import { ADJUST_MEMO_MAX, ADJUST_REASONS, ADJUST_REASON_LABELS } from "./codes";
import { LOCATION_CODE_RE } from "@/modules/warehouse/codes";
import { getLocationHistory } from "@/modules/warehouse/location";
import { storageMismatchWarning } from "@/modules/warehouse/assign";
import { inactiveLocationMessage } from "@/modules/warehouse/active";
import { recordAudit } from "@/modules/audit/service";
import { authorize, NO_PERMISSION_MESSAGE } from "@/modules/user/auth";

const MAX_SAFETY_STOCK = 1_000_000;

export type SafetyStockActionState = {
  status: "idle" | "success" | "error";
  message: string;
  ts?: number;
};

/** 안전재고 변경 (재고 수량 자체는 변경하지 않음) */
export async function updateSafetyStockAction(
  _prev: SafetyStockActionState,
  fd: FormData
): Promise<SafetyStockActionState> {
  if (!(await authorize("admin"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const productId = text(fd, "productId");
  const raw = text(fd, "safetyStock").replaceAll(",", "");
  if (!UUID_RE.test(productId)) return { status: "error", message: "잘못된 상품입니다.", ts: Date.now() };
  if (!INT_RE.test(raw)) return { status: "error", message: "안전재고는 0 이상의 정수여야 합니다.", ts: Date.now() };
  const safetyStock = Number(raw);
  if (safetyStock > MAX_SAFETY_STOCK)
    return { status: "error", message: `안전재고는 ${MAX_SAFETY_STOCK.toLocaleString()} 이하여야 합니다.`, ts: Date.now() };

  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ sku: string; name: string; safetyStock: number }[]>`
      SELECT "sku", "name", "safetyStock" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`;
    const p = rows[0];
    if (!p) return "notFound" as const;
    if (p.safetyStock === safetyStock) return "same" as const;
    await tx.product.update({ where: { id: productId }, data: { safetyStock } });
    await recordAudit(tx, {
      category: "STOCK",
      action: "SAFETY_STOCK_UPDATE",
      targetId: productId,
      targetLabel: `[${p.sku}] ${p.name}`,
      summary: `${p.name} 안전재고 ${p.safetyStock.toLocaleString()} → ${safetyStock.toLocaleString()}`,
      detail: { before: { safetyStock: p.safetyStock }, after: { safetyStock } },
    });
    return "done" as const;
  });
  if (result === "notFound") return { status: "error", message: "존재하지 않는 상품입니다.", ts: Date.now() };

  revalidatePath("/stock");
  return { status: "success", message: `안전재고를 ${safetyStock.toLocaleString()}(으)로 저장했습니다.`, ts: Date.now() };
}

/**
 * 유통기한 입력·변경 (관리자): 한 칸의 재고 일부/전부에 유통기한을 지정. 총재고는 그대로
 * 폼: productId, locationId(""=미지정), fromExpiry(""=미상), toExpiry(필수), quantity
 */
export async function changeStockExpiryAction(
  _prev: SafetyStockActionState,
  fd: FormData
): Promise<SafetyStockActionState> {
  const fail = (message: string) => ({ status: "error" as const, message, ts: Date.now() });
  if (!(await authorize("admin"))) return fail(NO_PERMISSION_MESSAGE);

  const productId = text(fd, "productId");
  const locationId = text(fd, "locationId") || null;
  if (!UUID_RE.test(productId) || (locationId && !UUID_RE.test(locationId))) return fail("잘못된 요청입니다.");
  const from = parseOptionalDate(fd, "fromExpiry", "현재 유통기한");
  const to = parseOptionalDate(fd, "toExpiry", "유통기한");
  if (from.error) return fail("잘못된 요청입니다.");
  if (to.error) return fail(to.error);
  if (!to.value) return fail("유통기한을 입력하세요.");
  const rawQty = text(fd, "quantity").replaceAll(",", "");
  if (!INT_RE.test(rawQty) || Number(rawQty) < 1) return fail("수량은 1 이상의 정수여야 합니다.");
  const quantity = Number(rawQty);
  if (quantity > MAX_SAFETY_STOCK) return fail("수량이 너무 큽니다.");
  const toExpiry = to.value;

  try {
    await prisma.$transaction(async (tx) => {
      const r = await changeStockExpiry(tx, {
        productId,
        from: { locationId, expiryDate: from.value },
        toExpiryDate: toExpiry,
        quantity,
      });
      const loc = locationId
        ? await tx.location.findUnique({ where: { id: locationId }, select: { code: true } })
        : null;
      const where = loc?.code ?? "미지정 위치";
      await recordAudit(tx, {
        category: "STOCK",
        action: "STOCK_EXPIRY_CHANGE",
        targetId: productId,
        targetLabel: r.productName,
        summary: `${r.productName} ${where} ${quantity.toLocaleString()}개 유통기한 ${from.value ?? "미상"} → ${toExpiry}`,
        detail: { location: where, quantity, before: { expiryDate: from.value ?? "미상" }, after: { expiryDate: toExpiry } },
      });
    });
  } catch (e) {
    if (e instanceof StockBucketError) return fail(e.message);
    console.error("[stock] expiry change failed", e);
    return fail("처리 중 오류가 발생했습니다. 다시 시도하세요.");
  }

  revalidatePath("/stock");
  return { status: "success", message: `${quantity.toLocaleString()}개의 유통기한을 ${toExpiry}(으)로 저장했습니다.`, ts: Date.now() };
}

/**
 * 재고조정 (관리자): 폐기·파손·분실·실사 차이 등 입출고 외 재고 증감. 한 칸(위치·유통기한) 기준
 * 폼: requestId, productId, locationId(""=미지정) 또는 locationCode(없는 칸을 새로 지정), expiryDate(""=미상),
 *     reason, quantity(1 이상), memo(선택, 기타는 필수)
 * 감소는 그 칸에서만 차감(모자라면 거부), 증가는 그 칸에 입고일 미상으로 추가
 */
export async function adjustStockAction(
  _prev: SafetyStockActionState,
  fd: FormData
): Promise<SafetyStockActionState> {
  const fail = (message: string) => ({ status: "error" as const, message, ts: Date.now() });
  const user = await authorize("admin");
  if (!user) return fail(NO_PERMISSION_MESSAGE);

  const requestId = parseRequestId(fd);
  if (requestId.error) return fail(requestId.error);
  const productId = text(fd, "productId");
  let locationId = text(fd, "locationId") || null;
  const locationCode = text(fd, "locationCode").toUpperCase();
  if (!UUID_RE.test(productId) || (locationId && !UUID_RE.test(locationId))) return fail("잘못된 요청입니다.");
  if (!locationId && locationCode && !LOCATION_CODE_RE.test(locationCode))
    return fail("위치코드 형식이 올바르지 않습니다. (예: RF1-R01-2-3)");
  const expiry = parseOptionalDate(fd, "expiryDate", "유통기한");
  if (expiry.error) return fail("잘못된 요청입니다.");
  const reason = ADJUST_REASONS.find((r) => r.value === text(fd, "reason"));
  if (!reason) return fail("조정 사유를 선택하세요.");
  const rawQty = text(fd, "quantity").replaceAll(",", "");
  if (!INT_RE.test(rawQty) || Number(rawQty) < 1) return fail("수량은 1 이상의 정수여야 합니다.");
  const quantity = Number(rawQty);
  if (quantity > MAX_SAFETY_STOCK) return fail("수량이 너무 큽니다.");
  const memo = text(fd, "memo").trim();
  if (memo.length > ADJUST_MEMO_MAX) return fail(`메모는 ${ADJUST_MEMO_MAX}자 이하여야 합니다.`);
  if ((reason.value === "OTHER_MINUS" || reason.value === "OTHER_PLUS") && !memo)
    return fail("기타 사유는 메모를 입력하세요.");
  const delta = reason.sign * quantity;

  try {
    const duplicated = await prisma.$transaction(async (tx) => {
      if (await tx.stockAdjustment.findUnique({ where: { requestId: requestId.value }, select: { id: true } }))
        return true;
      if (!locationId && locationCode) {
        const to = await tx.location.findUnique({ where: { code: locationCode }, select: { id: true } });
        if (!to) throw new StockBucketError(`존재하지 않는 위치코드입니다: ${locationCode}`);
        const inactive = delta > 0 ? await inactiveLocationMessage(tx, to.id) : null;
        if (inactive) throw new StockBucketError(inactive);
        locationId = to.id;
      }
      const header = await tx.stockAdjustment.create({
        data: {
          requestId: requestId.value,
          productId,
          reason: reason.value,
          quantity: delta,
          memo: memo || null,
          createdById: user.id,
        },
      });
      const r = await changeStock(tx, {
        productId,
        delta,
        type: "ADJUST",
        adjustmentId: header.id,
        bucket: { locationId, expiryDate: expiry.value },
        strict: delta < 0,
      });
      const loc = locationId
        ? await tx.location.findUnique({ where: { id: locationId }, select: { code: true } })
        : null;
      const where = loc?.code ?? "미지정 위치";
      await recordAudit(tx, {
        category: "STOCK",
        action: "STOCK_ADJUST",
        targetId: productId,
        targetLabel: r.productName,
        summary: `${r.productName} ${where} ${ADJUST_REASON_LABELS[reason.value]} ${delta > 0 ? "+" : "-"}${quantity.toLocaleString()}개`,
        detail: {
          reason: ADJUST_REASON_LABELS[reason.value],
          quantity: delta,
          location: where,
          expiryDate: expiry.value ?? "미상",
          memo: memo || null,
          after: { stock: r.afterStock },
        },
      });
      return false;
    });
    if (duplicated) {
      revalidatePath("/stock");
      return { status: "success", message: "이미 처리된 요청입니다.", ts: Date.now() };
    }
  } catch (e) {
    if (isUniqueViolation(e, "requestId")) return { status: "success", message: "이미 처리된 요청입니다.", ts: Date.now() };
    if (e instanceof StockBucketError || e instanceof BucketStockError || e instanceof InsufficientStockError)
      return fail(e.message);
    console.error("[stock] adjust failed", e);
    return fail("처리 중 오류가 발생했습니다. 다시 시도하세요.");
  }

  revalidatePath("/stock");
  return {
    status: "success",
    message: `${ADJUST_REASON_LABELS[reason.value]}: ${quantity.toLocaleString()}개를 ${reason.sign > 0 ? "추가" : "차감"}했습니다.`,
    ts: Date.now(),
  };
}

/** 재고조정 화면: 상품 검색 (확정된 상품만, 최대 10건) */
export type AdjustProductOption = { id: string; sku: string; name: string; baseUnit: string; stock: number };

export async function searchAdjustProductsAction(q: string): Promise<AdjustProductOption[]> {
  if (!(await authorize("admin"))) return [];
  const term = typeof q === "string" ? q.trim().slice(0, 50) : "";
  if (!term) return [];
  return prisma.product.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ sku: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }],
    },
    orderBy: { sku: "asc" },
    take: 10,
    select: { id: true, sku: true, name: true, baseUnit: true, stock: true },
  });
}

/** 재고조정 화면: 상품의 칸별 재고 (위치·유통기한 단위) */
export async function listAdjustBucketsAction(productId: string): Promise<BalanceEntry[]> {
  if (!(await authorize("admin")) || typeof productId !== "string" || !UUID_RE.test(productId)) return [];
  const rows = await listProductBalances(productId);
  return rows.map((b) => ({
    locationId: b.locationId,
    locationCode: b.location?.code ?? null,
    expiryDate: b.expiryDate ? dbToDateOnly(b.expiryDate) : null,
    lotDate: b.lotDate ? dbToDateOnly(b.lotDate) : null,
    quantity: b.quantity,
  }));
}

export type MoveStockActionState = {
  /** confirm: 보관 온도가 맞지 않아 사용자 확인이 필요 (이동 안 됨) */
  status: "idle" | "success" | "error" | "confirm";
  message: string;
  /** confirm 일 때 확인 대상 위치코드 */
  confirmLocationCode?: string;
  ts?: number;
};

/**
 * 재고 위치 이동 (관리자): 한 칸의 재고 일부/전부를 다른 위치로. 유통기한·총재고는 그대로
 * 폼: productId, locationId(""=미지정), expiryDate(""=미상), toLocationCode(필수), quantity,
 *     confirmedLocationCode(보관 온도 경고를 확인한 위치코드, 선택)
 */
export async function moveStockAction(
  _prev: MoveStockActionState,
  fd: FormData
): Promise<MoveStockActionState> {
  const fail = (message: string) => ({ status: "error" as const, message, ts: Date.now() });
  if (!(await authorize("admin"))) return fail(NO_PERMISSION_MESSAGE);

  const productId = text(fd, "productId");
  const locationId = text(fd, "locationId") || null;
  if (!UUID_RE.test(productId) || (locationId && !UUID_RE.test(locationId))) return fail("잘못된 요청입니다.");
  const expiry = parseOptionalDate(fd, "expiryDate", "유통기한");
  if (expiry.error) return fail("잘못된 요청입니다.");
  const toCode = text(fd, "toLocationCode").toUpperCase();
  if (!toCode) return fail("옮길 위치코드를 입력하세요.");
  if (!LOCATION_CODE_RE.test(toCode)) return fail("위치코드 형식이 올바르지 않습니다. (예: RF1-R01-2-3)");
  const rawQty = text(fd, "quantity").replaceAll(",", "");
  if (!INT_RE.test(rawQty) || Number(rawQty) < 1) return fail("수량은 1 이상의 정수여야 합니다.");
  const quantity = Number(rawQty);
  if (quantity > MAX_SAFETY_STOCK) return fail("수량이 너무 큽니다.");
  const confirmedCode = text(fd, "confirmedLocationCode").toUpperCase();

  try {
    const warning = await prisma.$transaction(async (tx) => {
      const to = await tx.location.findUnique({
        where: { code: toCode },
        select: { id: true, code: true, warehouse: { select: { name: true, storageType: true } } },
      });
      if (!to) throw new StockBucketError(`존재하지 않는 위치코드입니다: ${toCode}`);
      const inactive = await inactiveLocationMessage(tx, to.id);
      if (inactive) throw new StockBucketError(inactive);
      // 보관 온도 검사: 분류와 창고 유형이 다르면 같은 위치를 확인한 경우에만 진행
      if (confirmedCode !== toCode) {
        const product = await tx.product.findUnique({ where: { id: productId }, select: { name: true, category: true } });
        if (!product) throw new StockBucketError("존재하지 않는 상품입니다.");
        const w = storageMismatchWarning(product, to);
        if (w) return w;
      }
      const r = await moveStock(tx, {
        productId,
        from: { locationId, expiryDate: expiry.value },
        toLocationId: to.id,
        quantity,
      });
      const fromLoc = locationId
        ? await tx.location.findUnique({ where: { id: locationId }, select: { code: true } })
        : null;
      const fromCode = fromLoc?.code ?? "미지정";
      await recordAudit(tx, {
        category: "STOCK",
        action: "STOCK_MOVE",
        targetId: productId,
        targetLabel: r.productName,
        summary: `${r.productName} ${quantity.toLocaleString()}개 위치 이동 ${fromCode} → ${toCode}`,
        detail: {
          quantity,
          expiryDate: expiry.value ?? "미상",
          before: { location: fromCode },
          after: { location: toCode },
        },
      });
      return null;
    });
    if (warning) {
      return { status: "confirm", message: `${warning} 그래도 옮기려면 [그래도 이동]을 누르세요.`, confirmLocationCode: toCode, ts: Date.now() };
    }
  } catch (e) {
    if (e instanceof StockBucketError) return fail(e.message);
    console.error("[stock] move failed", e);
    return fail("처리 중 오류가 발생했습니다. 다시 시도하세요.");
  }

  revalidatePath("/stock");
  return { status: "success", message: `${quantity.toLocaleString()}개를 ${toCode}(으)로 옮겼습니다.`, ts: Date.now() };
}

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const TYPE_LABELS: Record<string, string> = {
  INBOUND: "입고",
  OUTBOUND: "출고",
  ADJUST: "재고조정",
  INBOUND_CORRECTION: "입고정정",
  OUTBOUND_CORRECTION: "출고정정",
  INBOUND_CANCEL: "입고취소",
  OUTBOUND_CANCEL: "출고취소",
  EXPIRY_CHANGE: "유통기한 변경",
  MOVE: "위치 이동",
};

export type LedgerEntry = {
  id: string;
  createdAtText: string; // 처리일시
  tradeAtText: string | null; // 입고/출고일시
  type: string;
  typeLabel: string;
  quantity: number;
  beforeStock: number;
  afterStock: number;
  locationCode: string | null; // 변동된 칸 (null = 미지정)
  expiryDate: string | null; // 변동된 칸의 유통기한 (null = 미상)
  partner: string | null; // 공급처/출고처
  note: string | null; // 수정 사유 또는 비고
};

/** 칸별 재고 1행 */
export type BalanceEntry = {
  locationId: string | null;
  locationCode: string | null;
  expiryDate: string | null;
  lotDate: string | null; // 그 칸에서 가장 오래된 입고일 (null = 미상)
  quantity: number;
};

export type LocationHistoryEntry = {
  id: string;
  createdAtText: string;
  fromCode: string | null;
  toCode: string | null;
  swappedWithSku: string | null;
  reason: string | null;
};

export type LedgerResult =
  | {
      ok: true;
      total: number;
      entries: LedgerEntry[];
      balances: BalanceEntry[];
      locationHistory: LocationHistoryEntry[];
    }
  | { ok: false; message: string };

/** 재고원장 조회 (팝업에서 호출) */
export async function getStockLedgerAction(productId: string): Promise<LedgerResult> {
  if (!(await authorize("stock.view"))) return { ok: false, message: NO_PERMISSION_MESSAGE };
  if (typeof productId !== "string" || !UUID_RE.test(productId)) {
    return { ok: false, message: "잘못된 상품입니다." };
  }
  const [data, locHist] = await Promise.all([getStockLedger(productId, 50), getLocationHistory(productId, 5)]);
  if (!data) return { ok: false, message: "존재하지 않는 상품입니다." };

  return {
    ok: true,
    total: data.total,
    balances: data.balances.map((b) => ({
      locationId: b.locationId,
      locationCode: b.location?.code ?? null,
      expiryDate: b.expiryDate ? dbToDateOnly(b.expiryDate) : null,
      lotDate: b.lotDate ? dbToDateOnly(b.lotDate) : null,
      quantity: b.quantity,
    })),
    locationHistory: locHist.map((h) => ({
      id: h.id,
      createdAtText: dateFmt.format(h.createdAt),
      fromCode: h.fromCode,
      toCode: h.toCode,
      swappedWithSku: h.swappedWithSku,
      reason: h.reason,
    })),
    entries: data.movements.map((m) => {
      const tradeAt = m.inbound?.receivedAt ?? m.outbound?.shippedAt ?? null;
      const isCorrection = m.type === "INBOUND_CORRECTION" || m.type === "OUTBOUND_CORRECTION";
      const reason = m.inboundRevision?.reason ?? m.outboundRevision?.reason ?? null;
      return {
        id: m.id,
        createdAtText: dateFmt.format(m.createdAt),
        tradeAtText: tradeAt ? dateFmt.format(tradeAt) : null,
        type: m.type,
        typeLabel: TYPE_LABELS[m.type] ?? m.type,
        quantity: m.quantity,
        beforeStock: m.beforeStock,
        afterStock: m.afterStock,
        locationCode: m.location?.code ?? null,
        expiryDate: m.expiryDate ? dbToDateOnly(m.expiryDate) : null,
        partner: m.inbound?.partner?.name ?? m.outbound?.partner?.name ?? null,
        note:
          m.adjustment
            ? `${ADJUST_REASON_LABELS[m.adjustment.reason]}${m.adjustment.memo ? ` · ${m.adjustment.memo}` : ""}`
            : m.type === "INBOUND_CANCEL" || m.type === "OUTBOUND_CANCEL"
            ? (m.inbound?.cancelReason ?? m.outbound?.cancelReason ?? null)
            : isCorrection
              ? reason
              : (m.inbound?.memo ?? m.outbound?.memo ?? null),
      };
    }),
  };
}
