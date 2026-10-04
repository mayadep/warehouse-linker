import { connection } from "next/server";
import { listCategories, listProducts } from "@/modules/product/service";
import ProductForm from "./ProductForm";
import ProductReviewButtons from "./ProductReviewButtons";
import Forbidden from "@/components/Forbidden";
import { Badge } from "@/components/ui/badge";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import ProductManageButtons from "./ProductManageButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EmptyState from "@/components/EmptyState";
import { PackageIcon } from "lucide-react";
export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; inactive?: string | string[] }>;
}) {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회
  const user = await requirePageUser();
  if (!can(user.role, "product.create")) return <Forbidden title="상품등록" />;
  const showPrice = can(user.role, "price.view");
  const canConfirm = can(user.role, "product.confirm");
  const canManage = can(user.role, "product.manage");

  const { q, inactive } = await searchParams;
  const keyword = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 50) ?? "";
  const includeInactive = (Array.isArray(inactive) ? inactive[0] : inactive) === "1";

  const [list, categories] = await Promise.all([
    listProducts(keyword, includeInactive),
    listCategories(),
  ]);
  const pendingCount = list.filter((p) => p.status === "PENDING").length;
  const colCount = 9 + (showPrice ? 1 : 0) + (canConfirm || canManage ? 1 : 0);

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
    </div>
  );
}
