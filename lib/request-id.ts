// 등록 요청 고유키 (UUID v4). 같은 요청이 두 번 전송돼도 서버가 1번만 처리하도록 함께 보낸다.
// crypto.randomUUID 는 https/localhost 에서만 동작하므로 사내망 IP(http) 접속을 위해 대체 구현을 둔다.
export function newRequestId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
