import { connection } from "next/server";
import { listCategories, listProducts } from "@/modules/product/service";
import ProductForm from "./ProductForm";
import DevBadge from "@/components/DevBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회

  const { q } = await searchParams;
  const keyword = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 50) ?? "";

  const [list, categories] = await Promise.all([
    listProducts(keyword),
    listCategories(),
  ]);

  return (
    <div className="max-w-4xl">
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">상품등록</h2>

      <ProductForm categories={categories} />

      <div className="mt-10 mb-2 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">
          {keyword ? `"${keyword}" 검색 결과` : "등록된 상품"} {list.length}개
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title="상품 수정 기능은 개발 중입니다"
            className="flex cursor-not-allowed items-center gap-1 rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-400"
          >
            상품 수정 <DevBadge />
          </button>
          <button
            type="button"
            disabled
            title="상품 비활성화 기능은 개발 중입니다"
            className="flex cursor-not-allowed items-center gap-1 rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-400"
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

      <div className="overflow-x-auto rounded-lg border">
<table className="w-full text-left text-sm tabular-nums [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2.5">
        <thead>
          <tr className="border-b bg-muted/60 text-xs font-medium text-muted-foreground">
            <th className="py-2">코드</th>
            <th>품명</th>
            <th>분류</th>
            <th>단위</th>
            <th>박스당 입수</th>
            <th>유통기한</th>
            <th className="text-right">판매가</th>
            <th className="text-right">현재고</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr>
              <td colSpan={8} className="py-6 text-center text-gray-400">
                {keyword ? "검색 결과가 없습니다." : "등록된 상품이 없습니다."}
              </td>
            </tr>
          )}
          {list.map((p) => (
            <tr key={p.id} className="border-b">
              <td className="py-2">{p.sku}</td>
              <td>{p.name}</td>
              <td>{p.category}</td>
              <td>{p.baseUnit}</td>
              <td>{p.baseUnit === "BOX" ? "-" : `1BOX = ${p.boxQty}${p.baseUnit}`}</td>
              <td>{p.trackExpiry ? "관리" : "-"}</td>
              <td className="text-right">{p.price.toLocaleString()}</td>
              <td className="text-right">{p.stock.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
</div>
    </div>
  );
}
