// 기간별 리포트 조회 조건 검증 (서버). 기간은 KST 날짜, 종료일 포함
import { parseKstDate, todayKst, toKstDate } from "@/lib/datetime";
import {
  REPORT_GROUPS,
  REPORT_KINDS,
  REPORT_LIMITS,
  type ReportGroup,
  type ReportKind,
} from "./codes";

export const DAY_MS = 24 * 60 * 60 * 1000;

export type ReportFilter = {
  kind: ReportKind;
  group: ReportGroup;
  from: string; // YYYY-MM-DD (KST)
  to: string;
  error: string | null; // 있으면 조회하지 않음
};

/** 오늘 포함 N일 전 날짜 (KST) */
export function kstDaysAgo(days: number, now = new Date()): string {
  return toKstDate(new Date(now.getTime() - days * DAY_MS));
}

export function parseReportFilter(sp: Record<string, string | string[] | undefined>): ReportFilter {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const kind = (REPORT_KINDS as readonly string[]).includes(one("kind")) ? (one("kind") as ReportKind) : "inbound";
  const group = (REPORT_GROUPS as readonly string[]).includes(one("group")) ? (one("group") as ReportGroup) : "day";

  let to = parseKstDate(one("to")) ? one("to") : todayKst();
  let from = parseKstDate(one("from")) ? one("from") : kstDaysAgo(REPORT_LIMITS.defaultDays - 1);
  if (from > to) [from, to] = [to, from]; // YYYY-MM-DD 는 문자열 비교로 날짜순

  const days = Math.round((parseKstDate(to)!.getTime() - parseKstDate(from)!.getTime()) / DAY_MS) + 1;
  const error = days > REPORT_LIMITS.maxDays ? `조회 기간은 최대 ${REPORT_LIMITS.maxDays}일입니다. (선택 ${days}일)` : null;
  return { kind, group, from, to, error };
}

/** 조회 구간 [시작, 종료 다음날 자정) */
export function reportRange(f: Pick<ReportFilter, "from" | "to">): { start: Date; end: Date } {
  return { start: parseKstDate(f.from)!, end: new Date(parseKstDate(f.to)!.getTime() + DAY_MS) };
}
