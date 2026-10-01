import { STORAGE_TYPE_LABELS, type StorageTypeCode } from "@/modules/warehouse/codes";

const STYLE: Record<StorageTypeCode, string> = {
  REFRIGERATED: "bg-sky-100 text-sky-800",
  FROZEN: "bg-indigo-100 text-indigo-800",
  AMBIENT: "bg-amber-100 text-amber-800",
};

export default function StorageBadge({ type }: { type: StorageTypeCode }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STYLE[type]}`}>
      {STORAGE_TYPE_LABELS[type]}
    </span>
  );
}
