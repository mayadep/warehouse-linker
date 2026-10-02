import { connection } from "next/server";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { listUsers } from "@/modules/user/service";
import { toKstDate } from "@/lib/datetime";
import UserManager from "./UserManager";

export default async function UsersPage() {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회
  const user = await requirePageUser();
  if (!can(user.role, "admin")) return <Forbidden title="사용자·권한" />;
  const users = await listUsers();

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">사용자·권한</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          직원: 상품 등록·입고 등록(관리자 확정 전까지 대기), 상품·입고·재고현황 조회(금액 제외) · 관리자: 확정·취소·삭제·금액 보기·모든 메뉴
        </p>
      </div>
      <UserManager
        currentUserId={user.id}
        users={users.map((u) => ({
          id: u.id,
          loginId: u.loginId,
          name: u.name,
          role: u.role,
          isActive: u.isActive,
          version: u.version,
          createdAtText: toKstDate(u.createdAt),
        }))}
      />
    </div>
  );
}
