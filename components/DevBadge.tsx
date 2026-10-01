/** "개발중" 표시 */
export default function DevBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 ${className}`}>
      개발중
    </span>
  );
}
