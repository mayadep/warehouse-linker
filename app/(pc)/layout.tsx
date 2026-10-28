import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { getCurrentUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { countExpiryAlerts, countShortStock } from "@/modules/stock/queries";
import { formatKstNow } from "@/lib/datetime";

/** PC 업무 화면 틀: 사이드바 + 헤더. 권한 확인은 각 페이지에서 한다 (세션이 없으면 페이지가 /login 으로 보낸다) */
export default async function PcLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;
  // 헤더 알림(재고 없음·부족 수)과 오늘 날짜(KST). 재고 조회 권한이 없으면 조회하지 않는다
  const canViewStock = can(user.role, "stock.view");
  const [alertCount, expiryAlert] = canViewStock
    ? await Promise.all([countShortStock(), countExpiryAlerts()])
    : [0, { expired: 0, soon: 0, total: 0 }];
  const nowText = formatKstNow();

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          user={{ name: user.name, role: user.role }}
          nowText={nowText}
          canViewStock={canViewStock}
          alertCount={alertCount}
          expiryAlert={expiryAlert}
        />
        <main className="flex-1 p-6 mobile:p-4">
          <div className="max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
