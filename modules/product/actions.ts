"use server";

import { revalidatePath } from "next/cache";
import { parseProductForm, type ProductFieldErrors } from "./validation";
import { createProduct, DuplicateSkuError } from "./service";

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
  // TODO: 인증/권한 체계 도입 시 여기서 상품등록 권한 확인 (UI에만 의존하지 않음)

  const parsed = parseProductForm(formData);
  if (!parsed.ok) {
    return { status: "error", message: "입력값을 확인하세요.", errors: parsed.errors, ts: Date.now() };
  }

  try {
    const p = await createProduct(parsed.data);
    revalidatePath("/products/new");
    revalidatePath("/inbound"); // 입고 화면 상품 목록에도 반영
    return { status: "success", message: `[${p.sku}] ${p.name} 등록 완료`, ts: Date.now() };
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
