import UnderDevelopment from "@/components/UnderDevelopment";

export default function DashboardPage() {
  return (
    <UnderDevelopment
      title="대시보드"
      description="오늘의 입출고와 재고 상태를 한눈에 보는 첫 화면입니다."
      planned={[
        "오늘·이번 주 입고/출고 건수와 수량",
        "재고 없음·부족(안전재고 이하) 상품 목록 바로가기",
        "창고별 구획 사용률",
        "최근 입출고·수정 내역",
        "진행 중인 발주·배차 현황",
      ]}
    />
  );
}
