"use server";

import { revalidatePath } from "next/cache";
import { authorize, NO_PERMISSION_MESSAGE } from "@/modules/user/auth";
import {
  parseProductActiveForm,
  parseProductConfirmForm,
  parseProductForm,
  parseProductRejectForm,
  parseProductUpdateForm,
  type ProductFieldErrors,
  type ProductUpdateFieldErrors,
} from "./validation";
import {
  confirmProduct,
  createProduct,
  DuplicateSkuError,
  ProductError,
  rejectProduct,
  setProductActive,
  updateProduct,
} from "./service";

export type ProductActionState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: ProductFieldErrors;
  /** 매 응답마다 바뀌는 값 (클라이언트에서 폼 초기화 트리거용) */
  ts?: number;
};

export async function createProductAction(
  _prev: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  const actor = await authorize("product.create");
  if (!actor) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };

  const parsed = parseProductForm(formData);
  if (!parsed.ok) {
    return { status: "error", message: "입력값을 확인하세요.", errors: parsed.errors, ts: Date.now() };
  }

  try {
    const p = await createProduct(parsed.data, actor);
    revalidatePath("/products/new");
    revalidatePath("/inbound"); // 입고 화면 상품 목록에도 반영
    return {
      status: "success",
      message: p.confirmed
        ? `[${p.sku}] ${p.name} 등록 완료`
        : `[${p.sku}] ${p.name} 등록 완료 — 관리자가 확정하면 입고에 사용할 수 있습니다.`,
      ts: Date.now(),
    };
  } catch (e) {
    if (e instanceof DuplicateSkuError) {
      return {
        status: "error",
        message: e.message,
        errors: { sku: "이미 등록된 품목코드입니다." },
        ts: Date.now(),
      };
    }
    console.error("[product] create failed", e);
    return { status: "error", message: "상품 등록 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

export type ProductReviewState = { status: "idle" | "success" | "error"; message: string; ts?: number };

async function review(fn: () => Promise<string>): Promise<ProductReviewState> {
  try {
    const message = await fn();
    revalidatePath("/products/new");
    revalidatePath("/inbound");
    revalidatePath("/outbound");
    revalidatePath("/orders", "layout");
    return { status: "success", message, ts: Date.now() };
  } catch (e) {
    if (e instanceof ProductError) return { status: "error", message: e.message, ts: Date.now() };
    console.error("[product] review failed", e);
    return { status: "error", message: "처리 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

/** 상품 등록 확정 (관리자) */
export async function confirmProductAction(_p: ProductReviewState, fd: FormData): Promise<ProductReviewState> {
  const actor = await authorize("product.confirm");
  if (!actor) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const parsed = parseProductConfirmForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message, ts: Date.now() };
  return review(async () => {
    const p = await confirmProduct(parsed.data, actor);
    return `[${p.sku}] ${p.name} 등록 확정`;
  });
}

/** 상품 등록 반려 = 대기 상품 삭제 (관리자) */
export async function rejectProductAction(_p: ProductReviewState, fd: FormData): Promise<ProductReviewState> {
  if (!(await authorize("product.confirm"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const parsed = parseProductRejectForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message, ts: Date.now() };
  return review(async () => {
    const p = await rejectProduct(parsed.data);
    return `[${p.sku}] ${p.name} 반려(삭제) 완료`;
  });
}

export type ProductUpdateState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: ProductUpdateFieldErrors;
  ts?: number;
};

/** 상품 수정 (관리자): 품명·분류·판매가·박스당 입수·안전재고 */
export async function updateProductAction(_p: ProductUpdateState, fd: FormData): Promise<ProductUpdateState> {
  if (!(await authorize("product.manage"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const parsed = parseProductUpdateForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message, errors: parsed.errors, ts: Date.now() };
  return review(async () => {
    const p = await updateProduct({ ...parsed.data, hasBoxQty: parsed.hasBoxQty });
    return `[${p.sku}] ${p.name} 수정 완료`;
  });
}

/** 상품 비활성화(단종) / 다시 사용 (관리자) */
export async function setProductActiveAction(_p: ProductReviewState, fd: FormData): Promise<ProductReviewState> {
  if (!(await authorize("product.manage"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const parsed = parseProductActiveForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message, ts: Date.now() };
  return review(async () => {
    const p = await setProductActive(parsed.data.productId, parsed.data.active);
    return `[${p.sku}] ${p.name} ${parsed.data.active ? "다시 사용" : "비활성화"} 완료`;
  });
}
