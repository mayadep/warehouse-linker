import { connection } from "next/server";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { listPartners } from "@/modules/partner/service";
import { toKstDate } from "@/lib/datetime";
import PartnerManager from "./PartnerManager";

export default async function PartnersPage() {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회
  const user = await requirePageUser();
  if (!can(user.role, "admin")) return <Forbidden title="거래처" />;
  const partners = await listPartners();

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">거래처</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          입고·발주의 공급처, 출고·수주의 출고처를 여기서 등록하고 목록에서 선택합니다. 같은 이름은 한 번만 등록할 수 있습니다.
        </p>
      </div>
      <PartnerManager
        partners={partners.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          isActive: p.isActive,
          version: p.version,
          usage: p._count.inbounds + p._count.outbounds + p._count.orders,
          createdAtText: toKstDate(p.createdAt),
        }))}
      />
    </div>
  );
}
