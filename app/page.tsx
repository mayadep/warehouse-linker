import Link from "next/link";
import { connection } from "next/server";
import { AlertTriangleIcon, BoxesIcon, CalendarClockIcon, CheckCircle2Icon, ClipboardListIcon, PackageIcon, TruckIcon } from "lucide-react";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { getPendingCounts, getRecentActivity, getShortProducts, getTodayOverview, type ActivityRow } from "@/modules/dashboard/queries";
import { countExpiryAlerts, EXPIRY_SOON_DAYS } from "@/modules/stock/queries";
import KpiCard, { type KpiDelta } from "@/components/KpiCard";
import EmptyState from "@/components/EmptyState";
import { Card, CardHeader } from "@/components/Card";
import { Badge } from "@/components/ui/badge";

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 전일 대비 증감: 어제 값이 있으면 %, 없으면 건수 차이 */
function deltaOf(today: number, prev: number): KpiDelta {
  const diff = today - prev;
  const direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  if (diff === 0) return { text: "전일과 동일", direction };
  const text = prev > 0 ? `${Math.abs(Math.round((diff / prev) * 100))}% (전일 대비)` : `${Math.abs(diff)}건 (전일 대비)`;
  return { text, direction };
}

function RecentSection({ title, rows, emptyTitle, emptyDesc }: { title: string; rows: ActivityRow[]; emptyTitle: string; emptyDesc: string }) {
  return (
    <Card>
      <CardHeader title={title} />
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDesc} />
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {r.productName}
                {r.partner && <span className="ml-2 text-xs text-muted-foreground">{r.partner}</span>}
              </span>
              <span className="w-24 text-right font-semibold tabular-nums">
                {r.quantity.toLocaleString()} {r.unit}
              </span>
              <span className="w-28 text-right text-xs text-muted-foreground tabular-nums">{timeFmt.format(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function DashboardPage() {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회
  const user = await requirePageUser();
  const canViewStock = can(user.role, "stock.view");
  const isAdmin = can(user.role, "admin");

  const [overview, recent, shortProducts, pending, expiry] = await Promise.all([
    getTodayOverview(),
    getRecentActivity(),
    canViewStock ? getShortProducts() : Promise.resolve([]),
    isAdmin ? getPendingCounts() : Promise.resolve(null),
    canViewStock ? countExpiryAlerts() : Promise.resolve(null),
  ]);
  // 유통기한 알림 (만료 = 빨강, 임박 = 노랑)
  const expiryItems = expiry
    ? [
        { label: "유통기한 만료", count: expiry.expired, href: "/stock?expiry=expired", tone: "bg-danger-soft text-danger-foreground" },
        { label: `유통기한 임박(${EXPIRY_SOON_DAYS}일 이내)`, count: expiry.soon, href: "/stock?expiry=soon", tone: "bg-warning-soft text-warning-foreground" },
      ].filter((p) => p.count > 0)
    : [];
  const shortTotal = overview.outCount + overview.lowCount;
  const pendingItems = pending
    ? [
        { label: "확정 대기 상품", count: pending.products, href: "/products/new" },
        { label: "확정 대기 입고", count: pending.inbounds, href: "/inbound" },
        { label: "확정 대기 출고", count: pending.outbounds, href: "/outbound" },
      ].filter((p) => p.count > 0)
    : [];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">대시보드</h2>
        <p className="mt-1 text-sm text-muted-foreground">오늘의 입출고와 재고 상태를 한눈에 확인할 수 있습니다.</p>
      </div>

      <section aria-label="오늘의 운영 현황" className="mb-6">
        <h3 className="mb-3 text-[15px] font-semibold">오늘의 운영 현황</h3>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard label="입고 건수" value={overview.inToday.toLocaleString()} unit="건" icon={PackageIcon} delta={deltaOf(overview.inToday, overview.inPrev)} href="/inbound" />
          <KpiCard label="출고 건수" value={overview.outToday.toLocaleString()} unit="건" icon={TruckIcon} delta={deltaOf(overview.outToday, overview.outPrev)} href="/outbound" />
          {canViewStock && (
            <>
              <KpiCard label="현재 재고 수량" value={overview.totalStock.toLocaleString()} unit="개" icon={BoxesIcon} note={`${overview.productCount.toLocaleString()}개 품목`} href="/stock" />
              <KpiCard
                label="재고 부족 상품"
                value={shortTotal.toLocaleString()}
                unit="개"
                icon={AlertTriangleIcon}
                tone={overview.outCount > 0 ? "danger" : shortTotal > 0 ? "warning" : "default"}
                note={shortTotal > 0 ? `품절 ${overview.outCount} · 부족 ${overview.lowCount}` : "부족한 상품 없음"}
                href="/stock?status=short"
              />
            </>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {canViewStock && (
          <Card>
            <CardHeader
              title="주요 알림"
              action={
                <Link href="/stock?status=short" className="text-xs text-primary hover:underline">
                  더보기
                </Link>
              }
            />
            {expiryItems.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-2">
                {expiryItems.map((p) => (
                  <li key={p.label}>
                    <Link href={p.href} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${p.tone}`}>
                      <CalendarClockIcon className="size-3.5" aria-hidden="true" />
                      {p.label} {p.count}개 상품
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {pendingItems.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-2">
                {pendingItems.map((p) => (
                  <li key={p.label}>
                    <Link href={p.href} className="flex items-center gap-1.5 rounded-lg bg-warning-soft px-3 py-1.5 text-xs font-medium text-warning-foreground">
                      <ClipboardListIcon className="size-3.5" aria-hidden="true" />
                      {p.label} {p.count}건
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {shortProducts.length === 0 ? (
              <EmptyState icon={CheckCircle2Icon} title="부족한 재고가 없습니다." description="안전재고 이하이거나 품절인 상품이 생기면 여기에 표시됩니다." />
            ) : (
              <ul className="divide-y">
                {shortProducts.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <Badge variant={p.stock <= 0 ? "red" : "amber"}>{p.stock <= 0 ? "품절" : "부족"}</Badge>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                    <span className={`w-24 text-right font-semibold tabular-nums ${p.stock <= 0 ? "text-destructive" : "text-warning"}`}>
                      {p.stock.toLocaleString()} {p.baseUnit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <RecentSection title="최근 입고 내역" rows={recent.inbound} emptyTitle="확정된 입고 내역이 없습니다." emptyDesc="입고가 확정되면 최근 내역이 여기에 표시됩니다." />
        <RecentSection title="최근 출고 내역" rows={recent.outbound} emptyTitle="확정된 출고 내역이 없습니다." emptyDesc="출고가 확정되면 최근 내역이 여기에 표시됩니다." />
      </div>
    </div>
  );
}
