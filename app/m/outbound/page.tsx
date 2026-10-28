import { connection } from "next/server";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { searchProductsForOutbound } from "@/modules/outbound/service";
import { listPartnerOptions } from "@/modules/partner/service";
import OutboundForm from "@/app/(pc)/outbound/OutboundForm";

/** 현장 출고 등록: PC 출고 폼(스캔 선택 포함)을 그대로 쓴다. 내역 표는 PC 화면에서 확인 */
export default async function MobileOutboundPage() {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "outbound.create")) return <Forbidden title="출고" />;
  const showPrice = can(user.role, "price.view");
  const [{ rows, total }, customers] = await Promise.all([searchProductsForOutbound(), listPartnerOptions("CUSTOMER")]);
  // 금액 권한이 없으면 판매가를 내려주지 않음
  const products = rows.map((p) => ({ ...p, price: showPrice ? p.price : null }));
  return (
    <div className="flex flex-col gap-3 [&_form]:!grid-cols-1 [&_form>*]:!col-span-1">
      <h2 className="text-xl font-semibold">출고 등록</h2>
      <OutboundForm products={products} productTotal={total} customers={customers} showPrice={showPrice} />
      {!can(user.role, "outbound.manage") && (
        <p className="text-xs text-muted-foreground">등록한 출고는 관리자가 확정하면 재고에서 차감됩니다.</p>
      )}
    </div>
  );
}
