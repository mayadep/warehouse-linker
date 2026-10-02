import type { DispatchStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextDocNumber } from "@/lib/doc-number";
import { isUniqueViolation } from "@/modules/stock/service";
import { storageTypeForCategory } from "@/modules/warehouse/assign";
import { STORAGE_TYPE_LABELS } from "@/modules/warehouse/codes";
import { canCarry, DISPATCH_CANCELLABLE, DISPATCH_LIMITS, DISPATCH_NEXT, DISPATCH_STATUS_LABELS, type DispatchStatusCode } from "./codes";
import type { DispatchCreateInput, DispatchRef, VehicleInput } from "./validation";
import { toKstDate } from "@/lib/datetime";
import { recordAudit } from "@/modules/audit/service";

export class DispatchError extends Error {}

// ───────── 차량 ─────────

export async function createVehicle(input: VehicleInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const v = await tx.vehicle.create({ data: input });
      await recordAudit(tx, {
        category: "VEHICLE",
        action: "VEHICLE_CREATE",
        targetId: v.id,
        targetLabel: v.plateNo,
        summary: `차량 등록: ${v.plateNo} (${STORAGE_TYPE_LABELS[v.storageType]}, ${v.driverName})`,
        detail: {
          plateNo: v.plateNo,
          storageType: STORAGE_TYPE_LABELS[v.storageType],
          driverName: v.driverName,
          driverPhone: v.driverPhone,
          memo: v.memo,
        },
      });
      return v;
    });
  } catch (e) {
    if (isUniqueViolation(e, "plateNo")) throw new DispatchError(`이미 등록된 차량번호입니다: ${input.plateNo}`);
    throw e;
  }
}

/** 운행 중지/재개. 진행 중(배차·상차·배송중) 배차가 있으면 중지 불가 */
export async function setVehicleActive(vehicleId: string, active: boolean) {
  return prisma.$transaction(async (tx) => {
    const v = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { plateNo: true } });
    if (!v) throw new DispatchError("존재하지 않는 차량입니다.");
    if (!active) {
      const busy = await tx.dispatch.count({
        where: { vehicleId, status: { in: ["PLANNED", "LOADED", "IN_TRANSIT"] } },
      });
      if (busy > 0) throw new DispatchError(`${v.plateNo}: 진행 중인 배차 ${busy}건이 있어 운행 중지할 수 없습니다.`);
    }
    await tx.vehicle.update({ where: { id: vehicleId }, data: { isActive: active } });
    await recordAudit(tx, {
      category: "VEHICLE",
      action: active ? "VEHICLE_ACTIVE" : "VEHICLE_INACTIVE",
      targetId: vehicleId,
      targetLabel: v.plateNo,
      summary: `${v.plateNo} ${active ? "운행 재개" : "운행 중지"}`,
    });
    return v.plateNo;
  });
}

// ───────── 배차 ─────────

const TX = { timeout: 30_000 };

