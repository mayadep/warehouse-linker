import { connection } from "next/server";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { listNotices } from "@/modules/notice/service";
import { toKstDate } from "@/lib/datetime";
import NoticeManager from "./NoticeManager";

export default async function NoticesPage() {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회
  const user = await requirePageUser();
  if (!can(user.role, "admin")) return <Forbidden title="공지사항" />;
  const notices = await listNotices();

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">공지사항</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          게시 중인 공지는 모든 사용자의 대시보드에 표시됩니다. 삭제 대신 게시 중지로 내립니다.
        </p>
      </div>
      <NoticeManager
        notices={notices.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          isPinned: n.isPinned,
          isPublished: n.isPublished,
          version: n.version,
          authorName: n.authorName,
          createdAtText: toKstDate(n.createdAt),
        }))}
      />
    </div>
  );
}
