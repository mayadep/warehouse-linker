import { connection } from "next/server";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import LookupClient from "./LookupClient";

export default async function MobileLookupPage() {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "stock.view")) return <Forbidden title="재고 조회" />;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">재고 조회</h2>
      <LookupClient />
    </div>
  );
}
