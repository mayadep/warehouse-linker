import { connection } from "next/server";
import bwipjs from "bwip-js/node";
import { prisma } from "@/lib/prisma";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { BARCODE_UNIT_LABELS } from "@/modules/product/barcode";
import PrintButton from "./PrintButton";

const LABEL_LIMIT = 200;

type Label = { key: string; code: string; title: string; sub: string; bcid: string };

/** 숫자 13/8자리는 EAN, 그 외는 Code128 */
function bcidOf(code: string): string {
  if (/^\d{13}$/.test(code)) return "ean13";
  if (/^\d{8}$/.test(code)) return "ean8";
  return "code128";
}

function svgOf(l: Label): string {
  const opts = { scale: 2, height: 10, includetext: true, textxalign: "center" as const };
  try {
    return bwipjs.toSVG({ bcid: l.bcid, text: l.code, ...opts });
  } catch {
    return bwipjs.toSVG({ bcid: "code128", text: l.code, ...opts }); // 체크디지트 불일치 등은 Code128로 대체
  }
}

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[]; q?: string | string[] }>;
}) {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "product.manage")) return <Forbidden title="라벨 출력" />;

  const sp = await searchParams;
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 50) ?? "";
  const type = one(sp.type) === "location" ? "location" : "product";
  const q = one(sp.q);

  let labels: Label[];
  if (type === "product") {
    const rows = await prisma.productBarcode.findMany({
      where: {
        product: {
          status: "ACTIVE",
          ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
        },
      },
      select: { id: true, code: true, unit: true, product: { select: { sku: true, name: true } } },
      orderBy: [{ product: { sku: "asc" } }, { createdAt: "asc" }],
      take: LABEL_LIMIT,
    });
    labels = rows.map((b) => ({
      key: b.id,
      code: b.code,
      title: b.product.name,
      sub: `[${b.product.sku}] ${BARCODE_UNIT_LABELS[b.unit]}`,
      bcid: bcidOf(b.code),
    }));
  } else {
    const rows = await prisma.location.findMany({
      where: q ? { code: { startsWith: q, mode: "insensitive" } } : {},
      select: { id: true, code: true, warehouse: { select: { name: true } } },
      orderBy: { code: "asc" },
      take: LABEL_LIMIT,
    });
    labels = rows.map((l) => ({ key: l.id, code: l.code, title: l.code, sub: l.warehouse.name, bcid: "code128" }));
  }

  const tab = (t: string, label: string) => (
    <a
      href={`/products/labels?type=${t}`}
      className={`rounded-md border px-3 py-1.5 text-sm ${type === t ? "bg-primary text-primary-foreground" : "bg-card"}`}
    >
      {label}
    </a>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-semibold">바코드 라벨 출력</h1>
        <PrintButton />
      </div>
      <form className="flex flex-wrap items-center gap-2 print:hidden" action="/products/labels">
        <input type="hidden" name="type" value={type} />
        {tab("product", "상품 바코드")}
        {tab("location", "위치 바코드")}
        <input
          name="q"
          defaultValue={q}
          placeholder={type === "product" ? "코드·품명 검색" : "위치코드 앞부분 (예: RF1-R01)"}
          className="h-9 w-64 rounded-md border bg-card px-3 text-sm"
        />
        <button className="h-9 rounded-md border bg-card px-3 text-sm">검색</button>
        <span className="text-xs text-gray-500">
          {labels.length}개{labels.length >= LABEL_LIMIT ? ` (최대 ${LABEL_LIMIT}개까지 표시 · 검색어로 좁히세요)` : ""}
        </span>
      </form>
      {labels.length === 0 ? (
        <p className="text-sm text-gray-500">출력할 바코드가 없습니다. 상품 등록 화면의 [바코드]에서 먼저 등록하세요.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2 mobile:grid-cols-2 print:grid-cols-4">
          {labels.map((l) => (
            <div key={l.key} className="break-inside-avoid rounded-md border bg-white p-2 text-center text-black">
              <div className="truncate text-xs font-medium">{l.title}</div>
              <div className="truncate text-[10px] text-gray-600">{l.sub}</div>
              <div className="mx-auto mt-1 w-full [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svgOf(l) }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
