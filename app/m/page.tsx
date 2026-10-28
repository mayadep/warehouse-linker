import Link from "next/link";
import { connection } from "next/server";
import { ClipboardCheckIcon, MonitorIcon, PackageMinusIcon, PackagePlusIcon, SearchIcon, type LucideIcon } from "lucide-react";
import { requirePageUser } from "@/modules/user/auth";
import { can, type Permission } from "@/modules/user/codes";

const MENUS: { href: string; label: string; desc: string; icon: LucideIcon; perm: Permission }[] = [
  { href: "/m/lookup", label: "재고 조회", desc: "상품·위치 바코드를 스캔해 재고 확인", icon: SearchIcon, perm: "stock.view" },
  { href: "/m/inbound", label: "입고", desc: "스캔으로 상품 선택 후 입고 등록", icon: PackagePlusIcon, perm: "inbound.create" },
  { href: "/m/outbound", label: "출고", desc: "스캔으로 상품 선택 후 출고 등록", icon: PackageMinusIcon, perm: "outbound.create" },
  { href: "/m/count", label: "재고 실사", desc: "위치를 스캔하며 실제 수량 입력", icon: ClipboardCheckIcon, perm: "count.manage" },
];

export default async function MobileHubPage() {
  await connection();
  const user = await requirePageUser();
  const menus = MENUS.filter((m) => can(user.role, m.perm));

  return (
    <div className="flex flex-col gap-3">
      {menus.length === 0 && <p className="text-sm text-muted-foreground">사용할 수 있는 현장 메뉴가 없습니다. 관리자에게 권한을 문의하세요.</p>}
      {menus.map((m) => (
        <Link key={m.href} href={m.href} className="flex items-center gap-4 rounded-xl border bg-card p-4 active:bg-muted">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <m.icon className="size-6" />
          </span>
          <span className="flex flex-col">
            <span className="text-lg font-semibold">{m.label}</span>
            <span className="text-sm text-muted-foreground">{m.desc}</span>
          </span>
        </Link>
      ))}
      <Link href="/" className="mt-2 flex items-center justify-center gap-2 rounded-xl border p-3 text-sm text-muted-foreground">
        <MonitorIcon className="size-4" /> PC 화면으로 이동
      </Link>
    </div>
  );
}
