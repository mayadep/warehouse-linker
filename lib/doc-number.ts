// 문서번호 발급: PREFIX-YYYYMMDD-001 (KST 날짜 기준, 날짜별 일련번호)
import type { Prisma } from "@prisma/client";
import { toKstDate } from "./datetime";

/**
 * 같은 접두어·날짜의 번호 발급을 advisory lock 으로 직렬화한 뒤
 * 마지막 번호 + 1 을 돌려준다. 반드시 트랜잭션 안에서 호출.
 * findLast: 해당 접두어로 시작하는 가장 큰 번호를 찾는 함수
 */
export async function nextDocNumber(
  tx: Prisma.TransactionClient,
  prefix: string,
  findLast: (startsWith: string) => Promise<string | null>,
  now = new Date()
): Promise<string> {
  const ymd = toKstDate(now).replaceAll("-", "");
  const head = `${prefix}-${ymd}-`;
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${"docno:" + head}))`;
  const last = await findLast(head);
  const n = last ? Number(last.slice(head.length)) + 1 : 1;
  return `${head}${String(n).padStart(3, "0")}`;
}
