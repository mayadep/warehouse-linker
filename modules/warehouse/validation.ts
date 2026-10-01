// 창고·랙 입력값 검증 (서버에서 반드시 실행)
import { INT_RE, UUID_RE, text, parseOptionalText } from "@/lib/form";
import { isStorageType, WAREHOUSE_LIMITS as L, type StorageTypeCode } from "./codes";

const CODE_RE = /^[A-Z][A-Z0-9]*$/;

type IntResult = { value: number; error?: string };

function parseIntField(fd: FormData, key: string, label: string, min: number, max: number): IntResult {
  const raw = text(fd, key).replaceAll(",", "");
  if (!raw) return { value: 0, error: `${label}를 입력하세요.` };
  if (!INT_RE.test(raw)) return { value: 0, error: `${label}는 정수로 입력하세요.` };
  const n = Number(raw);
  if (n < min || n > max) return { value: 0, error: `${label}는 ${min}~${max} 사이여야 합니다.` };
  return { value: n };
}

export type WarehouseInput = {
  storageType: StorageTypeCode;
  code: string;
  name: string;
  memo: string | null;
  rackCount: number;
  levels: number;
  binsPerLevel: number;
};
export type WarehouseFieldErrors = Partial<Record<keyof WarehouseInput, string>>;

export function parseWarehouseForm(
  fd: FormData
): { ok: true; data: WarehouseInput } | { ok: false; errors: WarehouseFieldErrors } {
  const errors: WarehouseFieldErrors = {};

  const typeRaw = text(fd, "storageType");
  const storageType: StorageTypeCode = isStorageType(typeRaw) ? typeRaw : "AMBIENT";
  if (!isStorageType(typeRaw)) errors.storageType = "보관유형을 선택하세요.";

  const code = text(fd, "code").toUpperCase();
  if (!code) errors.code = "창고코드를 입력하세요.";
  else if (code.length < 2 || code.length > L.maxCodeLength)
    errors.code = `창고코드는 2~${L.maxCodeLength}자로 입력하세요.`;
  else if (!CODE_RE.test(code)) errors.code = "창고코드는 영문 대문자로 시작하고 영문·숫자만 쓸 수 있습니다.";

  const name = text(fd, "name");
  if (!name) errors.name = "창고명을 입력하세요.";
  else if (name.length > L.maxNameLength) errors.name = `창고명은 ${L.maxNameLength}자 이내로 입력하세요.`;

  const memo = parseOptionalText(fd, "memo", "비고", L.maxMemoLength);
  if (memo.error) errors.memo = memo.error;

  const rackCount = parseIntField(fd, "rackCount", "랙 수", 0, L.maxRackNumber);
  const levels = parseIntField(fd, "levels", "단 수", 1, L.maxLevels);
  const bins = parseIntField(fd, "binsPerLevel", "단별 구획 수", 1, L.maxBinsPerLevel);
  if (rackCount.error) errors.rackCount = rackCount.error;
  if (levels.error) errors.levels = levels.error;
  if (bins.error) errors.binsPerLevel = bins.error;
  if (!errors.rackCount && !errors.levels && !errors.binsPerLevel) {
    const total = rackCount.value * levels.value * bins.value;
    if (total > L.maxLocationsPerRequest)
      errors.rackCount = `한 번에 만들 수 있는 구획은 ${L.maxLocationsPerRequest.toLocaleString()}칸까지입니다. (요청 ${total.toLocaleString()}칸)`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      storageType,
      code,
      name,
      memo: memo.value,
      rackCount: rackCount.value,
      levels: levels.value,
      binsPerLevel: bins.value,
    },
  };
}

export type AddRacksInput = {
  warehouseId: string;
  /** 화면에 보이던 랙 수 (서버와 다르면 동시 추가/연타로 보고 거부) */
  expectedRackCount: number;
  count: number;
  levels: number;
  binsPerLevel: number;
};
export type AddRacksFieldErrors = Partial<Record<keyof AddRacksInput, string>>;

