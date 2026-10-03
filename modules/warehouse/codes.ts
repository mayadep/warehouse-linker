// 창고·랙·구획 코드 규칙 (서버/클라이언트 공용)

export const STORAGE_TYPES = ["REFRIGERATED", "FROZEN", "AMBIENT"] as const;
export type StorageTypeCode = (typeof STORAGE_TYPES)[number];

export const STORAGE_TYPE_LABELS: Record<StorageTypeCode, string> = {
  REFRIGERATED: "냉장",
  FROZEN: "냉동",
  AMBIENT: "실온",
};

/** 보관유형별 창고코드 접두어 (RF1, FZ1, AM1 ...) */
export const STORAGE_TYPE_PREFIX: Record<StorageTypeCode, string> = {
  REFRIGERATED: "RF",
  FROZEN: "FZ",
  AMBIENT: "AM",
};

export const WAREHOUSE_LIMITS = {
  maxCodeLength: 10,
  maxNameLength: 50,
  maxMemoLength: 200,
  maxRackNumber: 999,
  maxLevels: 20,
  maxBinsPerLevel: 50,
  /** 한 번에 생성 가능한 구획 수 */
  maxLocationsPerRequest: 20_000,
  defaultLevels: 4,
  defaultBinsPerLevel: 6,
} as const;

export function isStorageType(v: string): v is StorageTypeCode {
  return (STORAGE_TYPES as readonly string[]).includes(v);
}

/** 랙 번호 → R01, R12, R100 */
export function rackCode(number: number): string {
  return `R${String(number).padStart(2, "0")}`;
}

/** 위치코드: 창고코드-랙-단-구획 (예: RF1-R01-2-3) */
/** 위치코드 형식: 창고코드(영문 대문자 시작 2~10자)-R랙(2~3자리)-단-구획 (locationCode 결과와 같은 모양) */
export const LOCATION_CODE_RE = /^[A-Z][A-Z0-9]{1,9}-R\d{2,3}-\d{1,2}-\d{1,2}$/;

export function locationCode(warehouseCode: string, rackNumber: number, level: number, bin: number): string {
  return `${warehouseCode}-${rackCode(rackNumber)}-${level}-${bin}`;
}

/** 기존 창고코드 목록에서 해당 유형의 다음 코드 (RF1, RF2 있으면 RF3) */
export function nextWarehouseCode(type: StorageTypeCode, existingCodes: string[]): string {
  const prefix = STORAGE_TYPE_PREFIX[type];
  const re = new RegExp(`^${prefix}(\\d+)$`);
  const max = existingCodes.reduce((m, c) => {
    const hit = re.exec(c);
    return hit ? Math.max(m, Number(hit[1])) : m;
  }, 0);
  return `${prefix}${max + 1}`;
}

/** 창고코드 → 기본 창고명 (RF3 → 냉장 3창고) */
export function defaultWarehouseName(type: StorageTypeCode, code: string): string {
  const n = /(\d+)$/.exec(code)?.[1];
  return n ? `${STORAGE_TYPE_LABELS[type]} ${Number(n)}창고` : `${STORAGE_TYPE_LABELS[type]}창고`;
}
