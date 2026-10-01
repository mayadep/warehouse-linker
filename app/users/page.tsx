import UnderDevelopment from "@/components/UnderDevelopment";

export default function UsersPage() {
  return (
    <UnderDevelopment
      title="사용자·권한"
      description="로그인과 사용자별 권한을 관리하는 화면입니다. 모든 등록·수정·취소 기능에서 서버가 권한을 확인하게 됩니다."
      planned={[
        "로그인 / 로그아웃",
        "사용자 등록·비활성화",
        "역할별 권한 (관리자, 입출고 담당, 조회 전용 등)",
        "서버 측 권한 확인 (화면에서 버튼을 숨기는 것만으로 막지 않음)",
        "입출고·수정·위치 변경 이력에 처리자 기록",
      ]}
    />
  );
}
