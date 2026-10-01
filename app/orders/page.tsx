import UnderDevelopment from "@/components/UnderDevelopment";

export default function OrdersPage() {
  return (
    <UnderDevelopment
      title="수발주"
      description="공급처에 발주를 내고 입고로 연결하며, 거래처 주문을 받아 출고로 연결하는 화면입니다."
      planned={[
        "발주 등록 (공급처, 품목, 수량, 단가, 입고 예정일)",
        "발주 → 입고 처리 연결 (부분 입고, 미입고 잔량 관리)",
        "수주(주문) 등록 및 재고 확인",
        "수주 → 출고 처리 연결 (부분 출고)",
        "발주·수주 상태 관리 (작성, 확정, 진행, 완료, 취소)",
        "거래처(공급처·출고처) 관리",
      ]}
    />
  );
}
