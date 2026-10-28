"use server";

import { revalidatePath } from "next/cache";
import { authorize, NO_PERMISSION_MESSAGE } from "@/modules/user/auth";
import { BucketStockError, InsufficientStockError } from "@/modules/stock/service";
import {
  parseCountCreateForm,
  parseCountFoundForm,
  parseCountLineForm,
  parseCountTransitionForm,
} from "./validation";
import { addFoundLine, cancelCycleCount, confirmCycleCount, CountError, createCycleCount, saveCount } from "./service";

export type CountActionState = {
  /** confirm: 같은 칸을 세는 다른 진행 중 실사표가 있어 사용자 확인이 필요 (아직 안 만들어짐) */
  status: "idle" | "success" | "error" | "confirm";
  message: string;
  overlaps?: { id: string; countNo: string; createdByName: string | null; lines: number }[];
  /** 생성 성공 시 이동할 실사표 */
  countId?: string;
  ts?: number;
};

const fail = (message: string): CountActionState => ({ status: "error", message, ts: Date.now() });

async function run(fn: () => Promise<CountActionState>): Promise<CountActionState> {
  try {
    const r = await fn();
    revalidatePath("/counts", "layout");
    if (r.status === "success") revalidatePath("/stock");
    return r;
  } catch (e) {
    if (e instanceof CountError || e instanceof BucketStockError || e instanceof InsufficientStockError) return fail(e.message);
    console.error("[cyclecount] failed", e);
    return fail("처리 중 오류가 발생했습니다. 다시 시도하세요.");
  }
}

/** 실사표 만들기 */
export async function createCountAction(_p: CountActionState, fd: FormData): Promise<CountActionState> {
  const user = await authorize("count.manage");
  if (!user) return fail(NO_PERMISSION_MESSAGE);
  const parsed = parseCountCreateForm(fd);
  if (!parsed.ok) return fail(parsed.message);
  return run(async () => {
    const r = await createCycleCount(parsed.data, user);
    if (r.overlaps) {
      return {
        status: "confirm",
        message: "같은 칸을 세는 다른 진행 중 실사표가 있습니다. 담당자와 조율한 뒤 그래도 만들지 선택하세요.",
        overlaps: r.overlaps,
        ts: Date.now(),
      };
    }
    return { status: "success", message: r.duplicated ? "이미 만든 실사표입니다." : "실사표를 만들었습니다.", countId: r.id, ts: Date.now() };
  });
}

/** 실사 수량 입력 (한 줄) */
export async function saveCountAction(_p: CountActionState, fd: FormData): Promise<CountActionState> {
  const user = await authorize("count.manage");
  if (!user) return fail(NO_PERMISSION_MESSAGE);
  const parsed = parseCountLineForm(fd);
  if (!parsed.ok) return fail(parsed.message);
  return run(async () => {
    await saveCount(parsed.data, user);
    return { status: "success", message: "저장했습니다.", ts: Date.now() };
  });
}

/** 발견분(실사표에 없던 재고) 추가 */
export async function addFoundAction(_p: CountActionState, fd: FormData): Promise<CountActionState> {
  const user = await authorize("count.manage");
  if (!user) return fail(NO_PERMISSION_MESSAGE);
  const parsed = parseCountFoundForm(fd);
  if (!parsed.ok) return fail(parsed.message);
  return run(async () => {
    const p = await addFoundLine(parsed.data, user);
    return { status: "success", message: `[${p.sku}] ${p.name} 발견분을 추가했습니다.`, ts: Date.now() };
  });
}

/** 실사 확정 (관리자): 센 줄의 차이를 재고에 반영 */
export async function confirmCountAction(_p: CountActionState, fd: FormData): Promise<CountActionState> {
  const user = await authorize("count.confirm");
  if (!user) return fail(NO_PERMISSION_MESSAGE);
  const parsed = parseCountTransitionForm(fd);
  if (!parsed.ok) return fail(parsed.message);
  return run(async () => {
    const r = await confirmCycleCount(parsed.data, user);
    return {
      status: "success",
      message: `${r.countNo} 확정: ${r.adjusted.toLocaleString()}줄 조정 (+${r.plus.toLocaleString()} / -${r.minus.toLocaleString()}), 미실사 ${r.skipped.toLocaleString()}줄은 반영하지 않았습니다.`,
      ts: Date.now(),
    };
  });
}

/** 실사 취소 */
export async function cancelCountAction(_p: CountActionState, fd: FormData): Promise<CountActionState> {
  const user = await authorize("count.manage");
  if (!user) return fail(NO_PERMISSION_MESSAGE);
  const parsed = parseCountTransitionForm(fd);
  if (!parsed.ok) return fail(parsed.message);
  return run(async () => {
    const r = await cancelCycleCount(parsed.data);
    return { status: "success", message: `${r.countNo}을(를) 취소했습니다.`, ts: Date.now() };
  });
}
