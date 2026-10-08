import Link from "next/link";
import { connection } from "next/server";
import { listCategories, listProducts, PRODUCT_PAGE_SIZE } from "@/modules/product/service";
import { STORAGE_TEMP_LABELS } from "@/modules/product/storage";
import ProductForm from "./ProductForm";
import ProductReviewButtons from "./ProductReviewButtons";
import Forbidden from "@/components/Forbidden";
import { Badge } from "@/components/ui/badge";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import ProductManageButtons from "./ProductManageButtons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/EmptyState";
import { ChevronLeftIcon, ChevronRightIcon, PackageIcon } from "lucide-react";

/** 현재 페이지 주변 번호 (1 … 4 5 [6] 7 8 … 20) */
function pageNumbers(page: number, total: number): (number | "…")[] {
  const set = new Set([1, total, page - 2, page - 1, page, page + 1, page + 2]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; inactive?: string | string[]; page?: string | string[] }>;
}) {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회
  const user = await requirePageUser();
  if (!can(user.role, "product.create")) return <Forbidden title="상품등록" />;
  const showPrice = can(user.role, "price.view");
  const canConfirm = can(user.role, "product.confirm");
  const canManage = can(user.role, "product.manage");

  const { q, inactive, page: pageParam } = await searchParams;
  const keyword = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 50) ?? "";
  const includeInactive = (Array.isArray(inactive) ? inactive[0] : inactive) === "1";
  const pageNo = Number((Array.isArray(pageParam) ? pageParam[0] : pageParam)?.trim());

  const [{ rows: list, total, pendingCount, page, totalPages }, categories] = await Promise.all([
    listProducts(keyword, includeInactive, Number.isInteger(pageNo) && pageNo >= 1 ? pageNo : 1),
    listCategories(),
  ]);
  /** 검색어·비활성 포함 조건을 유지한 채 페이지만 바꾼 주소 */
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (keyword) sp.set("q", keyword);
    if (includeInactive) sp.set("inactive", "1");
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/products/new?${qs}` : "/products/new";
  };
  const colCount = 10 + (showPrice ? 1 : 0) + (canConfirm || canManage ? 1 : 0);

  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">상품등록</h2>

      <ProductForm categories={categories} showPrice={showPrice} />
      {!canConfirm && (
        <p className="mt-2 text-xs text-muted-foreground">
          등록한 상품은 관리자가 확정(판매가 입력)한 뒤 입고에 사용할 수 있습니다.
        </p>
      )}

      <div className="mt-10 mb-2 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">
          {keyword ? `"${keyword}" 검색 결과` : "등록된 상품"} {total.toLocaleString()}개
          {total > 0 && ` · ${((page - 1) * PRODUCT_PAGE_SIZE + 1).toLocaleString()}–${Math.min(page * PRODUCT_PAGE_SIZE, total).toLocaleString()} 표시`}
          {pendingCount > 0 && <span className="ml-2 font-medium text-amber-700">확정 대기 {pendingCount.toLocaleString()}개</span>}
        </p>
        <div className="flex items-center gap-2">
          <form className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm text-gray-600">
              <input type="checkbox" name="inactive" value="1" defaultChecked={includeInactive} />
              비활성 포함
            </label>
            <Input className="w-56 text-sm"
              name="q"
              defaultValue={keyword}
              placeholder="코드·품명·분류 검색" />
            <Button variant="outline" size="sm" type="submit">
              검색
            </Button>
          </form>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border">
<table className="data-table">
        <thead>
          <tr>
            <th className="left">코드</th>
            <th className="left">품명</th>
            <th>분류</th>
            <th>보관</th>
            <th>단위</th>
            <th>박스당 입수</th>
            <th>유통기한</th>
            {showPrice && <th className="num">판매가</th>}
            <th className="num">현재고</th>
            <th>상태</th>
            <th>등록자</th>
            {(canConfirm || canManage) && <th>관리</th>}
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr>
              <td colSpan={colCount} className="p-0">
                <EmptyState icon={PackageIcon} title={keyword ? "검색 결과가 없습니다." : "등록된 상품이 없습니다."} description={keyword ? "다른 검색어로 찾아보세요." : "상품을 등록하면 재고 관리가 시작됩니다."} />
              </td>
            </tr>
          )}
          {list.map((p) => (
            <tr key={p.id} className={p.status === "PENDING" ? "bg-amber-50/40" : p.status === "INACTIVE" ? "text-gray-400" : undefined}>
              <td className="left">{p.sku}</td>
              <td className="left">{p.name}</td>
              <td>{p.category}</td>
              <td>{STORAGE_TEMP_LABELS[p.storageTemp]}</td>
              <td>{p.baseUnit}</td>
              <td>{p.baseUnit === "BOX" ? "-" : `1BOX = ${p.boxQty}${p.baseUnit}`}</td>
              <td>{p.trackExpiry ? "관리" : "-"}</td>
              {showPrice && <td className="num">{p.status === "PENDING" ? "-" : p.price.toLocaleString()}</td>}
              <td className="num">{p.stock.toLocaleString()}</td>
              <td>
                <Badge variant={p.status === "PENDING" ? "amber" : p.status === "INACTIVE" ? "gray" : "green"}>{p.status === "PENDING" ? "확정 대기" : p.status === "INACTIVE" ? "비활성" : "확정"}</Badge>
              </td>
              <td className="text-muted-foreground">{p.createdBy?.name ?? "-"}</td>
              {(canConfirm || canManage) && (
                <td>
                  {p.status === "PENDING" ? (
                    canConfirm ? <ProductReviewButtons product={{ id: p.id, sku: p.sku, name: p.name }} /> : "-"
                  ) : canManage ? (
                    <ProductManageButtons
                      product={{
                        id: p.id,
                        sku: p.sku,
                        name: p.name,
                        category: p.category,
                        storageTemp: p.storageTemp,
                        price: p.price,
                        baseUnit: p.baseUnit,
                        boxQty: p.boxQty,
                        safetyStock: p.safetyStock,
                        status: p.status,
                      }}
                      showPrice={showPrice}
                    />
                  ) : (
                    "-"
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
</div>

      {totalPages > 1 && (
        <nav className="mt-5 flex flex-wrap items-center justify-center gap-1" aria-label="페이지">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ChevronLeftIcon data-icon="inline-start" />
              이전
            </Link>
          ) : (
            <span className={buttonVariants({ variant: "outline", size: "sm" }) + " pointer-events-none opacity-50"}>
              <ChevronLeftIcon data-icon="inline-start" />
              이전
            </span>
          )}
          {pageNumbers(page, totalPages).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                …
              </span>
            ) : n === page ? (
              <span key={n} aria-current="page" className={buttonVariants({ size: "sm" }) + " min-w-8 tabular-nums"}>
                {n}
              </span>
            ) : (
              <Link key={n} href={pageHref(n)} className={buttonVariants({ variant: "ghost", size: "sm" }) + " min-w-8 tabular-nums"}>
                {n}
              </Link>
            )
          )}
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              다음
              <ChevronRightIcon data-icon="inline-end" />
            </Link>
          ) : (
            <span className={buttonVariants({ variant: "outline", size: "sm" }) + " pointer-events-none opacity-50"}>
              다음
              <ChevronRightIcon data-icon="inline-end" />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
