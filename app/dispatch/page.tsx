import UnderDevelopment from "@/components/UnderDevelopment";

export default function DispatchPage() {
  return (
    <UnderDevelopment
      title="배차관리"
      description="출고 건을 차량·기사에 배정하고 배송 진행 상태를 관리하는 화면입니다."
      planned={[
        "차량·기사 등록 (차량번호, 적재 유형: 냉장/냉동/상온, 연락처)",
        "출고 건 배차 (날짜별 배차표, 차량별 적재 목록)",
        "보관유형에 맞는 차량 배정 확인 (냉동 상품 → 냉동 차량)",
        "배송 상태 관리 (배차, 상차, 배송중, 완료)",
        "배송 순서·경로 메모",
      ]}
    />
  );
}
