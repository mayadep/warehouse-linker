# 상품·입고·출고·재고현황·창고 설계 (2026-10-01)

## 데이터 모델
- `Product`: sku(unique), name, category, price, stock(**DB CHECK >= 0**), baseUnit(enum ProductUnit), boxQty(≥1 CHECK), trackExpiry, safetyStock(기본 0, CHECK >= 0), locationId?(기본 보관위치, **unique = 한 칸에 한 상품**, onDelete SetNull). 인덱스 (category, sku), (stock)
- `Inbound`: productId, quantity>0 CHECK, unitCost?, supplier?, memo?, receivedAt, version, requestId?(unique), updatedAt
- `Outbound`: productId, quantity>0 CHECK, unitPrice?(기본 판매가), customer?(출고처), memo?, shippedAt, version, requestId?(unique), updatedAt
- `StockMovement`: 모든 재고 변경 이력. type INBOUND/OUTBOUND/ADJUST/INBOUND_CORRECTION/OUTBOUND_CORRECTION, quantity ±, before/afterStock, inboundId?, outboundId?
- `InboundRevision` / `OutboundRevision`: 수정 기록 (reason 필수, before/after JSON 바뀐 항목만, quantityDelta, stockMovementId? unique)
- 불변식: `Product.stock` == StockMovement.quantity 합계, 항상 >= 0
- 마이그레이션: `20261001120000_add_inbound`, `20261001130000_product_unit_fields`, `20261001140000_inbound_edit`, `20261001150000_outbound`, `20261001160000_safety_stock`, `20261001170000_product_stock_indexes`, `20261001180000_warehouse`, `20261001190000_product_location`, `20261001200000_product_location_history`, `20261002090000_orders_dispatch` (SQL 수기 작성, CHECK 제약은 수동 추가분)

## 공통 (modules/stock, lib)
- `modules/stock/service.ts` `changeStock(tx, {productId, delta, type, inboundId?, outboundId?})`: 모든 재고 증감은 이 함수로. 차감은 `updateMany where stock >= 차감량` 조건부 → 동시 요청에도 음수 불가, 부족 시 `InsufficientStockError(currentStock, requested)`. 이력 자동 기록. 반드시 호출자 트랜잭션 안에서.
- `modules/stock/queries.ts` (재고현황은 **전부 DB 처리**):
  - `stockStatus`(0 → OUT, safetyStock>0 && stock ≤ safetyStock → LOW, else OK) — `statusWhere`가 같은 규칙을 Prisma where로 (LOW는 `prisma.product.fields.safetyStock` 컬럼 비교)
  - `parseStockFilter`(q, category, status all/short/low/out, sort sku/stock/name, page 화이트리스트·범위 검증)
  - `listStockStatus`: where/orderBy(+sku 타이브레이커)/skip·take(STOCK_PAGE_SIZE=50)/count, 범위 초과 page는 마지막으로. 요약은 필터 무관 COUNT + `$queryRaw` SUM(stock*price bigint). 최근 입고/출고일은 현재 페이지 id만 groupBy
  - `getStockLedger(productId, 50)`
  - 검증: 3,000개 상품에서 JS 기준 구현과 288개 조합 결과 일치, 조회 최대 65ms
- `modules/stock/actions.ts`: `updateSafetyStockAction`(0~1,000,000 정수 서버 검증), `getStockLedgerAction`(원장 직렬화)
- `isUniqueViolation(e, field)`, `SIMILAR_WINDOW_MS`(10분)
- `lib/form.ts` 폼 필드 공통 파서, `lib/datetime.ts` KST 변환 (`modules/inbound/datetime.ts`는 호환용 re-export, 삭제 가능), `lib/request-id.ts` 요청키 생성