export function parseAddRacksForm(
  fd: FormData
): { ok: true; data: AddRacksInput } | { ok: false; errors: AddRacksFieldErrors } {
  const errors: AddRacksFieldErrors = {};
  const warehouseId = text(fd, "warehouseId");
  if (!UUID_RE.test(warehouseId)) errors.warehouseId = "잘못된 창고입니다.";
  const expRaw = text(fd, "expectedRackCount");
  if (!INT_RE.test(expRaw)) errors.expectedRackCount = "잘못된 요청입니다. 새로고침 후 다시 시도하세요.";

  const count = parseIntField(fd, "count", "추가할 랙 수", 1, L.maxRackNumber);
  const levels = parseIntField(fd, "levels", "단 수", 1, L.maxLevels);
  const bins = parseIntField(fd, "binsPerLevel", "단별 구획 수", 1, L.maxBinsPerLevel);
  if (count.error) errors.count = count.error;
  if (levels.error) errors.levels = levels.error;
  if (bins.error) errors.binsPerLevel = bins.error;
  if (!errors.count && !errors.levels && !errors.binsPerLevel) {
    const total = count.value * levels.value * bins.value;
    if (total > L.maxLocationsPerRequest)
      errors.count = `한 번에 만들 수 있는 구획은 ${L.maxLocationsPerRequest.toLocaleString()}칸까지입니다. (요청 ${total.toLocaleString()}칸)`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      warehouseId,
      expectedRackCount: Number(expRaw),
      count: count.value,
      levels: levels.value,
      binsPerLevel: bins.value,
    },
  };
}

// ───────── 보관위치 변경 ─────────

/** RF1-R01-2-3 형식 */
const LOCATION_CODE_RE = /^[A-Z][A-Z0-9]{1,9}-R\d{2,3}-\d{1,2}-\d{1,2}$/;

export type LocationChangeInput = {
  productId: string;
  /** 화면을 연 시점의 현재 위치 (다르면 그 사이 바뀐 것) */
  expectedLocationId: string | null;
  /** null = 위치 해제 */
  targetCode: string | null;
  /** 경고(교환·유형 불일치)를 확인했는지 */
  confirmed: boolean;
  /** 확인한 교환 상대 상품 (확인 후 상대가 바뀌었으면 다시 확인) */
  expectedOccupantId: string | null;
  reason: string | null;
};

export function parseLocationChangeForm(
  fd: FormData
): { ok: true; data: LocationChangeInput } | { ok: false; message: string } {
  const productId = text(fd, "productId");
  if (!UUID_RE.test(productId)) return { ok: false, message: "잘못된 상품입니다." };

  const exp = text(fd, "expectedLocationId");
  if (exp && !UUID_RE.test(exp)) return { ok: false, message: "잘못된 요청입니다. 새로고침 후 다시 시도하세요." };

  // set: 변경, set-confirmed: 경고 확인 후 변경, clear: 해제
  const mode = text(fd, "mode");
  if (mode !== "set" && mode !== "set-confirmed" && mode !== "clear") return { ok: false, message: "잘못된 요청입니다." };

  let targetCode: string | null = null;
  if (mode !== "clear") {
    targetCode = text(fd, "targetCode").toUpperCase();
    if (!targetCode) return { ok: false, message: "변경할 위치를 끝까지(창고·랙·단·구획) 선택하세요." };
    if (targetCode.length > 30 || !LOCATION_CODE_RE.test(targetCode))
      return { ok: false, message: `위치코드 형식이 올바르지 않습니다: ${targetCode}` };
  }

  const occ = text(fd, "expectedOccupantId");
  if (occ && !UUID_RE.test(occ)) return { ok: false, message: "잘못된 요청입니다." };

  const reason = parseOptionalText(fd, "reason", "사유", 200);
  if (reason.error) return { ok: false, message: reason.error };

  return {
    ok: true,
    data: {
      productId,
      expectedLocationId: exp || null,
      targetCode,
      confirmed: mode === "set-confirmed",
      expectedOccupantId: occ || null,
      reason: reason.value,
    },
  };
}