/** 배차 품목 배정은 하나씩 처리 (같은 출고가 두 배차에 들어가지 않게, DB unique 가 최종 보장) */
async function lockAssign(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('dispatch-assign'))`;
}

/** 출고 건이 배차 가능한지 검사: 존재, 미배차, 차량 온도 등급 */
async function checkOutbounds(
  tx: Prisma.TransactionClient,
  outboundIds: string[],
  vehicleType: Parameters<typeof canCarry>[0]
) {
  const obs = await tx.outbound.findMany({
    where: { id: { in: outboundIds } },
    select: {
      id: true,
      customer: true,
      status: true,
      product: { select: { name: true, category: true } },
      dispatchItem: { select: { dispatch: { select: { dispatchNo: true } } } },
    },
  });
  if (obs.length !== outboundIds.length) throw new DispatchError("존재하지 않는 출고 건이 포함되어 있습니다.");
  const notConfirmed = obs.filter((o) => o.status !== "CONFIRMED");
  if (notConfirmed.length > 0) {
    throw new DispatchError(`확정되지 않았거나 취소된 출고는 배차할 수 없습니다: ${notConfirmed.map((o) => o.product.name).join(", ")}`);
  }
  const taken = obs.filter((o) => o.dispatchItem);
  if (taken.length > 0) {
    throw new DispatchError(
      `이미 배차된 출고가 있습니다: ${taken.map((o) => `${o.product.name}(${o.dispatchItem!.dispatch.dispatchNo})`).join(", ")}`
    );
  }
  const bad = obs.filter((o) => !canCarry(vehicleType, storageTypeForCategory(o.product.category)));
  if (bad.length > 0) {
    throw new DispatchError(
      `${STORAGE_TYPE_LABELS[vehicleType]} 차량에 실을 수 없는 상품이 있습니다: ${bad
        .map((o) => `${o.product.name}(${STORAGE_TYPE_LABELS[storageTypeForCategory(o.product.category)]})`)
        .join(", ")}`
    );
  }
}

/** 감사 로그용 출고 요약: "상품명 수량(출고처), …" */
async function outboundSummary(tx: Prisma.TransactionClient, outboundIds: string[]) {
  const obs = await tx.outbound.findMany({
    where: { id: { in: outboundIds } },
    select: { quantity: true, customer: true, product: { select: { name: true } } },
  });
  return obs
    .map((o) => `${o.product.name} ${o.quantity.toLocaleString()}${o.customer ? `(${o.customer})` : ""}`)
    .join(", ");
}

/** 배차 등록 (차량 + 배송일 + 출고 건들) */
export async function createDispatch(input: DispatchCreateInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const dup = await tx.dispatch.findUnique({ where: { requestId: input.requestId }, select: { dispatchNo: true } });
      if (dup) throw new DispatchError(`이미 처리된 요청입니다. (${dup.dispatchNo})`);
      await lockAssign(tx);

      const vehicle = await tx.vehicle.findUnique({ where: { id: input.vehicleId } });
      if (!vehicle) throw new DispatchError("존재하지 않는 차량입니다.");
      if (!vehicle.isActive) throw new DispatchError(`${vehicle.plateNo}은(는) 운행 중지된 차량입니다.`);
      await checkOutbounds(tx, input.outboundIds, vehicle.storageType);

      const dispatchNo = await nextDocNumber(tx, "DSP", async (head) => {
        const last = await tx.dispatch.findFirst({
          where: { dispatchNo: { startsWith: head } },
          orderBy: { dispatchNo: "desc" },
          select: { dispatchNo: true },
        });
        return last?.dispatchNo ?? null;
      });

      const created = await tx.dispatch.create({
        data: {
          dispatchNo,
          deliveryDate: input.deliveryDate,
          vehicleId: vehicle.id,
          memo: input.memo,
          requestId: input.requestId,
          items: { create: input.outboundIds.map((outboundId, i) => ({ outboundId, seq: i + 1 })) },
        },
        select: { id: true, dispatchNo: true },
      });
      await recordAudit(tx, {
        category: "DISPATCH",
        action: "DISPATCH_CREATE",
        targetId: created.id,
        targetLabel: dispatchNo,
        summary: `배차 등록: ${dispatchNo} ${vehicle.plateNo} (${toKstDate(input.deliveryDate)}, 출고 ${input.outboundIds.length}건)`,
        detail: {
          deliveryDate: toKstDate(input.deliveryDate),
          vehicle: `${vehicle.plateNo} (${vehicle.driverName})`,
          outbounds: await outboundSummary(tx, input.outboundIds),
          memo: input.memo,
        },
      });
      return created;
    }, TX);
  } catch (e) {
    if (isUniqueViolation(e, "outboundId")) throw new DispatchError("다른 배차에 먼저 들어간 출고 건이 있습니다. 새로고침 후 다시 시도하세요.");
    if (isUniqueViolation(e, "requestId")) throw new DispatchError("이미 처리된 요청입니다.");
    throw e;
  }
}

async function lockDispatch(tx: Prisma.TransactionClient, ref: DispatchRef) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Dispatch" WHERE "id" = ${ref.dispatchId} FOR UPDATE`;
  if (rows.length === 0) throw new DispatchError("존재하지 않는 배차입니다.");
  const d = await tx.dispatch.findUniqueOrThrow({
    where: { id: ref.dispatchId },
    include: { vehicle: true, items: { select: { id: true, seq: true }, orderBy: { seq: "asc" } } },
  });
  if (d.version !== ref.version) throw new DispatchError("그 사이 배차 내용이 바뀌었습니다. 새로고침 후 다시 시도하세요.");
  return d;
}

/** 배차에 출고 건 추가 (배차 단계에서만) */
export async function addDispatchItems(input: DispatchRef & { outboundIds: string[] }) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockAssign(tx);
      const d = await lockDispatch(tx, input);
      if (d.status !== "PLANNED") throw new DispatchError("상차 전(배차 단계)에만 품목을 추가할 수 있습니다.");
      await checkOutbounds(tx, input.outboundIds, d.vehicle.storageType);
      const start = d.items.reduce((m, i) => Math.max(m, i.seq), 0);
      await tx.dispatchItem.createMany({
        data: input.outboundIds.map((outboundId, i) => ({ dispatchId: d.id, outboundId, seq: start + i + 1 })),
      });
      await tx.dispatch.update({ where: { id: d.id }, data: { version: { increment: 1 } } });
      await recordAudit(tx, {
        category: "DISPATCH",
        action: "DISPATCH_ITEM_ADD",
        targetId: d.id,
        targetLabel: d.dispatchNo,
        summary: `${d.dispatchNo}에 출고 ${input.outboundIds.length}건 추가`,
        detail: { outbounds: await outboundSummary(tx, input.outboundIds) },
      });
      return { dispatchNo: d.dispatchNo, added: input.outboundIds.length };
    }, TX);
  } catch (e) {
    if (isUniqueViolation(e, "outboundId")) throw new DispatchError("다른 배차에 먼저 들어간 출고 건이 있습니다. 새로고침 후 다시 시도하세요.");
    throw e;
  }
}

