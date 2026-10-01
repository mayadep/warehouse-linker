import { Badge } from "@/components/ui/badge";
import { STORAGE_TYPE_LABELS, type StorageTypeCode } from "@/modules/warehouse/codes";

const TONE: Record<StorageTypeCode, "sky" | "indigo" | "amber"> = {
  REFRIGERATED: "sky",
  FROZEN: "indigo",
  AMBIENT: "amber",
};

export default function StorageBadge({ type }: { type: StorageTypeCode }) {
  return <Badge variant={TONE[type]}>{STORAGE_TYPE_LABELS[type]}</Badge>;
}