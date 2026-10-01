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

/** 오늘 KST 날짜 "YYYY-MM-DD" */
export function todayKst(now = new Date()): string {
  return toKstDate(now);
}
