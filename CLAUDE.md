warehouse-linker

도매 식자재 재고관리 · 수발주 · 배차관리 프로그램.
사용자와의 소통, 답변, 주석, UI 문구는 한국어로 작성한다.

상세 설계와 업무 규칙은 @docs/DESIGN.md를 따른다.
업무 규칙이나 데이터 모델을 변경하면 @docs/DESIGN.md도 갱신한다.

## Design System

UI/UX를 작업할 때는 반드시 `DESIGN_SYSTEM.md`의 디자인 규칙을 따른다.

새로운 화면이나 컴포넌트를 만들 때
- 색상
- typography
- spacing
- border radius
- table
- button
- card
- modal
- layout
등의 디자인을 임의로 변경하지 않는다.

기존 디자인 시스템과 충돌하는 요구사항이 있으면 먼저 사용자에게 확인한다.


핵심 규칙

1. 기존 아키텍처를 유지한다. 승인 없이 구조를 변경하지 않는다.

2. 작업에 필요한 코드와 문서만 확인한다. 전체 프로젝트를 불필요하게 탐색하지 않는다.

3. 이미 확인한 파일과 정보는 반복해서 읽지 않는다.

4. 요청 범위를 벗어난 리팩터링이나 개선을 하지 않는다.

5. 여러 파일을 변경하는 작업은 구현 전에 변경 범위를 짧게 제시한다.

6. 업무 규칙과 데이터 흐름을 확인한 후 구현한다.

7. 불확실하면 추측하지 말고 관련 코드나 @docs/DESIGN.md에서 근거를 찾는다.

8. 충분한 근거를 확보하면 추가 탐색을 중단하고 구현한다.

9. 기능 구현 후 관련 테스트와 타입 검사를 실행한다.

10. 변경 사항과 기존 기능에 대한 영향을 확인한다.



보안 · 데이터

로그인·역할(직원/관리자) 있음. 모든 Server Action은 시작 부분에서 authorize(권한)로, 페이지는 requirePageUser() + can()으로 확인한다. 권한표는 modules/user/codes.ts.

권한 검사를 UI에만 두지 않는다.

모든 입력값은 서버에서 검증한다.

재고 변경은 반드시 modules/stock/service.ts의 changeStock(tx, …)를 사용한다.

재고 변경 시 트랜잭션과 StockMovement 이력을 유지한다.

Product.stock은 이력 합계와 일치해야 하며 DB CHECK(stock >= 0)를 유지한다.

등록 계열은 requestId로 중복 처리를 방지한다.

수정 계열은 version으로 동시 수정을 방지한다.

날짜와 시간은 KST 기준으로 처리한다.




기술 스택

Next.js 16 App Router + Turbopack

TypeScript

Tailwind CSS 4

shadcn/ui

Prisma 6

PostgreSQL

Modular Monolith




구조

modules/<domain>/

validation.ts: 서버 검증

service.ts: DB 및 트랜잭션

actions.ts: Server Actions

codes.ts: 라벨 및 상수

app/<screen>/: 페이지 및 화면 컴포넌트

lib/: 공통 유틸리티

components/Modal.tsx: 공용 native dialog

도메인:
product, inbound, outbound, stock, warehouse, order, dispatch

페이지의 최신 데이터 조회에는 await connection()을 사용한다.




명령어
docker compose up -d
npx prisma migrate dev
npx prisma db seed
npm run dev
npx tsc --noEmit
npm run lint


Prisma 스키마 변경 후 Prisma Client 오류가 발생하면 개발 서버를 종료하고 npx prisma migrate dev 실행 후 재시작한다.

DB 연결 오류는 PostgreSQL Docker 컨테이너 상태를 확인한다.

마이그레이션은 npx prisma migrate dev --create-only --name <이름>으로 생성한다.

필요한 CHECK 제약은 생성된 SQL에 추가한다.




UI · 응답

표는 가운데 정렬한다.

서버 오류 메시지는 구체적인 한국어로 작성한다.

예: 재고가 부족합니다. (현재고 X, 필요 Y)

최종 응답은 변경 사항과 테스트 결과 중심으로 간결하게 작성한다.

요청하지 않은 설명이나 개선 제안은 생략한다.