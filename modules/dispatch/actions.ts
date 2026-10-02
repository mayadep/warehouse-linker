"use server";

import { authorize, NO_PERMISSION_MESSAGE } from "@/modules/user/auth";
import { revalidatePath } from "next/cache";
import { UUID_RE, text } from "@/lib/form";
import { DISPATCH_STATUS_LABELS } from "./codes";
import {
  addDispatchItems,
  changeDispatchStatus,
  createDispatch,
  createVehicle,
  DispatchError,
  removeDispatchItem,
  setVehicleActive,
} from "./service";
import {
  parseAddItemsForm,
  parseDispatchCreateForm,
  parseRemoveItemForm,
  parseStatusForm,
  parseVehicleForm,
} from "./validation";

export type DispatchActionState = { status: "idle" | "success" | "error"; message: string; ts?: number };

const ok = (message: string): DispatchActionState => ({ status: "success", message, ts: Date.now() });
const fail = (message: string): DispatchActionState => ({ status: "error", message, ts: Date.now() });

async function run(fn: () => Promise<string>): Promise<DispatchActionState> {
  if (!(await authorize("admin"))) return fail(NO_PERMISSION_MESSAGE); // 배차·차량은 관리자만
  try {
    const msg = await fn();
    revalidatePath("/dispatch", "layout");
    return ok(msg);
  } catch (e) {
    if (e instanceof DispatchError) return fail(e.message);
    console.error("[dispatch] action failed", e);
    return fail("처리 중 오류가 발생했습니다. 다시 시도하세요.");
  }
}

export async function createVehicleAction(_p: DispatchActionState, fd: FormData) {
  const p = parseVehicleForm(fd);
  if (!p.ok) return fail(p.message);
  return run(async () => `${(await createVehicle(p.data)).plateNo} 차량 등록 완료`);
}

export async function setVehicleActiveAction(_p: DispatchActionState, fd: FormData) {
  const id = text(fd, "vehicleId");
  if (!UUID_RE.test(id)) return fail("잘못된 차량입니다.");
  const active = text(fd, "active") === "1";
  return run(async () => `${await setVehicleActive(id, active)} ${active ? "운행 재개" : "운행 중지"}`);
}

export async function createDispatchAction(_p: DispatchActionState, fd: FormData) {
  const p = parseDispatchCreateForm(fd);
  if (!p.ok) return fail(p.message);
  return run(async () => {
    const d = await createDispatch(p.data);
    return `${d.dispatchNo} 배차 등록 완료 (출고 ${p.data.outboundIds.length}건)`;
  });
}

export async function addDispatchItemsAction(_p: DispatchActionState, fd: FormData) {
  const p = parseAddItemsForm(fd);
  if (!p.ok) return fail(p.message);
  return run(async () => {
    const r = await addDispatchItems(p.data);
    return `${r.dispatchNo}에 출고 ${r.added}건 추가`;
  });
}

export async function removeDispatchItemAction(_p: DispatchActionState, fd: FormData) {
  const p = parseRemoveItemForm(fd);
  if (!p.ok) return fail(p.message);
  return run(async () => `${(await removeDispatchItem(p.data)).dispatchNo}에서 1건 제외`);
}

export async function changeDispatchStatusAction(_p: DispatchActionState, fd: FormData) {
  const p = parseStatusForm(fd);
  if (!p.ok) return fail(p.message);
  return run(async () => {
    const r = await changeDispatchStatus(p.data);
    return `${r.dispatchNo} ${DISPATCH_STATUS_LABELS[r.to]}${r.released ? ` (출고 ${r.released}건 배차 해제)` : ""}`;
  });
}
