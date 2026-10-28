import { connection } from "next/server";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { searchProductsForInbound } from "@/modules/inbound/service";
import { listPartnerOptions } from "@/modules/partner/service";
import InboundForm from "@/app/(pc)/inbound/InboundForm";

/** 현장 입고 등록: PC 입고 폼(스캔 선택·로트번호 포함)을 그대로 쓴다. 내역 표는 PC 화면에서 확인 */
export default async function MobileInboundPage() {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "inbound.create")) return <Forbidden title="입고" />;
  const showPrice = can(user.role, "price.view");
  const [{ rows: products, total }, suppliers] = await Promise.all([searchProductsForInbound(), listPartnerOptions("SUPPLIER")]);
  return (
    <div className="flex flex-col gap-3 [&_form]:!grid-cols-1 [&_form>*]:!col-span-1">
      <h2 className="text-xl font-semibold">입고 등록</h2>
      <InboundForm products={products} productTotal={total} suppliers={suppliers} showPrice={showPrice} />
      {!can(user.role, "inbound.manage") && (
        <p className="text-xs text-muted-foreground">등록한 입고는 관리자가 확정하면 재고에 반영됩니다.</p>
      )}
    </div>
  );
}
