"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import {
  addBarcodeAction,
  listBarcodesAction,
  removeBarcodeAction,
  setProductActiveAction,
  updateProductAction,
  type ProductReviewState,
  type ProductUpdateState,
} from "@/modules/product/actions";
import { productVersion } from "@/modules/product/validation";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { BARCODE_UNITS, BARCODE_UNIT_LABELS } from "@/modules/product/barcode";
import BarcodeScanButton from "@/components/BarcodeScanButton";
import { PICK_POLICIES, PICK_POLICY_LABELS, STORAGE_TEMPS, STORAGE_TEMP_LABELS, type PickPolicyCode, type StorageTempCode } from "@/modules/product/storage";

const initialReview: ProductReviewState = { status: "idle", message: "" };
const initialUpdate: ProductUpdateState = { status: "idle", message: "" };

export type ManageProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  storageTemp: StorageTempCode;
  price: number;
  baseUnit: string;
  boxQty: number;
  safetyStock: number;
  pickPolicy: PickPolicyCode;
  status: "PENDING" | "ACTIVE" | "INACTIVE";
};

/** 상품 행의 [수정]·[비활성화/다시 사용] (관리자) */
export default function ProductManageButtons({ product, showPrice }: { product: ManageProduct; showPrice: boolean }) {
  const [open, setOpen] = useState<"edit" | "active" | "barcode" | null>(null);
  const [flash, setFlash] = useState("");
  const inactive = product.status === "INACTIVE";
  const done = (m: string) => {
    setFlash(m);
    setOpen(null);
  };

  return (
    <div className="flex items-center justify-center gap-1">
      {!inactive && (
        <Button variant="outline" size="xs" onClick={() => setOpen("edit")}>
          수정
        </Button>
      )}
      {product.status === "ACTIVE" && (
        <Button variant="outline" size="xs" onClick={() => setOpen("barcode")}>
          바코드
        </Button>
      )}
      {product.status !== "PENDING" && (
        <Button variant="outline" size="xs" onClick={() => setOpen("active")}>
          {inactive ? "다시 사용" : "비활성화"}
        </Button>
      )}
      {flash && <span className="text-xs text-green-700">{flash}</span>}
      {open === "edit" && <EditDialog product={product} showPrice={showPrice} onClose={() => setOpen(null)} onDone={done} />}
      {open === "barcode" && <BarcodeDialog product={product} onClose={() => setOpen(null)} />}
      {open === "active" && <ActiveDialog product={product} onClose={() => setOpen(null)} onDone={done} />}
    </div>
  );
}

