import Link from "next/link";
import { ShieldAlertIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** 권한이 없는 화면에 접근했을 때 (데이터는 조회하지 않음) */
export default function Forbidden({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm shadow-xs">
        <ShieldAlertIcon className="size-5 text-amber-600" />
        이 화면은 관리자만 사용할 수 있습니다.
      </div>
      <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
        처음으로
      </Link>
    </div>
  );
}
