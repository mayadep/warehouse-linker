import DevBadge from "./DevBadge";

/** 개발 예정 화면 안내 */
export default function UnderDevelopment({
  title,
  description,
  planned,
}: {
  title: string;
  description: string;
  planned: string[];
}) {
  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-2">
        <h2 className="text-xl font-bold">{title}</h2>
        <DevBadge />
      </div>
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6">
        <p className="text-sm text-gray-700">{description}</p>
        <p className="mt-4 mb-2 text-xs font-medium text-gray-500">예정 기능</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
          {planned.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
