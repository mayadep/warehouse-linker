import Link from "next/link";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { UUID_RE } from "@/lib/form";
import { getWarehouseDetail, listLocationBalances, listOccupiedLocations } from "@/modules/warehouse/service";
import { PRODUCT_UNIT_LABELS } from "@/modules/product/units";
import StorageBadge from "../StorageBadge";
import ActiveToggleButton from "../ActiveToggleButton";
import { Badge } from "@/components/ui/badge";
import RackAddButton from "./RackAddButton";
import RackTable, { type CellStock, type RackRow } from "./RackTable";

export default async function WarehouseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "admin")) return <Forbidden title="창고관리" />;
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [wh, occupied, balances] = await Promise.all([
    getWarehouseDetail(id),
    listOccupiedLocations(id),
    listLocationBalances(id),
  ]);
  if (!wh) notFound();
  const occupiedCells = occupied.map((o) => ({
    code: o.code,
    rackId: o.rackId,
    sku: o.product!.sku,
    name: o.product!.name,
  }));

  // 칸별 재고: 같은 상품의 유통기한별 행은 합친다
  const stockByCode: Record<string, CellStock[]> = {};
  for (const b of balances) {
    const list = (stockByCode[b.location!.code] ??= []);
    const same = list.find((x) => x.sku === b.product.sku);
    if (same) same.quantity += b.quantity;
    else list.push({ sku: b.product.sku, name: b.product.name, quantity: b.quantity, unit: PRODUCT_UNIT_LABELS[b.product.baseUnit] });
  }

  const racks: RackRow[] = wh.racks.map((r) => ({
    id: r.id,
    number: r.number,
    levels: r.levels,
    binsPerLevel: r.binsPerLevel,
    locationCount: r._count.locations,
    isActive: r.isActive,
  }));
  const inactiveRackCount = racks.filter((r) => !r.isActive).length;
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
            {!wh.isActive && <Badge variant="gray">비활성</Badge>}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            랙 {racks.length.toLocaleString()}개{inactiveRackCount > 0 ? ` (비활성 ${inactiveRackCount.toLocaleString()})` : ""} · 구획 {wh._count.locations.toLocaleString()}칸 · 상품 배정 {occupiedCells.length.toLocaleString()}칸
            {wh.memo ? ` · ${wh.memo}` : ""}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <ActiveToggleButton target="warehouse" id={wh.id} label={`${wh.code} ${wh.name}`} isActive={wh.isActive} />
          {wh.isActive && (
            <RackAddButton
              warehouseId={wh.id}
              warehouseCode={wh.code}
              rackCount={racks.length}
              lastRackNumber={lastRackNumber}
            />
          )}
        </div>
      </div>

      {!wh.isActive && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          비활성 창고입니다. 이 창고의 위치는 입고·위치 이동·보관위치 지정·자동 배정에 쓸 수 없고 랙을 추가할 수 없습니다.
        </p>
      )}

      <RackTable
        warehouseCode={wh.code}
        warehouseActive={wh.isActive}
        racks={racks}
        occupied={occupiedCells}
        stockByCode={stockByCode}
      />
    </div>
  );
}
