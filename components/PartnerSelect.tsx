"use client";

import { NativeSelect } from "@/components/ui/native-select";

export type PartnerOption = { id: string; name: string; isActive?: boolean };

/**
 * 거래처(공급처·출고처) 선택. 값은 partnerId 로 전송된다.
 * - current: 수정 중인 기록의 현재 거래처. 사용 중지된 거래처라도 목록에 남겨 그대로 둘 수 있게 한다.
 */
export default function PartnerSelect({
  options,
  label,
  required = false,
  defaultValue = "",
  current,
  className = "w-full",
}: {
  options: PartnerOption[];
  label: string;
  required?: boolean;
  defaultValue?: string;
  current?: { id: string; name: string } | null;
  className?: string;
}) {
  const list =
    current && !options.some((o) => o.id === current.id)
      ? [...options, { id: current.id, name: current.name, isActive: false }]
      : options;
  return (
    <>
      <NativeSelect name="partnerId" defaultValue={defaultValue} className={className}>
        <option value="">{required ? `${label}를 선택하세요` : "선택 안 함"}</option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.isActive === false ? " (사용 중지)" : ""}
          </option>
        ))}
      </NativeSelect>
      {list.length === 0 && (
        <span className="mt-1 block text-xs text-muted-foreground">
          등록된 {label}가 없습니다. 관리자가 [거래처]에서 먼저 등록해야 선택할 수 있습니다.
        </span>
      )}
    </>
  );
}
