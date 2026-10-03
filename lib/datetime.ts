// 입고일시는 한국시간(KST, UTC+9) 기준으로 입력/표시한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// <input type="datetime-local"> 형식: 2026-10-01T09:30 (초 생략 가능)
const DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** Date → "YYYY-MM-DDTHH:mm" (KST, 분 단위) */
export function toKstDateTimeLocal(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm[:ss]" (KST) → Date, 형식이 틀리면 null */
export function parseKstDateTimeLocal(raw: string): Date | null {
  if (!DATETIME_LOCAL_RE.test(raw)) return null;
  const d = new Date(`${raw}${raw.length === 16 ? ":00" : ""}+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Date → "YYYY-MM-DD" (KST 날짜) */
export function toKstDate(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" (KST) → 그 날짜 KST 자정의 Date, 형식이 틀리면 null */
export function parseKstDate(raw: string): Date | null {
  if (!DATE_RE.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) || toKstDate(d) !== raw ? null : d;
}

/**
 * 시각 없는 날짜(유통기한 등, DB DATE 컬럼). Prisma 는 DATE 를 UTC 자정 Date 로 주고받으므로
 * 문자열 "YYYY-MM-DD" 를 그대로 UTC 자정으로 변환한다 (시간대 계산 없음)
 */
export function isDateOnly(raw: string): boolean {
  if (!DATE_RE.test(raw)) return false;
  const d = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}
export const dateOnlyToDb = (s: string) => new Date(`${s}T00:00:00Z`);
export const dbToDateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** 오늘 KST 날짜 "YYYY-MM-DD" */
export function todayKst(now = new Date()): string {
  return toKstDate(now);
}

const KST_NOW_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 헤더 표시용 현재 시각 (KST): "2026.10.02 (금) 15:24" */
export function formatKstNow(now = new Date()): string {
  const p = Object.fromEntries(KST_NOW_FMT.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}.${p.month}.${p.day} (${p.weekday}) ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}
