import { redirect } from "next/navigation";

/** 예전 주소(/orders?type=sales) 호환: 발주/수주 목록으로 이동 */
export default async function OrdersIndex({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const type = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  redirect(type === "sales" ? "/orders/sales" : "/orders/purchase");
}
