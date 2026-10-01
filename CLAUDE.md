@AGENTS.md

# warehouse-linker

재고관리 · 수발주 · 배차관리 프로그램 (도매 식자재). 사용자는 한국어로 소통하며, 답변·주석·UI 문구는 한국어로 작성한다.
상세 설계(데이터 모델, 업무 규칙, 화면 구성, 미결 과제)는 @docs/DESIGN.md 를 따른다. 기능을 바꾸면 그 문서도 함께 갱신한다.

## 작업 규칙 (반드시 지킬 것)

1. 승인되지 않은 아키텍처 변경을 임의로 하지 않는다.
2. 기존 코드를 읽고 수정한다.
3. 여러 파일 변경 시 계획을 먼저 제시한다.
4. 업무 규칙과 데이터 흐름을 먼저 확인한다.
5. 권한을 UI에만 의존하지 않는다. (현재 인증 없음 → 각 Server Action의 `TODO: 권한 확인` 자리에 추가 예정)
6. 재고 변경은 트랜잭션과 이력을 고려한다.
7. 입력값은 서버에서도 검증한다.
8. 기능 구현 후 테스트한다.
9. 변경 사항과 기존 기능의 영향을 검수한다.
10. 작업 순서: 분석 → 설계 → 승인 → 구현 → 테스트 → 검증
11. 기술 스택: Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind 4 + shadcn/ui(아직 미도입) + Prisma 6 + PostgreSQL
12. 아키텍처: Modular Monolith

## 실행 · 확인 명령

```bash
docker compose up -d          # PostgreSQL (컨테이너 warehouse-linker_pg). Docker Desktop이 켜져 있어야 함
npx prisma migrate dev        # 스키마 변경 반영 + Prisma Client 재생성 (개발 서버를 먼저 끌 것: Windows는 엔진 파일 잠김)
npx prisma db seed            # 샘플 상품 50개 + 기본 창고 6개 (여러 번 실행해도 안전)
npm run dev                   # http://localhost:3000
npx tsc --noEmit              # 타입 검사
npm run lint                  # ESLint
```

- 스키마 변경 후 `Unknown field ...` / `Cannot read properties of undefined (reading 'findMany')` 오류 → Prisma Client가 옛 버전. 서버 끄고 `npx prisma migrate dev` 후 재시작.
- `Can't reach database server at localhost:5432` → Docker Desktop / DB 컨테이너가 꺼져 있음.
- 기존 마이그레이션 SQL은 Prisma 엔진 없이 손으로 작성되었다 (CHECK 제약은 수동 추가분). 이후에는 `npx prisma migrate dev --create-only --name <이름>`으로 생성하고, 필요한 CHECK 제약만 SQL에 덧붙인다.

## 코드 구조 · 관례

- `modules/<도메인>/` : `validation.ts`(서버 검증) · `service.ts`(트랜잭션·DB) · `actions.ts`("use server", useActionState 상태 반환) · `codes.ts`(라벨·상수, 클라이언트 공용)
  - 도메인: product, inbound, outbound, stock, warehouse, order(수발주), dispatch(배차)
- `app/<화면>/` : 서버 컴포넌트 page.tsx(`await connection()`으로 항상 최신 조회) + 클라이언트 폼/표/모달
- `lib/` : prisma 싱글톤, form 파서(`lib/form.ts`), KST 날짜(`lib/datetime.ts`), 요청키(`lib/request-id.ts`), 문서번호(`lib/doc-number.ts`)
- `components/Modal.tsx` : native `<dialog>` 모달 공용
- **재고 수량은 반드시 `modules/stock/service.ts`의 `changeStock(tx, …)`로만 변경** (조건부 차감으로 음수 방지 + StockMovement 이력 기록). `Product.stock` == 이력 합계, DB CHECK(stock >= 0)
- 등록 계열은 클라이언트가 만든 `requestId`(unique)로 이중 처리 차단, 수정 계열은 `version`으로 동시 수정 차단
- 날짜·시간은 KST 기준 입력/표시 (`toKstDateTimeLocal`, `parseKstDate` 등)
- 표는 가운데 정렬, 서버 오류 메시지는 한국어로 구체적으로 (예: "재고가 부족합니다. (현재고 X, 필요 Y)")
