"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";
import { createPartnerAction, updatePartnerAction, type PartnerActionState } from "@/modules/partner/actions";
import {
  PARTNER_LIMITS,
  PARTNER_TYPES,
  PARTNER_TYPE_LABELS,
  PARTNER_TYPE_TONE,
  partnerAllows,
  type PartnerTypeCode,
} from "@/modules/partner/codes";
import Modal from "@/components/Modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export type PartnerRow = {
  id: string;
  name: string;
  type: PartnerTypeCode;
  isActive: boolean;
  version: number;
  usage: number;
  createdAtText: string;
};

/** 구분 탭: 공급처·출고처 탭은 겸용 거래처도 포함 (입출고 화면의 선택 목록과 같은 기준) */
type TypeTab = "ALL" | "SUPPLIER" | "CUSTOMER" | "BOTH";

const TYPE_TABS: { value: TypeTab; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "SUPPLIER", label: "공급처" },
  { value: "CUSTOMER", label: "출고처" },
  { value: "BOTH", label: "겸용" },
];

function matchesTab(p: PartnerRow, tab: TypeTab): boolean {
  if (tab === "ALL") return true;
  if (tab === "BOTH") return p.type === "BOTH";
  return partnerAllows(p.type, tab);
}

const initial: PartnerActionState = { status: "idle", message: "" };
const errText = "mt-1 block text-xs text-red-600";

type Dialog = { kind: "create" } | { kind: "edit"; partner: PartnerRow } | null;

export default function PartnerManager({ partners }: { partners: PartnerRow[] }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [flash, setFlash] = useState("");
  const [tab, setTab] = useState<TypeTab>("ALL");
  const [query, setQuery] = useState("");
  const done = (message: string) => {
    setFlash(message);
    setDialog(null);
  };

  const keyword = query.trim().toLowerCase();
  const visible = partners.filter((p) => matchesTab(p, tab) && (!keyword || p.name.toLowerCase().includes(keyword)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 mobile:flex-wrap">
        <p className="text-sm text-muted-foreground">
          거래처 <b className="font-semibold text-foreground">{visible.length}</b>곳
          {visible.length !== partners.length && ` (전체 ${partners.length}곳)`}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setFlash("");
            setDialog({ kind: "create" });
          }}
        >
          <PlusIcon data-icon="inline-start" />
          거래처 추가
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <div role="group" aria-label="구분" className="flex flex-wrap gap-1">
          {TYPE_TABS.map((t) => (
            <Button
              key={t.value}
              type="button"
              size="sm"
              variant={tab === t.value ? "default" : "outline"}
              aria-pressed={tab === t.value}
              onClick={() => setTab(t.value)}
            >
              {t.label} {partners.filter((p) => matchesTab(p, t.value)).length}
            </Button>
          ))}
        </div>
        <Input
          type="search"
          aria-label="거래처명 검색"
          placeholder="거래처명 검색"
          className="h-8 w-56 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {flash && (
        <p aria-live="polite" className="text-sm text-green-700">
          {flash}
        </p>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-lg border">
        <table className="data-table">
          <thead>
            <tr>
              <th className="left">거래처명</th>
              <th>구분</th>
              <th>상태</th>
              <th className="num">거래 건수</th>
              <th>등록일</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {partners.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  등록된 거래처가 없습니다. [거래처 추가]로 공급처·출고처를 먼저 등록하세요.
                </td>
              </tr>
            )}
            {partners.length > 0 && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  조건에 맞는 거래처가 없습니다.
                </td>
              </tr>
            )}
            {visible.map((p) => (
              <tr key={p.id} className={p.isActive ? "" : "text-muted-foreground"}>
                <td className="left">{p.name}</td>
                <td>
                  <Badge variant={PARTNER_TYPE_TONE[p.type]}>{PARTNER_TYPE_LABELS[p.type]}</Badge>
                </td>
                <td>{p.isActive ? <span className="text-green-700">사용</span> : "중지"}</td>
                <td className="num">{p.usage.toLocaleString()}</td>
                <td className="text-muted-foreground tabular-nums">{p.createdAtText}</td>
                <td>
                  <div className="flex justify-center gap-1">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setFlash("");
                        setDialog({ kind: "edit", partner: p });
                      }}
                    >
                      수정
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog?.kind === "create" && <CreateDialog onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "edit" && (
        <EditDialog key={dialog.partner.id} partner={dialog.partner} onClose={() => setDialog(null)} onDone={done} />
      )}
    </div>
  );
}

