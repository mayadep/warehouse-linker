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
