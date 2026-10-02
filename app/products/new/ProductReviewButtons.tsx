"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import {
  confirmProductAction,
  rejectProductAction,
  type ProductReviewState,
} from "@/modules/product/actions";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: ProductReviewState = { status: "idle", message: "" };

/** 확정 대기 상품의 [확정]·[반려] (관리자) */
export default function ProductReviewButtons({ product }: { product: { id: string; sku: string; name: string } }) {
  const [open, setOpen] = useState<"confirm" | "reject" | null>(null);
  const [flash, setFlash] = useState("");

  return (
    <div className="flex items-center justify-center gap-1">
      <Button size="xs" onClick={() => setOpen("confirm")}>
        확정
      </Button>
      <Button variant="outline" size="xs" onClick={() => setOpen("reject")}>
        반려
      </Button>
      {flash && <span className="text-xs text-green-700">{flash}</span>}
      {open && (
        <ReviewDialog
          kind={open}
          product={product}
          onClose={() => setOpen(null)}
          onDone={(m) => {
            setFlash(m);
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function ReviewDialog({
  kind,
  product,
  onClose,
  onDone,
}: {
  kind: "confirm" | "reject";
  product: { id: string; sku: string; name: string };
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const [state, action, pending] = useActionState(kind === "confirm" ? confirmProductAction : rejectProductAction, initial);
  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);

  return (
    <Modal title={kind === "confirm" ? "상품 등록 확정" : "상품 등록 반려"} onClose={onClose} closeDisabled={pending}>
      <form
        noValidate
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const fd = new FormData(e.currentTarget);
          startTransition(() => action(fd));
        }}
      >
        <input type="hidden" name="productId" value={product.id} />
        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          [{product.sku}] <span className="font-medium">{product.name}</span>
        </div>
        {kind === "confirm" ? (
          <label className="text-sm">
            판매가 (원) <span className="text-red-600">*</span>
            <Input name="price" type="number" min={0} step={1} className="w-full text-right tabular-nums" autoFocus />
            <span className="mt-1 block text-xs text-muted-foreground">확정하면 입고·출고·주문에 사용할 수 있습니다.</span>
          </label>
        ) : (
          <label className="text-sm">
            반려 사유 <span className="text-red-600">*</span>
            <Input name="reason" maxLength={200} className="w-full" placeholder="예: 중복 상품 (SAU-001과 동일)" autoFocus />
            <span className="mt-1 block text-xs text-muted-foreground">반려하면 상품이 삭제되며, 기록은 로그에 남습니다.</span>
          </label>
        )}
        {state.status === "error" && (
          <p aria-live="polite" className="text-sm text-red-600">
            {state.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button type="submit" variant={kind === "confirm" ? "default" : "destructive"} disabled={pending}>
            {pending ? "처리 중..." : kind === "confirm" ? "확정" : "반려(삭제)"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
