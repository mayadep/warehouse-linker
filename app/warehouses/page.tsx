import Link from "next/link";
import { connection } from "next/server";
import { countProductsWithoutLocation, listWarehouses, suggestWarehouseCodes } from "@/modules/warehouse/service";
import { STORAGE_TYPES, STORAGE_TYPE_LABELS } from "@/modules/warehouse/codes";
import StorageBadge from "./StorageBadge";
import WarehouseCreateButton from "./WarehouseCreateButton";
import AssignLocationsButton from "./AssignLocationsButton";

export default async function WarehousesPage() {
  await connection();
  const [warehouses, suggestions, unassignedCount] = await Promise.all([
    listWarehouses(),
    suggestWarehouseCodes(),
    countProductsWithoutLocation(),
  ]);

  const totalRacks = warehouses.reduce((s, w) => s + w._count.racks, 0);
  const totalLocations = warehouses.reduce((s, w) => s + w._count.locations, 0);

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold">창고관리</h2>
        <WarehouseCreateButton suggestions={suggestions} />
      </div>

      <p className="mb-4 text-sm text-gray-500">
        창고 {warehouses.length}개 · 랙 {totalRacks.toLocaleString()}개 · 구획 {totalLocations.toLocaleString()}칸
        {STORAGE_TYPES.map((t) => {
          const n = warehouses.filter((w) => w.storageType === t).length;
          return n ? ` · ${STORAGE_TYPE_LABELS[t]} ${n}` : "";
        }).join("")}
      </p>

      <AssignLocationsButton unassignedCount={unassignedCount} />

      {warehouses.length === 0 ? (
        <p className="rounded border border-yellow-300 bg-yellow-50 p-4 text-sm">
          등록된 창고가 없습니다. [+ 창고 추가]로 만들거나, 터미널에서 <code>npx prisma db seed</code>를 실행하면 기본 창고 6개가 생성됩니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((w) => (
            <Link
              key={w.id}
              href={`/warehouses/${w.id}`}
              className="rounded-lg border border-gray-200 p-4 hover:border-blue-400 hover:bg-blue-50/30"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-gray-500">{w.code}</span>
                <StorageBadge type={w.storageType} />
              </div>
              <p className="mt-1 text-lg font-semibold">{w.name}</p>
              <p className="mt-2 text-sm text-gray-600">
                랙 {w._count.racks.toLocaleString()}개 · 구획 {w._count.locations.toLocaleString()}칸
              </p>
              <p className="mt-1 text-sm text-gray-600">
                상품 배정 {w.usedLocations.toLocaleString()}칸
                {w._count.locations > 0 && (
                  <span className="text-gray-400"> ({Math.round((w.usedLocations / w._count.locations) * 1000) / 10}%)</span>
                )}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {w.rackConfigs.length === 0
                  ? "랙 없음"
                  : w.rackConfigs.map((c) => `${c.levels}단×${c.binsPerLevel}구획 ${c.count}개`).join(", ")}
              </p>
              {w.memo && <p className="mt-1 truncate text-xs text-gray-500">{w.memo}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
