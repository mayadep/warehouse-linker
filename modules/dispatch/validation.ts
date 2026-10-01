// 배차·차량 입력값 검증 (서버에서 반드시 실행)
import { UUID_RE, parseOptionalText, parseRequestId, parseVersion, text } from "@/lib/form";
import { parseKstDate } from "@/lib/datetime";
import { isStorageType, type StorageTypeCode } from "@/modules/warehouse/codes";
import { DISPATCH_LIMITS as L, type DispatchStatusCode } from "./codes";

type Fail = { ok: false; message: string };

export type VehicleInput = {
  plateNo: string;
  storageType: StorageTypeCode;
  driverName: string;
  driverPhone: string | null;
  memo: string | null;
};

export function parseVehicleForm(fd: FormData): { ok: true; data: VehicleInput } | Fail {
  const plateNo = text(fd, "plateNo").replace(/\s+/g, "");
  if (!plateNo) return { ok: false, message: "차량번호를 입력하세요." };
  if (!/^[0-9가-힣A-Za-z]{4,20}$/.test(plateNo)) return { ok: false, message: "차량번호는 한글·숫자 4~20자로 입력하세요. (예: 12가3456)" };
  const type = text(fd, "storageType");
  if (!isStorageType(type)) return { ok: false, message: "적재 온도를 선택하세요." };
  const driverName = text(fd, "driverName");
  if (!driverName || driverName.length > 30) return { ok: false, message: "기사 이름을 30자 이내로 입력하세요." };
  const phone = text(fd, "driverPhone");
  if (phone && !/^[0-9+\- ]{7,20}$/.test(phone)) return { ok: false, message: "연락처 형식이 올바르지 않습니다." };
  const memo = parseOptionalText(fd, "memo", "비고", 200);
  if (memo.error) return { ok: false, message: memo.error };
  return { ok: true, data: { plateNo, storageType: type, driverName, driverPhone: phone || null, memo: memo.value } };
}

function parseIdList(raw: string): string[] | null {
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v) || v.length === 0 || v.length > L.maxItemsPerRequest) return null;
    if (!v.every((x) => typeof x === "string" && UUID_RE.test(x))) return null;
    if (new Set(v).size !== v.length) return null;
    return v as string[];
  } catch {
    return null;
  }
}

export type DispatchCreateInput = {
  deliveryDate: Date;
  vehicleId: string;
  outboundIds: string[];
  memo: string | null;
  requestId: string;
};

export function parseDispatchCreateForm(fd: FormData, now = new Date()): { ok: true; data: DispatchCreateInput } | Fail {
  const deliveryDate = parseKstDate(text(fd, "deliveryDate"));
  if (!deliveryDate) return { ok: false, message: "배송일을 선택하세요." };
  const yearMs = 366 * 24 * 60 * 60 * 1000;
  if (Math.abs(deliveryDate.getTime() - now.getTime()) > yearMs) return { ok: false, message: "배송일은 1년 이내여야 합니다." };
  const vehicleId = text(fd, "vehicleId");
  if (!UUID_RE.test(vehicleId)) return { ok: false, message: "차량을 선택하세요." };
  const outboundIds = parseIdList(text(fd, "outboundIds"));
  if (!outboundIds) return { ok: false, message: `배차할 출고 건을 1~${L.maxItemsPerRequest}건 선택하세요.` };
  const memo = parseOptionalText(fd, "memo", "비고", L.maxMemoLength);
  if (memo.error) return { ok: false, message: memo.error };
  const requestId = parseRequestId(fd);
  if (requestId.error) return { ok: false, message: requestId.error };
  return { ok: true, data: { deliveryDate, vehicleId, outboundIds, memo: memo.value, requestId: requestId.value } };
}

export type DispatchRef = { dispatchId: string; version: number };

function parseRef(fd: FormData): ({ ok: true } & DispatchRef) | Fail {
  const dispatchId = text(fd, "dispatchId");
  if (!UUID_RE.test(dispatchId)) return { ok: false, message: "잘못된 배차입니다." };
  const v = parseVersion(fd);
  if (v.error) return { ok: false, message: v.error };
  return { ok: true, dispatchId, version: v.value };
}

export function parseAddItemsForm(fd: FormData): { ok: true; data: DispatchRef & { outboundIds: string[] } } | Fail {
  const ref = parseRef(fd);
  if (!ref.ok) return ref;
  const outboundIds = parseIdList(text(fd, "outboundIds"));
  if (!outboundIds) return { ok: false, message: `추가할 출고 건을 1~${L.maxItemsPerRequest}건 선택하세요.` };
  return { ok: true, data: { dispatchId: ref.dispatchId, version: ref.version, outboundIds } };
}

export function parseRemoveItemForm(fd: FormData): { ok: true; data: DispatchRef & { itemId: string } } | Fail {
  const ref = parseRef(fd);
  if (!ref.ok) return ref;
  const itemId = text(fd, "itemId");
  if (!UUID_RE.test(itemId)) return { ok: false, message: "잘못된 요청입니다." };
  return { ok: true, data: { dispatchId: ref.dispatchId, version: ref.version, itemId } };
}

const TARGETS: DispatchStatusCode[] = ["LOADED", "IN_TRANSIT", "DELIVERED", "CANCELLED"];

export function parseStatusForm(fd: FormData): { ok: true; data: DispatchRef & { to: DispatchStatusCode } } | Fail {
  const ref = parseRef(fd);
  if (!ref.ok) return ref;
  const to = text(fd, "to") as DispatchStatusCode;
  if (!TARGETS.includes(to)) return { ok: false, message: "잘못된 요청입니다." };
  return { ok: true, data: { dispatchId: ref.dispatchId, version: ref.version, to } };
}
