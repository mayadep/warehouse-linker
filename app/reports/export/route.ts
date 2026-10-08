import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { parseReportFilter } from "@/modules/report/validation";
import { getReportSummary, listReportDetail } from "@/modules/report/queries";
import {
  REPORT_GROUP_LABELS,
  REPORT_KIND_LABELS,
  REPORT_LIMITS,
  REPORT_PARTNER_LABELS,
} from "@/modules/report/codes";

export const dynamic = "force-dynamic";

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

const NUM = "#,##0";

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF315EEA" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function GET(req: NextRequest) {
  // 권한은 서버에서 다시 확인 (메뉴 숨김에 의존하지 않음)
  const user = await getCurrentUser();
  if (!user) return text("로그인이 필요합니다.", 401);
  if (!can(user.role, "admin")) return text("권한이 없습니다. 로그인 상태와 계정 권한을 확인하세요.", 403);

  const f = parseReportFilter(Object.fromEntries(req.nextUrl.searchParams));
  if (f.error) return text(f.error, 400);

  const [summary, detail] = await Promise.all([getReportSummary(f), listReportDetail(f)]);
  if (detail.length > REPORT_LIMITS.maxDetailRows) {
    return text(`내보낼 내역이 ${REPORT_LIMITS.maxDetailRows.toLocaleString()}건을 넘습니다. 기간을 줄여 다시 시도하세요.`, 400);
  }

  const kindLabel = REPORT_KIND_LABELS[f.kind];
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const ws = wb.addWorksheet(`${REPORT_GROUP_LABELS[f.group]} 집계`);
  const head = {
    day: ["일자", "건수", "금액(원)"],
    product: ["상품코드", "상품명", "단위", "건수", "수량", "금액(원)"],
    partner: [REPORT_PARTNER_LABELS[f.kind], "건수", "금액(원)"],
  }[f.group];
  ws.addRow(head);
  for (const r of summary.rows) {
    if (f.group === "product") ws.addRow([r.code, r.label, r.unit, r.count, r.quantity, r.amount]);
    else ws.addRow([r.label, r.count, r.amount]);
  }
  const total = ws.addRow(f.group === "product" ? ["합계", "", "", summary.totalCount, "", summary.totalAmount] : ["합계", summary.totalCount, summary.totalAmount]);
  total.font = { bold: true };
  styleHeader(ws);
  const numCols = f.group === "product" ? [4, 5, 6] : [2, 3];
  for (const c of numCols) {
    ws.getColumn(c).numFmt = NUM;
    ws.getColumn(c).alignment = { horizontal: "right" };
  }
  ws.columns.forEach((c, i) => (c.width = i === 1 && f.group === "product" ? 30 : 16));
  if (summary.noPriceCount > 0) {
    ws.addRow([]);
    ws.addRow([`※ 단가가 없는 ${summary.noPriceCount.toLocaleString()}건은 금액에 포함되지 않았습니다.`]);
  }

  const wd = wb.addWorksheet(`${kindLabel} 내역`);
  wd.addRow(["일시", "상품코드", "상품명", "수량", "단위", "단가(원)", "금액(원)", REPORT_PARTNER_LABELS[f.kind], "비고"]);
  for (const r of detail) wd.addRow([r.at, r.code, r.name, r.quantity, r.unit, r.unitPrice, r.amount, r.partner, r.memo]);
  styleHeader(wd);
  [4, 6, 7].forEach((c) => {
    wd.getColumn(c).numFmt = NUM;
    wd.getColumn(c).alignment = { horizontal: "right" };
  });
  [18, 14, 30, 10, 8, 12, 14, 20, 30].forEach((w, i) => (wd.getColumn(i + 1).width = w));

  const buf = await wb.xlsx.writeBuffer();
  const filename = `${kindLabel}_${REPORT_GROUP_LABELS[f.group]}_${f.from}_${f.to}.xlsx`;
  return new Response(buf as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
}