## 창고 (modules/warehouse) — 구조만, 재고는 아직 상품 단위
- 모델: `Warehouse`(code unique, name, storageType enum REFRIGERATED/FROZEN/AMBIENT, memo), `Rack`(warehouseId, number unique per 창고 1~999 CHECK, levels 1~20, binsPerLevel 1~50), `Location`(warehouseId, rackId, level, bin, code unique `RF1-R01-2-3`, unique(rackId, level, bin))
- 코드 규칙 `codes.ts`: 접두어 RF/FZ/AM + 번호, `nextWarehouseCode`, `defaultWarehouseName`, `rackCode`(R01, R100), `locationCode`. 창고코드는 영문 대문자 시작·영문숫자 2~10자(하이픈 불가 → 위치코드 충돌 없음)
- `builder.ts` `createRacksWithLocations(tx, wh, {startNumber, count, levels, binsPerLevel})`: id 미리 생성 후 createMany 일괄 삽입. `seedDefaultWarehouses`(RF1·RF2·FZ1·FZ2·AM1·AM2, 랙 50×4단×6구획 = 7,200칸, 있는 코드는 건너뜀). seed.ts에서 호출
- `service.ts`: `createWarehouse`(코드 중복 사전확인 + P2002), `addRacks`(창고 행 `FOR UPDATE` 잠금 → 화면 랙 수(expectedRackCount)와 다르면 거부 → max+1부터 생성, 999 한도), tx timeout 30s. 한 요청 최대 20,000칸
- 화면: `/warehouses` 카드 목록 + [창고 추가] 모달(유형 선택 시 코드·이름 자동 제안, 생성 미리보기), `/warehouses/[id]` 랙 목록 + [랙 추가] 모달 + 랙 배치도 모달(위가 높은 단). 공용 `components/Modal.tsx`. 사이드바는 하위 경로도 강조
- 보관위치 자동 배정 `assign.ts` `assignRandomLocations`: locationId 없는 상품만, 분류→유형(냉동식품→FROZEN, 유제품→REFRIGERATED, 그 외 AMBIENT, `CATEGORY_STORAGE`), `pg_advisory_xact_lock`으로 동시 실행 직렬화, 빈 칸 `ORDER BY random()`, 빈 칸 부족 시 남은 상품은 미배정으로 보고. 창고관리 화면 [위치 자동 배정] 버튼(확인 후 실행). 표시: 창고 카드 배정 칸·비율, 랙 목록 배정 수, 배치도 칸에 상품명, 재고현황 '위치' 칸, 입출고 폼 상품 선택 시 위치
- 보관위치 직접 변경 `location.ts` `changeProductLocation`: 재고현황 원장 팝업의 `LocationEditor`(창고→랙→단→구획 선택, 랙은 `getRacksForPickerAction`으로 해당 창고만 로드, 구획 옵션에 배정 상품 표시). 자동배정과 같은 advisory lock. expectedLocationId 불일치 → 거부. 대상 칸 점유 시 교환(나 해제 → 상대를 내 원래 자리(없으면 해제) → 나 목표), 분류/창고유형 불일치(교환 상대 포함)는 경고. 경고가 있으면 status "confirm" 반환(변경 없음) → mode=set-confirmed + expectedOccupantId 일치 시에만 진행. 클라이언트는 확인받은 targetCode와 현재 선택이 같을 때만 [확인하고 변경] 표시. 해제(mode=clear) 지원. 이력 `ProductLocationHistory`(fromCode, toCode, swappedWithSku, reason) — 교환 시 양쪽 기록, 팝업에 최근 5건
- 다음 단계 후보: 구획별 재고(입고 위치 지정, 출고 위치 차감, 위치 이동), 상품 보관유형과 창고 유형 매칭, 랙/창고 비활성화

## 수발주 (modules/order) — 2026-10-02
- 모델: `TradeOrder`(type PURCHASE/SALES, orderNo PO-/SO-YYYYMMDD-NNN unique, partner, status OPEN/PARTIAL/DONE/CLOSED/CANCELLED, dueDate KST 자정, memo, version, requestId unique), `TradeOrderLine`(seq, productId unique per order, quantity>0, unitPrice?, processedQty CHECK 0~quantity). `Inbound.orderLineId?`, `Outbound.orderLineId?`
- 번호: `lib/doc-number.ts` `nextDocNumber`(접두어+KST날짜별 advisory lock → 마지막+1)
- `processOrder`: 주문 행 FOR UPDATE + version 확인, 품목별 남은 수량 이하만, 발주→Inbound+changeStock / 수주→Outbound+changeStock(재고 부족 시 전체 롤백), 요청키 `requestId:lineId`를 Inbound/Outbound.requestId로 → 이중 처리 차단, 처리 후 `refreshOrderStatus`
- `finishOrder`: close(잔량 종결, PARTIAL만) / cancel(OPEN이고 처리 0일 때만)
- 연동: 입고/출고 **수정**으로 수량이 바뀌면 `adjustOrderLineProcessed`(조건부 UPDATE, 범위 벗어나면 거부) + 상태 재계산. 불변식 processedQty == 연결된 입고/출고 수량 합
- 화면 `/orders?type=purchase|sales&status=active|all|…&q=` 목록, 등록 모달(품목 줄 추가·삭제, 수주는 판매가 기본·재고 부족 경고, 성공 시 상세로 이동), `/orders/[id]` 상세(품목별 주문/처리/남은 수량·이력), 입고/출고 처리 모달(기본값 남은 수량, 수주는 현재고까지), 잔량 종결·주문 취소(확인 후)

