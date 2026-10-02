import { connection } from "next/server";
import { listCategories, listProducts } from "@/modules/product/service";
import ProductForm from "./ProductForm";
import ProductReviewButtons from "./ProductReviewButtons";
import Forbidden from "@/components/Forbidden";
import { Badge } from "@/components/ui/badge";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import DevBadge from "@/components/DevBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회
  const user = await requirePageUser();
  if (!can(user.role, "product.create")) return <Forbidden title="상품등록" />;
  const showPrice = can(user.role, "price.view");
  const canConfirm = can(user.role, "product.confirm");

  const { q } = await searchParams;
  const keyword = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 50) ?? "";

  const [list, categories] = await Promise.all([
    listProducts(keyword),
    listCategories(),
  ]);
  const pendingCount = list.filter((p) => p.status === "PENDING").length;
  const colCount = 9 + (showPrice ? 1 : 0) + (canConfirm ? 1 : 0);

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
          {keyword ? `"${keyword}" 검색 결과` : "등록된 상품"} {list.length}개
          {pendingCount > 0 && <span className="ml-2 font-medium text-amber-700">확정 대기 {pendingCount}개</span>}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title="상품 수정 기능은 개발 중입니다"
            className="flex cursor-not-allowed items-center gap-1 rounded-[6px] border border-gray-200 px-3 py-1.5 text-sm text-gray-400"
          >
            상품 수정 <DevBadge />
          </button>
          <button
            type="button"
            disabled
            title="상품 비활성화 기능은 개발 중입니다"
            className="flex cursor-not-allowed items-center gap-1 rounded-[6px] border border-gray-200 px-3 py-1.5 text-sm text-gray-400"
          >
            비활성화 <DevBadge />
          </button>
          <form className="flex gap-2">
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
            <th>단위</th>
            <th>박스당 입수</th>
            <th>유통기한</th>
            {showPrice && <th className="num">판매가</th>}
            <th className="num">현재고</th>
            <th>상태</th>
            <th>등록자</th>
            {canConfirm && <th>확정</th>}
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr>
              <td colSpan={colCount} className="text-gray-400">
                {keyword ? "검색 결과가 없습니다." : "등록된 상품이 없습니다."}
              </td>
            </tr>
          )}
          {list.map((p) => (
            <tr key={p.id} className={p.status === "PENDING" ? "bg-amber-50/40" : undefined}>
              <td className="left">{p.sku}</td>
              <td className="left">{p.name}</td>
              <td>{p.category}</td>
              <td>{p.baseUnit}</td>
              <td>{p.baseUnit === "BOX" ? "-" : `1BOX = ${p.boxQty}${p.baseUnit}`}</td>
              <td>{p.trackExpiry ? "관리" : "-"}</td>
              {showPrice && <td className="num">{p.status === "PENDING" ? "-" : p.price.toLocaleString()}</td>}
              <td className="num">{p.stock.toLocaleString()}</td>
              <td>
                <Badge variant={p.status === "PENDING" ? "amber" : "green"}>{p.status === "PENDING" ? "확정 대기" : "확정"}</Badge>
              </td>
              <td className="text-muted-foreground">{p.createdBy?.name ?? "-"}</td>
              {canConfirm && (
                <td>
                  {p.status === "PENDING" ? (
                    <ProductReviewButtons product={{ id: p.id, sku: p.sku, name: p.name }} />
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
    </div>
  );
}