function EditDialog({
  product,
  showPrice,
  onClose,
  onDone,
}: {
  product: ManageProduct;
  showPrice: boolean;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const [state, action, pending] = useActionState(updateProductAction, initialUpdate);
  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);
  const err = state.errors ?? {};
  const isBox = product.baseUnit === "BOX";
  const canPrice = showPrice && product.status === "ACTIVE";

  return (
    <Modal title="상품 수정" onClose={onClose} closeDisabled={pending}>
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
        <input type="hidden" name="version" value={productVersion(product)} />
        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          [{product.sku}] <span className="text-muted-foreground">품목코드·기본단위({product.baseUnit})·유통기한 관리는 수정할 수 없습니다.</span>
        </div>
        <label className="text-sm">
          품명 <span className="text-red-600">*</span>
          <Input name="name" defaultValue={product.name} maxLength={100} className="w-full" autoFocus />
          {err.name && <span className="mt-1 block text-xs text-red-600">{err.name}</span>}
        </label>
        <label className="text-sm">
          분류 <span className="text-red-600">*</span>
          <Input name="category" defaultValue={product.category} maxLength={50} className="w-full" />
          {err.category && <span className="mt-1 block text-xs text-red-600">{err.category}</span>}
        </label>
        <label className="text-sm">
          보관 온도 <span className="text-red-600">*</span>
          <NativeSelect name="storageTemp" defaultValue={product.storageTemp} className="w-full">
            {STORAGE_TEMPS.map((t) => (
              <option key={t} value={t}>
                {STORAGE_TEMP_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
          {err.storageTemp && <span className="mt-1 block text-xs text-red-600">{err.storageTemp}</span>}
        </label>
        {canPrice ? (
          <label className="text-sm">
            판매가 (원)
            <Input name="price" type="number" min={0} step={1} defaultValue={product.price} className="w-full text-right tabular-nums" />
            {err.price && <span className="mt-1 block text-xs text-red-600">{err.price}</span>}
          </label>
        ) : (
          <input type="hidden" name="price" value={product.price} />
        )}
        {!isBox && (
          <label className="text-sm">
            박스당 입수 ({product.baseUnit})
            <Input name="boxQty" type="number" min={1} step={1} defaultValue={product.boxQty} className="w-full text-right tabular-nums" />
            {err.boxQty && <span className="mt-1 block text-xs text-red-600">{err.boxQty}</span>}
          </label>
        )}
        <label className="text-sm">
          안전재고 <span className="text-red-600">*</span>
          <Input name="safetyStock" type="number" min={0} step={1} defaultValue={product.safetyStock} className="w-full text-right tabular-nums" />
          {err.safetyStock && <span className="mt-1 block text-xs text-red-600">{err.safetyStock}</span>}
        </label>
        <label className="text-sm">
          출고 순서 <span className="text-red-600">*</span>
          <NativeSelect name="pickPolicy" defaultValue={product.pickPolicy} className="w-full">
            {PICK_POLICIES.map((p) => (
              <option key={p} value={p}>
                {PICK_POLICY_LABELS[p]}
              </option>
            ))}
          </NativeSelect>
          <span className="mt-1 block text-xs text-muted-foreground">자동 출고 때 어느 재고부터 뺄지 정합니다. 유통기한이 있는 상품은 유통기한 임박 우선을 권장합니다.</span>
          {err.pickPolicy && <span className="mt-1 block text-xs text-red-600">{err.pickPolicy}</span>}
        </label>
        {state.status === "error" && (
          <p aria-live="polite" className="text-sm text-red-600">
            {state.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "저장 중..." : "저장"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ActiveDialog({
  product,
  onClose,
  onDone,
}: {
  product: ManageProduct;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const [state, action, pending] = useActionState(setProductActiveAction, initialReview);
  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);
  const reactivate = product.status === "INACTIVE";

  return (
    <Modal title={reactivate ? "상품 다시 사용" : "상품 비활성화"} onClose={onClose} closeDisabled={pending}>
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
        <input type="hidden" name="mode" value={reactivate ? "active" : "inactive"} />
        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          [{product.sku}] <span className="font-medium">{product.name}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {reactivate
            ? "다시 사용하면 상품 목록에 표시되고 입고·출고·주문에 쓸 수 있습니다. 보관위치는 새로 지정해야 합니다."
            : "비활성화하면 목록에서 숨겨지고 입고·출고·주문·위치 배정에 쓸 수 없습니다. 재고·대기 입출고·진행 중 주문이 없어야 하며, 기본 보관위치는 해제됩니다. 이력은 그대로 남습니다."}
        </p>
        {state.status === "error" && (
          <p aria-live="polite" className="text-sm text-red-600">
            {state.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button type="submit" variant={reactivate ? "default" : "destructive"} disabled={pending}>
            {pending ? "처리 중..." : reactivate ? "다시 사용" : "비활성화"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type BarcodeRow = { id: string; code: string; unit: "BASE" | "BOX" };

/** 상품 바코드 관리 (낱개·박스 여러 개). 스캐너로 입력창에 스캔하거나 카메라로 읽는다 */
function BarcodeDialog({ product, onClose }: { product: ManageProduct; onClose: () => void }) {
  const [rows, setRows] = useState<BarcodeRow[] | null>(null);
  const [addState, addAction, adding] = useActionState(addBarcodeAction, initialReview);
  const [rmState, rmAction, removing] = useActionState(removeBarcodeAction, initialReview);
  const [code, setCode] = useState("");
  const canBox = product.baseUnit !== "BOX" && product.boxQty > 1;

  // 열릴 때와 등록·삭제가 끝날 때마다 목록을 다시 읽는다
  useEffect(() => {
    let alive = true;
    listBarcodesAction(product.id).then((r) => alive && r && setRows(r));
    return () => {
      alive = false;
    };
  }, [product.id, addState, rmState]);
  // 등록 성공 시 입력창 비우기 (렌더 중 1회 갱신)
  const [handledTs, setHandledTs] = useState<number | undefined>();
  if (addState.status === "success" && addState.ts !== handledTs) {
    setHandledTs(addState.ts);
    setCode("");
  }

  const state = addState.ts && (!rmState.ts || addState.ts > rmState.ts) ? addState : rmState;

  return (
    <Modal title="바코드 관리" onClose={onClose} closeDisabled={adding || removing}>
      <div className="flex flex-col gap-4 text-left">
        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          [{product.sku}] <span className="font-medium">{product.name}</span>
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          {rows === null && <li className="text-muted-foreground">불러오는 중...</li>}
          {rows?.length === 0 && <li className="text-muted-foreground">등록된 바코드가 없습니다.</li>}
          {rows?.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-md border px-3 py-1.5">
              <span>
                <span className="mr-2 text-xs text-muted-foreground">{BARCODE_UNIT_LABELS[b.unit]}</span>
                <span className="tabular-nums">{b.code}</span>
              </span>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (removing) return;
                  startTransition(() => rmAction(new FormData(e.currentTarget)));
                }}
              >
                <input type="hidden" name="barcodeId" value={b.id} />
                <Button type="submit" variant="outline" size="xs" disabled={removing}>
                  삭제
                </Button>
              </form>
            </li>
          ))}
        </ul>
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (adding) return;
            startTransition(() => addAction(new FormData(e.currentTarget)));
          }}
        >
          <input type="hidden" name="productId" value={product.id} />
          <div className="flex gap-2">
            <NativeSelect name="unit" aria-label="바코드 단위" defaultValue="BASE" className="w-24 shrink-0">
              {BARCODE_UNITS.filter((u) => u === "BASE" || canBox).map((u) => (
                <option key={u} value={u}>
                  {BARCODE_UNIT_LABELS[u]}
                </option>
              ))}
            </NativeSelect>
            <Input
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={40}
              placeholder="바코드 입력 또는 스캔"
              className="w-full"
              autoFocus
            />
            <BarcodeScanButton onScan={setCode} label="카메라" />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={adding || !code.trim()}>
              {adding ? "등록 중..." : "등록"}
            </Button>
          </div>
        </form>
        {state.status !== "idle" && (
          <p aria-live="polite" className={`text-sm ${state.status === "error" ? "text-red-600" : "text-green-700"}`}>
            {state.message}
          </p>
        )}
      </div>
    </Modal>
  );
}
