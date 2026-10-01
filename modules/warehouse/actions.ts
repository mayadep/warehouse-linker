"use server";

import { revalidatePath } from "next/cache";
import {
  parseAddRacksForm,
  parseLocationChangeForm,
  parseWarehouseForm,
  type AddRacksFieldErrors,
  type WarehouseFieldErrors,
} from "./validation";
import { changeProductLocation, listRacksForPicker, LocationChangeError } from "./location";
import { UUID_RE } from "@/lib/form";
import { addRacks, createWarehouse, WarehouseError } from "./service";
import { rackCode, STORAGE_TYPES, STORAGE_TYPE_LABELS } from "./codes";
import { assignRandomLocations } from "./assign";

export type WarehouseActionState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: WarehouseFieldErrors;
  ts?: number;
};

export async function createWarehouseAction(
  _prev: WarehouseActionState,
  fd: FormData
): Promise<WarehouseActionState> {
  // TODO: 인증/권한 체계 도입 시 여기서 권한 확인 (UI에만 의존하지 않음)
  const parsed = parseWarehouseForm(fd);
  if (!parsed.ok) return { status: "error", message: "입력값을 확인하세요.", errors: parsed.errors, ts: Date.now() };
  try {
    const r = await createWarehouse(parsed.data);
    revalidatePath("/warehouses");
    return {
      status: "success",
      message: `${r.warehouse.code} ${r.warehouse.name} 추가 완료 (랙 ${r.rackCount}개, 구획 ${r.locationCount.toLocaleString()}칸)`,
      ts: Date.now(),
    };
  } catch (e) {
    if (e instanceof WarehouseError) {
      return { status: "error", message: e.message, errors: { code: e.message }, ts: Date.now() };
    }
    console.error("[warehouse] create failed", e);
    return { status: "error", message: "창고 추가 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

export type AddRacksActionState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: AddRacksFieldErrors;
  ts?: number;
};

export async function addRacksAction(_prev: AddRacksActionState, fd: FormData): Promise<AddRacksActionState> {
  // TODO: 인증/권한 체계 도입 시 여기서 권한 확인 (UI에만 의존하지 않음)
  const parsed = parseAddRacksForm(fd);
  if (!parsed.ok) return { status: "error", message: "입력값을 확인하세요.", errors: parsed.errors, ts: Date.now() };
  try {
    const r = await addRacks(parsed.data);
    revalidatePath("/warehouses");
    revalidatePath(`/warehouses/${parsed.data.warehouseId}`);
    const range = r.startNumber === r.lastNumber ? rackCode(r.startNumber) : `${rackCode(r.startNumber)}~${rackCode(r.lastNumber)}`;
    return {
      status: "success",
      message: `${r.warehouseCode} 랙 ${range} 추가 완료 (구획 ${r.locationCount.toLocaleString()}칸)`,
      ts: Date.now(),
    };
  } catch (e) {
    if (e instanceof WarehouseError) return { status: "error", message: e.message, ts: Date.now() };
    console.error("[warehouse] add racks failed", e);
    return { status: "error", message: "랙 추가 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

export type AssignActionState = { status: "idle" | "success" | "error"; message: string; ts?: number };

/** 위치가 없는 상품에 빈 칸을 랜덤 배정 */
export async function assignLocationsAction(): Promise<AssignActionState> {
  // TODO: 인증/권한 체계 도입 시 여기서 권한 확인 (UI에만 의존하지 않음)
  try {
    const r = await assignRandomLocations();
    revalidatePath("/warehouses", "layout");
    revalidatePath("/stock");
    revalidatePath("/inbound");
    revalidatePath("/outbound");
    if (r.assignedTotal === 0 && r.unassignedTotal === 0) {
      return { status: "success", message: "위치가 없는 상품이 없습니다. (모두 배정됨)", ts: Date.now() };
    }
    const detail = STORAGE_TYPES.filter((t) => r.assigned[t] > 0)
      .map((t) => `${STORAGE_TYPE_LABELS[t]} ${r.assigned[t]}`)
      .join(" · ");
    const short = STORAGE_TYPES.filter((t) => r.unassigned[t] > 0)
      .map((t) => `${STORAGE_TYPE_LABELS[t]} ${r.unassigned[t]}`)
      .join(" · ");
    return {
      status: r.unassignedTotal > 0 ? "error" : "success",
      message:
        `${r.assignedTotal}개 상품 위치 배정${detail ? ` (${detail})` : ""}` +
        (short ? ` · 빈 칸이 없어 배정 못 한 상품: ${short} — 해당 유형 창고에 랙을 추가하세요` : ""),
      ts: Date.now(),
    };
  } catch (e) {
    console.error("[warehouse] assign locations failed", e);
    return { status: "error", message: "위치 배정 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

// ───────── 보관위치 직접 변경 ─────────

export type LocationChangeActionState = {
  status: "idle" | "success" | "error" | "confirm";
  message: string;
  warnings?: string[];
  occupantId?: string | null;
  ts?: number;
};

export async function changeProductLocationAction(
  _prev: LocationChangeActionState,
  fd: FormData
): Promise<LocationChangeActionState> {
  // TODO: 인증/권한 체계 도입 시 여기서 권한 확인 (UI에만 의존하지 않음)
  const parsed = parseLocationChangeForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message, ts: Date.now() };
  try {
    const r = await changeProductLocation(parsed.data);
    if (r.status === "confirm") {
      return {
        status: "confirm",
        message: "아래 내용을 확인하세요. 계속하려면 [확인하고 변경]을 누르세요.",
        warnings: r.warnings,
        occupantId: r.occupantId,
        ts: Date.now(),
      };
    }
    revalidatePath("/stock");
    revalidatePath("/warehouses", "layout");
    revalidatePath("/inbound");
    revalidatePath("/outbound");
    const msg =
      r.toCode === null
        ? `${r.productName} 위치 해제 (${r.fromCode} → 없음)`
        : `${r.productName} ${r.fromCode ?? "위치 없음"} → ${r.toCode}` +
          (r.swapped ? ` · ${r.swapped.name}은(는) ${r.swapped.toCode ?? "위치 없음"}(으)로 교환` : "");
    return { status: "success", message: msg, ts: Date.now() };
  } catch (e) {
    if (e instanceof LocationChangeError) return { status: "error", message: e.message, ts: Date.now() };
    console.error("[warehouse] change location failed", e);
    return { status: "error", message: "위치 변경 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

export type RackPickerData =
  | { ok: true; racks: { number: number; levels: number; binsPerLevel: number }[]; occupied: Record<string, string> }
  | { ok: false; message: string };

/** 위치 선택: 창고를 고르면 그 창고의 랙·배정 현황을 불러옴 */
export async function getRacksForPickerAction(warehouseId: string): Promise<RackPickerData> {
  if (typeof warehouseId !== "string" || !UUID_RE.test(warehouseId)) return { ok: false, message: "잘못된 창고입니다." };
  const r = await listRacksForPicker(warehouseId);
  return { ok: true, ...r };
}