/** 액션 상태가 성공이면 부모에 알림 */
function useDone(state: PartnerActionState, onDone: (m: string) => void) {
  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);
}

function submitWith(action: (fd: FormData) => void, pending: boolean) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

function Footer({
  pending,
  label,
  state,
  onCancel,
}: {
  pending: boolean;
  label: string;
  state: PartnerActionState;
  onCancel: () => void;
}) {
  return (
    <>
      {state.status === "error" && (
        <p aria-live="polite" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "처리 중..." : label}
        </Button>
      </div>
    </>
  );
}

function TypeSelect({ defaultValue, error }: { defaultValue: PartnerTypeCode; error?: string }) {
  return (
    <label className="flex-1 text-sm">
      구분
      <NativeSelect name="type" defaultValue={defaultValue} className="w-full">
        {PARTNER_TYPES.map((t) => (
          <option key={t} value={t}>
            {PARTNER_TYPE_LABELS[t]}
          </option>
        ))}
      </NativeSelect>
      {error && <span className={errText}>{error}</span>}
    </label>
  );
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [state, action, pending] = useActionState(createPartnerAction, initial);
  useDone(state, onDone);
  const err = state.status === "error" ? (state.errors ?? {}) : {};
  return (
    <Modal title="거래처 추가" onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submitWith(action, pending)} noValidate className="flex flex-col gap-4">
        <div className="flex gap-4">
          <label className="flex-[2] text-sm">
            거래처명
            <Input name="name" className="w-full" maxLength={PARTNER_LIMITS.maxName} placeholder="예: 한빛식자재" autoComplete="off" />
            {err.name && <span className={errText}>{err.name}</span>}
          </label>
          <TypeSelect defaultValue="SUPPLIER" error={err.type} />
        </div>
        <Footer pending={pending} label="등록" state={state} onCancel={onClose} />
      </form>
    </Modal>
  );
}

function EditDialog({ partner, onClose, onDone }: { partner: PartnerRow; onClose: () => void; onDone: (m: string) => void }) {
  const [state, action, pending] = useActionState(updatePartnerAction, initial);
  useDone(state, onDone);
  const err = state.status === "error" ? (state.errors ?? {}) : {};
  return (
    <Modal title={`거래처 수정 · ${partner.name}`} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submitWith(action, pending)} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="partnerId" value={partner.id} />
        <input type="hidden" name="version" value={partner.version} />
        <label className="text-sm">
          거래처명
          <Input name="name" className="w-full" maxLength={PARTNER_LIMITS.maxName} defaultValue={partner.name} />
          {err.name && <span className={errText}>{err.name}</span>}
        </label>
        <div className="flex gap-4">
          <TypeSelect defaultValue={partner.type} error={err.type} />
          <label className="flex-1 text-sm">
            사용 여부
            <NativeSelect name="isActive" defaultValue={partner.isActive ? "1" : "0"} className="w-full">
              <option value="1">사용</option>
              <option value="0">중지 (새 입출고·주문에서 선택 불가)</option>
            </NativeSelect>
            {err.isActive && <span className={errText}>{err.isActive}</span>}
          </label>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          거래처명을 바꾸면 이 거래처의 기존 입고·출고·주문 기록에도 새 이름으로 표시됩니다. 거래한 기록이 있는 용도는 구분에서 뺄 수 없습니다.
        </p>
        <Footer pending={pending} label="저장" state={state} onCancel={onClose} />
      </form>
    </Modal>
  );
}
