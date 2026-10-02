import Link from "next/link";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { UUID_RE } from "@/lib/form";
import { getWarehouseDetail, listOccupiedLocations } from "@/modules/warehouse/service";
import StorageBadge from "../StorageBadge";
import RackAddButton from "./RackAddButton";
import RackTable, { type RackRow } from "./RackTable";

export default async function WarehouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "admin")) return <Forbidden title="창고관리" />;
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [wh, occupied] = await Promise.all([getWarehouseDetail(id), listOccupiedLocations(id)]);
  if (!wh) notFound();
  const occupiedCells = occupied.map((o) => ({
    code: o.code,
    rackId: o.rackId,
    sku: o.product!.sku,
    name: o.product!.name,
  }));

  const racks: RackRow[] = wh.racks.map((r) => ({
    id: r.id,
    number: r.number,
    levels: r.levels,
    binsPerLevel: r.binsPerLevel,
    locationCount: r._count.locations,
  }));
  const lastRackNumber = racks.reduce((m, r) => Math.max(m, r.number), 0);

  return (
    <div>
      <Link href="/warehouses" className="text-sm text-gray-500 hover:underline">
        ‹ 창고 목록
      </Link>
      <div className="mt-2 mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">{wh.name}</h2>
            <span className="font-mono text-sm text-gray-500">{wh.code}</span>
            <StorageBadge type={wh.storageType} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            랙 {racks.length.toLocaleString()}개 · 구획 {wh._count.locations.toLocaleString()}칸 · 상품 배정 {occupiedCells.length.toLocaleString()}칸
            {wh.memo ? ` · ${wh.memo}` : ""}
          </p>
        </div>
        <RackAddButton
          warehouseId={wh.id}
          warehouseCode={wh.code}
          rackCount={racks.length}
          lastRackNumber={lastRackNumber}
        />
      </div>

      <RackTable warehouseCode={wh.code} racks={racks} occupied={occupiedCells} />
    </div>
  );
}