## 배차 (modules/dispatch) — 2026-10-02
- 모델: `Vehicle`(plateNo unique 공백 제거, storageType 적재 온도, driverName, driverPhone?, isActive), `Dispatch`(dispatchNo DSP-YYYYMMDD-NNN, deliveryDate KST 자정, vehicleId, status PLANNED/LOADED/IN_TRANSIT/DELIVERED/CANCELLED, version, requestId, deliveredAt, cancelledAt), `DispatchItem`(outboundId **unique** = 출고 1건은 배차 1곳, seq 배송 순서)
- 온도 규칙 `canCarry`: 냉동(2) ≥ 냉장(1) ≥ 실온(0), 차량 등급 ≥ 상품 등급(분류→`storageTypeForCategory`)이어야 적재
- 배정은 advisory lock 'dispatch-assign' + unique로 중복 배차 차단. 상태는 한 단계씩만(배차→상차 완료→배송중→배송 완료), 취소는 출발 전만 가능하며 품목을 지워 출고를 다시 배차 대기로. 품목 추가/빼기는 배차 단계에서만(마지막 1건은 빼기 불가 → 취소)
- 차량 운행 중지는 진행 중 배차가 없을 때만
- 화면 `/dispatch?date=YYYY-MM-DD`(전날/다음날, 배차 카드: 차량·기사·품목·상태 버튼·출고 추가·빼기·취소), 배차 등록 모달(차량 선택 시 못 싣는 출고는 체크 불가, 최근 14일 미배차 출고), `/dispatch/vehicles` 차량 등록·운행 중지/재개

## 중복 방지 (입고·출고 공통)
1. 요청 고유키: 폼이 저장 성공 전까지 같은 requestId 재사용 → 서버는 기존 requestId면 거부, 동시 요청은 unique 제약(P2002)로 1건만 저장
2. 유사 건 경고: 최근 10분 내 같은 상품·거래처·수량이 있으면 status "confirm" 반환(저장 안 함) → [그래도 등록](confirmDuplicate=1) 시 저장

## 화면
- `/products/new` 상품등록·목록·검색 (※ 목록은 아직 전체 조회 — 상품 많아지면 페이지 나누기 필요)
- `/inbound`, `/outbound`: 등록 폼 + 최근 20건 표(가운데 정렬, '수정 사유' 칸). 체크박스 1건 선택 → [선택 수정] native `<dialog>` 모달
  - 모달 key에 version 넣지 말 것 (저장 직후 revalidate 리마운트로 성공 상태 유실)
  - 입고·출고 폼의 상품 선택 목록은 전체 상품을 내려받음 — 상품 많아지면 검색형(서버 검색)으로 바꿀 것
- `/stock` 재고현황: 요약 카드, GET 필터 폼(조회 시 page 초기화), 표, 페이지 이동(필터 유지, 1 … 4 5 [6] 7 8 … N), 행 클릭 → 재고 원장 + 안전재고 설정 모달
- 입출고 처리 시 `/inbound`, `/outbound`, `/products/new` 재검증 (`/stock`은 dynamic 페이지라 이동 시 최신 조회)

## 운영 메모
- 스키마 변경 후: 개발 서버 종료 → `npx prisma migrate dev` → 재시작 (윈도우는 실행 중 엔진 파일 잠김)
- DB는 docker compose (`warehouse-linker_pg`). Docker Desktop 꺼져 있으면 `Can't reach database server`

## 미결 / 추천 후보
- 인증/권한 (각 Server Action 권한 확인, 수정자 기록)
- 입고/출고 취소(전표 무효화 + 역이력), 상품 수정/비활성화, 상품등록 화면에 안전재고 입력
- 거래처 마스터(공급처/출고처)
- 유통기한/로트 관리(trackExpiry 활용, 선입선출), 박스 단위 환산 입출고
- 기간별 집계·엑셀 내보내기, 배차관리 연동
- 대시보드(`/`), 사용자·권한(`/users`)은 개발중 안내 화면
- 대량 데이터 대비: 상품등록 목록 페이지 나누기, 입출고 상품 선택을 서버 검색형으로, 코드·품명 부분검색이 느려지면 pg_trgm 인덱스
