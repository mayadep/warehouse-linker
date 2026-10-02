import Link from "next/link";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { connection } from "next/server";
import { parseKstDate, todayKst, toKstDate } from "@/lib/datetime";
import { DISPATCH_STATUS_LABELS, type DispatchStatusCode } from "@/modules/dispatch/codes";
import { listDispatchesByDate, listUnassignedOutbounds, listVehicles } from "@/modules/dispatch/service";
import { storageTypeForCategory } from "@/modules/warehouse/assign";
import DispatchCard, { type DispatchView } from "./DispatchCard";
import DispatchCreateButton from "./DispatchCreateButton";
import type { OutboundOption } from "./OutboundPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const dtFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type OB = Awaited<ReturnType<typeof listUnassignedOutbounds>>[number];
function toOption(o: OB): OutboundOption {
  return {
    id: o.id,
    shippedAtText: dtFmt.format(o.shippedAt),
    customer: o.customer,
    sku: o.product.sku,
    name: o.product.name,
    quantity: o.quantity,
    baseUnit: o.product.baseUnit,
    required: storageTypeForCategory(o.product.category),
  };
}

function shiftDate(ymd: string, days: number) {
  const d = parseKstDate(ymd)!;
  return toKstDate(new Date(d.getTime() + days * 24 * 60 * 60 * 1000));
}

export default async function DispatchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "admin")) return <Forbidden title="배차관리" />;
  const sp = await searchParams;
  const raw = (Array.isArray(sp.date) ? sp.date[0] : sp.date) ?? "";
  const date = parseKstDate(raw) ? raw : todayKst();
  const day = parseKstDate(date)!;

  const [dispatches, unassigned, vehicles] = await Promise.all([
    listDispatchesByDate(day),
    listUnassignedOutbounds(),
    listVehicles(true),
  ]);
  const options = unassigned.map(toOption);
  const views: DispatchView[] = dispatches.map((d) => ({
    id: d.id,
    dispatchNo: d.dispatchNo,
    version: d.version,
    status: d.status as DispatchStatusCode,
    memo: d.memo,
    deliveredAtText: d.deliveredAt ? dtFmt.format(d.deliveredAt) : null,
    vehicle: {
      plateNo: d.vehicle.plateNo,
      storageType: d.vehicle.storageType,
      driverName: d.vehicle.driverName,
      driverPhone: d.vehicle.driverPhone,
    },
    items: d.items.map((i) => ({ id: i.id, seq: i.seq, outbound: toOption(i.outbound) })),
  }));
  const count = (s: DispatchStatusCode) => views.filter((v) => v.status === s).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">배차관리</h2>
          <Link href="/dispatch/vehicles" className="text-sm text-indigo-700 hover:underline">
            차량 관리 ›
          </Link>
        </div>
        <DispatchCreateButton
          date={date}
          vehicles={vehicles.map((v) => ({ id: v.id, plateNo: v.plateNo, storageType: v.storageType, driverName: v.driverName }))}
          outbounds={options}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/dispatch?date=${shiftDate(date, -1)}`} className="rounded border px-2 py-1 hover:bg-gray-100">‹ 전날</Link>
        <form className="flex items-center gap-2">
          <Input className="h-8" type="date" name="date" defaultValue={date} />
          <Button variant="outline" size="sm" type="submit">이동</Button>
        </form>
        <Link href={`/dispatch?date=${shiftDate(date, 1)}`} className="rounded border px-2 py-1 hover:bg-gray-100">다음날 ›</Link>
        {date !== todayKst() && (
          <Link href="/dispatch" className="px-2 text-gray-500 hover:underline">오늘</Link>
        )}
        <span className="ml-auto text-gray-500">
          배차 {views.length}건
          {(["PLANNED", "LOADED", "IN_TRANSIT", "DELIVERED"] as const)
            .filter((s) => count(s) > 0)
            .map((s) => ` · ${DISPATCH_STATUS_LABELS[s]} ${count(s)}`)
            .join("")}
          {" · "}미배차 출고 {options.length}건
        </span>
      </div>

      {vehicles.length === 0 && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-3 text-sm">
          등록된 차량이 없습니다. <Link href="/dispatch/vehicles" className="text-indigo-700 underline">차량 관리</Link>에서 먼저 차량을 등록하세요.
        </p>
      )}

      {views.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">{date} 배차가 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {views.map((v) => (
            <DispatchCard key={v.id} d={v} unassigned={options} />
          ))}
        </div>
      )}
    </div>
  );
}