/** 배차에서 출고 건 빼기 (배차 단계에서만, 순서 다시 매김) */
export async function removeDispatchItem(input: DispatchRef & { itemId: string }) {
  return prisma.$transaction(async (tx) => {
    const d = await lockDispatch(tx, input);
    if (d.status !== "PLANNED") throw new DispatchError("상차 전(배차 단계)에만 품목을 뺄 수 있습니다.");
    if (!d.items.some((i) => i.id === input.itemId)) throw new DispatchError("이 배차에 없는 품목입니다.");
    if (d.items.length === 1) throw new DispatchError("마지막 품목은 뺄 수 없습니다. 배차를 취소하세요.");
    const removed = await tx.dispatchItem.delete({ where: { id: input.itemId }, select: { outboundId: true } });
    const rest = d.items.filter((i) => i.id !== input.itemId);
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].seq !== i + 1) await tx.dispatchItem.update({ where: { id: rest[i].id }, data: { seq: i + 1 } });
    }
    await tx.dispatch.update({ where: { id: d.id }, data: { version: { increment: 1 } } });
    await recordAudit(tx, {
      category: "DISPATCH",
      action: "DISPATCH_ITEM_REMOVE",
      targetId: d.id,
      targetLabel: d.dispatchNo,
      summary: `${d.dispatchNo}에서 출고 1건 빼기`,
      detail: { outbounds: await outboundSummary(tx, [removed.outboundId]) },
    });
    return { dispatchNo: d.dispatchNo };
  });
}

/**
 * 상태 변경: 배차 → 상차 완료 → 배송중 → 배송 완료 (한 단계씩만)
 * 취소는 출발 전(배차·상차)만 가능하며, 실려 있던 출고 건은 다시 배차할 수 있게 풀어준다.
 */
export async function changeDispatchStatus(input: DispatchRef & { to: DispatchStatusCode }) {
  return prisma.$transaction(async (tx) => {
    const d = await lockDispatch(tx, input);
    const from = d.status as DispatchStatusCode;
    const data: Prisma.DispatchUpdateInput = { status: input.to as DispatchStatus, version: { increment: 1 } };
    let released = 0;

    if (input.to === "CANCELLED") {
      if (!DISPATCH_CANCELLABLE.includes(from)) throw new DispatchError(`${DISPATCH_STATUS_LABELS[from]} 상태에서는 취소할 수 없습니다.`);
      released = (await tx.dispatchItem.deleteMany({ where: { dispatchId: d.id } })).count;
      data.cancelledAt = new Date();
      data.memo = [d.memo, `취소 시 출고 ${released}건 배차 해제`].filter(Boolean).join(" · ");
    } else {
      if (DISPATCH_NEXT[from]?.to !== input.to) {
        throw new DispatchError(`${DISPATCH_STATUS_LABELS[from]} 다음 단계는 ${DISPATCH_NEXT[from] ? DISPATCH_STATUS_LABELS[DISPATCH_NEXT[from]!.to] : "없습니다"}.`);
      }
      if (input.to === "DELIVERED") data.deliveredAt = new Date();
    }
    await tx.dispatch.update({ where: { id: d.id }, data });
    await recordAudit(tx, {
      category: "DISPATCH",
      action: "DISPATCH_STATUS",
      targetId: d.id,
      targetLabel: d.dispatchNo,
      summary: `${d.dispatchNo} ${DISPATCH_STATUS_LABELS[from]} → ${DISPATCH_STATUS_LABELS[input.to]}${released ? ` (출고 ${released}건 배차 해제)` : ""}`,
      detail: {
        before: { status: DISPATCH_STATUS_LABELS[from] },
        after: { status: DISPATCH_STATUS_LABELS[input.to] },
        vehicle: d.vehicle.plateNo,
        ...(released ? { released: `${released}건` } : {}),
      },
    });
    return { dispatchNo: d.dispatchNo, to: input.to, released };
  });
}

// ───────── 조회 ─────────

const outboundView = {
  id: true,
  quantity: true,
  customer: true,
  shippedAt: true,
  memo: true,
  product: { select: { sku: true, name: true, category: true, baseUnit: true } },
} as const;

export async function listDispatchesByDate(deliveryDate: Date) {
  return prisma.dispatch.findMany({
    where: { deliveryDate },
    orderBy: [{ status: "asc" }, { dispatchNo: "asc" }],
    include: {
      vehicle: true,
      items: { orderBy: { seq: "asc" }, include: { outbound: { select: outboundView } } },
    },
  });
}

/** 아직 배차되지 않은 최근 출고 건 */
export async function listUnassignedOutbounds(now = new Date()) {
  const since = new Date(now.getTime() - DISPATCH_LIMITS.unassignedDays * 24 * 60 * 60 * 1000);
  return prisma.outbound.findMany({
    where: { dispatchItem: null, status: "CONFIRMED", shippedAt: { gte: since } }, // 확정 출고만 배차
    orderBy: [{ shippedAt: "desc" }],
    select: outboundView,
    take: 300,
  });
}

export async function listVehicles(activeOnly = false) {
  return prisma.vehicle.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ isActive: "desc" }, { storageType: "desc" }, { plateNo: "asc" }],
    include: { _count: { select: { dispatches: true } } },
  });
}
