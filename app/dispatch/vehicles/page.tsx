import Link from "next/link";
import { connection } from "next/server";
import { listVehicles } from "@/modules/dispatch/service";
import VehicleManager from "./VehicleManager";

export default async function VehiclesPage() {
  await connection();
  const vehicles = await listVehicles();
  return (
    <div className="max-w-5xl">
      <Link href="/dispatch" className="text-sm text-gray-500 hover:underline">‹ 배차관리</Link>
      <h2 className="mt-2 mb-4 text-2xl font-semibold tracking-tight">차량 관리</h2>
      <VehicleManager
        vehicles={vehicles.map((v) => ({
          id: v.id,
          plateNo: v.plateNo,
          storageType: v.storageType,
          driverName: v.driverName,
          driverPhone: v.driverPhone,
          memo: v.memo,
          isActive: v.isActive,
          dispatchCount: v._count.dispatches,
        }))}
      />
    </div>
  );
}
