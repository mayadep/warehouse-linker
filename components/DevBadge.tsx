import { Badge } from "@/components/ui/badge";

/** "개발중" 표시 */
export default function DevBadge({ className = "" }: { className?: string }) {
  return (
    <Badge variant="secondary" className={`text-[10px] ${className}`}>
      개발중
    </Badge>
  );
}