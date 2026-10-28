// 보관 온도 (prisma enum StorageTemp 와 동일하게 유지)
export const STORAGE_TEMPS = ["AMBIENT", "CHILLED", "FROZEN"] as const;
export type StorageTempCode = (typeof STORAGE_TEMPS)[number];

export const STORAGE_TEMP_LABELS: Record<StorageTempCode, string> = {
  AMBIENT: "상온",
  CHILLED: "냉장",
  FROZEN: "냉동",
};

export function isStorageTemp(v: string): v is StorageTempCode {
  return (STORAGE_TEMPS as readonly string[]).includes(v);
}

// 자동 출고 순서 (prisma enum PickPolicy 와 동일하게 유지)
export const PICK_POLICIES = ["FIFO", "FEFO"] as const;
export type PickPolicyCode = (typeof PICK_POLICIES)[number];

export const PICK_POLICY_LABELS: Record<PickPolicyCode, string> = {
  FIFO: "선입선출(입고일순)",
  FEFO: "유통기한 임박 우선",
};

export function isPickPolicy(v: string): v is PickPolicyCode {
  return (PICK_POLICIES as readonly string[]).includes(v);
}
