import Link from "next/link";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { connection } from "next/server";
import { countProductsWithoutLocation, listWarehouses, suggestWarehouseCodes } from "@/modules/warehouse/service";
import { STORAGE_TYPES, STORAGE_TYPE_LABELS } from "@/modules/warehouse/codes";
import StorageBadge from "./StorageBadge";
import WarehouseCreateButton from "./WarehouseCreateButton";
import AssignLocationsButton from "./AssignLocationsButton";

export default async function WarehousesPage() {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "admin")) return <Forbidden title="창고관리" />;
  const [warehouses, suggestions, unassignedCount] = await Promise.all([
    listWarehouses(),
    suggestWarehouseCodes(),
    countProductsWithoutLocation(),
  ]);

  const totalRacks = warehouses.reduce((s, w) => s + w._count.racks, 0);
  const totalLocations = warehouses.reduce((s, w) => s + w._count.locations, 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">창고관리</h2>
        <WarehouseCreateButton suggestions={suggestions} />
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        창고 {warehouses.length}개 · 랙 {totalRacks.toLocaleString()}개 · 구획 {totalLocations.toLocaleString()}칸
        {STORAGE_TYPES.map((t) => {
          const n = warehouses.filter((w) => w.storageType === t).length;
          return n ? ` · ${STORAGE_TYPE_LABELS[t]} ${n}` : "";
        }).join("")}
      </p>

      <AssignLocationsButton unassignedCount={unassignedCount} />

      {warehouses.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm">
          등록된 창고가 없습니다. [+ 창고 추가]로 만들거나, 터미널에서 <code>npx prisma db seed</code>를 실행하면 기본 창고 6개가 생성됩니다.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((w) => (
            <Link
              key={w.id}
              href={`/warehouses/${w.id}`}
              className="rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-muted-foreground">{w.code}</span>
                <StorageBadge type={w.storageType} />
              </div>
              <p className="mt-1 text-lg font-semibold">{w.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                랙 {w._count.racks.toLocaleString()}개 · 구획 {w._count.locations.toLocaleString()}칸
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                상품 배정 {w.usedLocations.toLocaleString()}칸
                {w._count.locations > 0 && (
                  <span className="text-muted-foreground"> ({Math.round((w.usedLocations / w._count.locations) * 1000) / 10}%)</span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {w.rackConfigs.length === 0
                  ? "랙 없음"
                  : w.rackConfigs.map((c) => `${c.levels}단×${c.binsPerLevel}구획 ${c.count}개`).join(", ")}
              </p>
              {w.memo && <p className="mt-1 truncate text-xs text-muted-foreground">{w.memo}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
