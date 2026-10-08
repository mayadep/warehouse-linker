# 상품·입고·출고·재고현황·창고 설계 (2026-10-01)

## 데이터 모델
- `Product`: sku(unique, **등록 시 서버가 자동 채번** `P-000001` — DB 시퀀스 `product_sku_seq`, 입력받지 않음), storageTemp(enum StorageTemp 상온/냉장/냉동, 등록 시 선택, 기본 AMBIENT, 상품 수정에서 변경 가능), name, category, price, stock(**DB CHECK >= 0**), baseUnit(enum ProductUnit), boxQty(≥1 CHECK), trackExpiry, safetyStock(DB 기본 0, 상품등록 화면에서 입력, 비우면 기본 5 `modules/product/defaults.ts`·시드도 5, CHECK >= 0), locationId?(기본 보관위치, **unique = 한 칸에 한 상품**, onDelete SetNull). 인덱스 (category, sku), (stock)
- `Inbound`: productId, quantity>0 CHECK, unitCost?, partnerId?(공급처, 거래처 마스터 FK), memo?, receivedAt, version, requestId?(unique), updatedAt
- `Outbound`: productId, quantity>0 CHECK, unitPrice?(기본 판매가), partnerId?(출고처, 거래처 마스터 FK), memo?, shippedAt, version, requestId?(unique), updatedAt, 출고 위치 지정 `pickFixed`(false=자동)·`pickLocationId?`·`pickExpiryDate?`
- `StockMovement`: 모든 재고 변경 이력. type INBOUND/OUTBOUND/ADJUST/INBOUND_CORRECTION/OUTBOUND_CORRECTION/INBOUND_CANCEL/OUTBOUND_CANCEL/EXPIRY_CHANGE/MOVE, quantity ±, before/afterStock, inboundId?, outboundId?, locationId?·expiryDate?(변동된 칸, null = 미지정·미상). 여러 칸에 걸치면 칸마다 1건
- `StockBalance` (2026-10-03): 칸별 재고 = 상품 × 위치(null 미지정) × 유통기한(DATE, null 미상), quantity CHECK > 0(0이면 행 삭제), unique(productId, locationId, expiryDate) **NULLS NOT DISTINCT**(PG15+, SQL 수기). `Inbound.locationId?`(넣을 위치, 비우면 확정 시점 기본 보관위치)·`expiryDate?`
- 불변식(칸): Product.stock == Σ StockBalance.quantity, 칸마다 Σ StockMovement.quantity(같은 칸) == 칸 수량
- `InboundRevision` / `OutboundRevision`: 수정 기록 (reason 필수, before/after JSON 바뀐 항목만, quantityDelta, stockMovementId? unique)
- 불변식: `Product.stock` == StockMovement.quantity 합계, 항상 >= 0
- 마이그레이션: `20261001120000_add_inbound`, `20261001130000_product_unit_fields`, `20261001140000_inbound_edit`, `20261001150000_outbound`, `20261001160000_safety_stock`, `20261001170000_product_stock_indexes`, `20261001180000_warehouse`, `20261001190000_product_location`, `20261001200000_product_location_history`, `20261002090000_orders_dispatch`, `20261002120000_audit_log`, `20261002121346_users_roles`, `20261002123842_outbound_status`, `20261003063758_login_throttle`, `20261003104150_stock_balance`(기존 재고·이력을 상품 기본 보관위치·유통기한 미상 칸으로 이관), `20261003121427_stock_move`, `20261003122342_outbound_pick` (SQL 수기 작성, CHECK 제약은 수동 추가분)

## 공통 (modules/stock, lib)
- `modules/stock/service.ts` `changeStock(tx, {productId, delta, type, inboundId?, outboundId?})`: 모든 재고 증감은 이 함수로. 차감은 `updateMany where stock >= 차감량` 조건부 → 동시 요청에도 음수 불가, 부족 시 `InsufficientStockError(currentStock, requested)`. 이력 자동 기록. 반드시 호출자 트랜잭션 안에서.
  - 칸별 재고도 함께 변경(상품 행 잠금 상태에서). 옵션 `bucket {locationId, expiryDate}` = 늘릴 때 넣을 칸 / 줄일 때 먼저 뺄 칸
  - 늘림: 출고 취소·출고 수량 감소(outboundId)면 그 출고가 뺐던 칸으로(나중에 뺀 칸부터) → bucket → 입고 정정(inboundId)이면 그 입고의 칸 → 상품 기본 보관위치·유통기한 미상
  - 줄임: bucket → 입고 취소·입고 수량 감소(inboundId)면 그 입고가 넣은 칸 먼저 → (그 칸이 비었으면) 같은 유통기한 칸(위치 이동된 재고) → 자동 순서(**선입선출**) **입고일 미상 → 입고일 오래된 순 → 유통기한 미상 → 빠른 순 → 기본 보관위치 먼저**
  - 호출부(입고·출고·수발주)는 bucket 만 넘기면 되고 되돌리기 규칙은 changeStock 이 처리
  - **선입선출(FIFO, 2026-10-08, 마이그레이션 `20261008140000_stock_lot_fifo`)**: `StockBalance`·`StockMovement`에 `lotDate`(입고일, KST 날짜, null = 미상) 추가, 칸 유일성 = (상품·위치·유통기한·입고일) NULLS NOT DISTINCT. 입고 시 입고일시의 KST 날짜가 입고일(같은 입고 정정은 이미 넣은 칸의 입고일 유지). 자동 출고는 **입고일 미상(이관된 기존 재고) → 오래된 입고일 순**이며 유통기한은 같은 입고일 안에서만 순서에 영향. 출고 취소·감소는 뺐던 칸(입고일 포함)으로 복원, 입고 취소는 그 입고가 넣은 칸(입고일까지 같은 칸) 먼저. 위치 이동·유통기한 변경은 같은 칸의 입고일별 재고를 오래된 것부터 옮기며 입고일을 유지. 위치 지정(strict) 출고도 그 칸 안에서 오래된 입고분부터. 기존 재고·이력의 입고일은 알 수 없어 null(미상)로 두었으므로 새 입고분보다 먼저 나감
  - 화면(재고 원장 팝업·출고 위치 선택)은 위치·유통기한 단위로 입고일별 재고를 합쳐 보여 주고 '입고일'(그 칸에서 가장 오래된 것)을 표시. 입고일시를 나중에 수정해도 이미 들어간 칸의 입고일은 바뀌지 않음
  - `strict: true` + bucket: 그 칸에서만 차감, 모자라면 `BucketStockError`("선택한 위치의 재고가 부족합니다. (코드 · 유통기한: 현재 X, 필요 Y)")
  - 순서: 상품 행 FOR UPDATE → 총재고·칸 확인(실패 시 아무것도 안 바뀜) → 총재고 반영(조건부 UPDATE) → 칸별 재고·이력
- `changeStockExpiry`: 한 칸의 일부/전부를 다른 유통기한으로 (EXPIRY_CHANGE -n/+n, 총재고 불변). 재고현황 원장 팝업 [유통기한 입력/변경](관리자, `changeStockExpiryAction`, 감사 로그 STOCK_EXPIRY_CHANGE) — 입고 때 비워 둔 유통기한을 나중에 입력하는 경로
- `moveStock`: 한 칸의 일부/전부를 다른 위치로 (유통기한 유지, MOVE -n/+n, 총재고 불변). 같은 칸·칸 재고 초과는 거부. 유통기한 변경과 같은 `transferBucket` 사용. 원장 팝업 [위치 이동](관리자, 위치코드 입력, `moveStockAction`, 감사 로그 STOCK_MOVE). 위치코드 형식 `LOCATION_CODE_RE`(modules/warehouse/codes.ts, 입고와 공용)
- 유통기한 알림(2026-10-04): 재고가 남은 칸(StockBalance)의 유통기한 기준, 만료 = 오늘(KST) 이전, 임박 = 오늘~`EXPIRY_SOON_DAYS`(7)일 이내(modules/stock/queries.ts `expiryStateOf`·`countExpiryAlerts`, 상품 수 기준, 한 상품이 만료·임박 둘 다일 수 있음). 표시: 헤더 유통기한 아이콘(만료+임박 상품 수, 만료 있으면 Danger·임박만 Warning, → `/stock?expiry=alert`), 재고현황 '유통기한' 필터(`?expiry=alert|expired|soon`, 창고 필터와 함께 쓰면 그 창고 칸만)와 '유통기한' 칸(가장 빠른 유통기한 + 만료/D-n 배지), 대시보드 주요 알림 칩(만료·임박)
- 재고현황 창고 필터(2026-10-04): URL `?warehouse=<창고 id>`(`StockFilter.warehouse`, UUID·존재 확인, 없으면 무시). 그 창고 칸에 재고가 있거나 기본 보관위치가 그 창고인 상품만, 현재고·재고금액은 그 창고 칸 합계(`warehouseStock`, 전체와 다르면 '전체 N' 병기). 상태·정렬·요약 카드·헤더 알림·안전재고는 상품 전체 재고 기준
- 배치도 칸 수량(2026-10-04): 창고 상세 랙 배치도 칸에 그 칸의 재고(`listLocationBalances`, 상품별 유통기한 합산) 표시. 대표 수량은 배정 상품(없으면 첫 상품), 다른 상품 재고가 있으면 '외 N종', 칸 툴팁에 전체 목록. 배정 상품이 재고 없으면 '재고 0'
- 보관 온도 검사 `storageMismatchWarning`(modules/warehouse/assign.ts): 상품 분류의 보관 유형(`storageTypeForCategory`)과 칸의 창고 유형이 다르면 경고 → 사용자가 [그래도 등록/이동]으로 확인하면 허용(차단 아님). 확인은 그 위치코드에만 유효(`confirmedLocationCode`, 위치를 바꾸면 다시 경고). 적용: 입고 등록(위치코드 지정 시, 유사 입고 경고와 한 번에 표시), 원장 [위치 이동], 보관위치 변경(`changeProductLocation`)
- 입고 폼: 유통기한(선택), 보관 위치코드(선택, 서버에서 존재 확인). 발주 입고 처리 모달(2026-10-04)도 품목별 유통기한(선택, 비우면 미상)·위치코드(선택, 비우면 기본 보관위치, placeholder로 표시) 입력 — lines JSON `expiryDate`·`locationCode`, 없는 위치코드는 그 품목명과 함께 오류, 보관 온도 경고는 `findOrderStorageWarnings` → [그래도 입고](`confirmedLocationCodes`). 수주 출고 처리는 자동(위치 지정 없음)
- 출고 위치 지정(2026-10-03): 출고 폼·확정 모달 "출고 위치" 선택(`app/outbound/PickSelect.tsx`, 칸 목록 `getPickOptionsAction` — outbound.create 권한, `listProductBalances`). 기본 "자동"(선입선출: 입고일 오래된 순), 칸을 고르면 그 칸에서만(strict). 직원 대기 등록도 그 칸 수량을 미리 확인(예약 없음), 확정 모달에 등록 때 지정값이 기본으로 채워지고 관리자가 바꿀 수 있음(확정 시 Outbound.pick* 갱신). 지정 출고의 수량 증가 정정도 그 칸에서만. 취소·감소는 뺐던 칸으로 복원. 수주 출고 처리는 자동
- `modules/stock/queries.ts` (재고현황은 **전부 DB 처리**):
  - `stockStatus`(0 → OUT, safetyStock>0 && stock ≤ safetyStock → LOW, else OK) — `statusWhere`가 같은 규칙을 Prisma where로 (LOW는 `prisma.product.fields.safetyStock` 컬럼 비교)
  - `parseStockFilter`(q, category, status all/short/low/out, sort sku/stock/name, page 화이트리스트·범위 검증)
  - `listStockStatus`: where/orderBy(+sku 타이브레이커)/skip·take(STOCK_PAGE_SIZE=50)/count, 범위 초과 page는 마지막으로. 요약은 필터 무관 COUNT + `$queryRaw` SUM(stock*price bigint). 최근 입고/출고일은 현재 페이지 id만 groupBy
  - `getStockLedger(productId, 50)`
  - 검증: 3,000개 상품에서 JS 기준 구현과 288개 조합 결과 일치, 조회 최대 65ms
- `modules/stock/actions.ts`: `updateSafetyStockAction`(0~1,000,000 정수 서버 검증), `getStockLedgerAction`(원장 직렬화)
- `isUniqueViolation(e, field)`, `SIMILAR_WINDOW_MS`(10분)
- `lib/form.ts` 폼 필드 공통 파서, `lib/datetime.ts` KST 변환 (`modules/inbound/datetime.ts`는 호환용 re-export, 삭제 가능), `lib/request-id.ts` 요청키 생성

## 창고 (modules/warehouse) — 재고는 칸별(StockBalance), 기본 보관위치는 상품당 1칸
- 모델: `Warehouse`(code unique, name, storageType enum REFRIGERATED/FROZEN/AMBIENT, memo), `Rack`(warehouseId, number unique per 창고 1~999 CHECK, levels 1~20, binsPerLevel 1~50), `Location`(warehouseId, rackId, level, bin, code unique `RF1-R01-2-3`, unique(rackId, level, bin))
- 코드 규칙 `codes.ts`: 접두어 RF/FZ/AM + 번호, `nextWarehouseCode`, `defaultWarehouseName`, `rackCode`(R01, R100), `locationCode`. 창고코드는 영문 대문자 시작·영문숫자 2~10자(하이픈 불가 → 위치코드 충돌 없음)
- `builder.ts` `createRacksWithLocations(tx, wh, {startNumber, count, levels, binsPerLevel})`: id 미리 생성 후 createMany 일괄 삽입. `seedDefaultWarehouses`(RF1·RF2·FZ1·FZ2·AM1·AM2, 랙 50×4단×6구획 = 7,200칸, 있는 코드는 건너뜀). seed.ts에서 호출
- `service.ts`: `createWarehouse`(코드 중복 사전확인 + P2002), `addRacks`(창고 행 `FOR UPDATE` 잠금 → 화면 랙 수(expectedRackCount)와 다르면 거부 → max+1부터 생성, 999 한도), tx timeout 30s. 한 요청 최대 20,000칸
- 화면: `/warehouses` 카드 목록 + [창고 추가] 모달(유형 선택 시 코드·이름 자동 제안, 생성 미리보기), `/warehouses/[id]` 랙 목록 + [랙 추가] 모달 + 랙 배치도 모달(위가 높은 단). 공용 `components/Modal.tsx`. 사이드바는 하위 경로도 강조
- 보관위치 자동 배정 `assign.ts` `assignRandomLocations`: locationId 없는 상품만, 분류→유형(냉동식품→FROZEN, 유제품→REFRIGERATED, 그 외 AMBIENT, `CATEGORY_STORAGE`), `pg_advisory_xact_lock`으로 동시 실행 직렬화, 빈 칸 `ORDER BY random()`, 빈 칸 부족 시 남은 상품은 미배정으로 보고. 창고관리 화면 [위치 자동 배정] 버튼(확인 후 실행). 표시: 창고 카드 배정 칸·비율, 랙 목록 배정 수, 배치도 칸에 상품명, 재고현황 '위치' 칸, 입출고 폼 상품 선택 시 위치
- 보관위치 직접 변경 `location.ts` `changeProductLocation`: 재고현황 원장 팝업의 `LocationEditor`(창고→랙→단→구획 선택, 랙은 `getRacksForPickerAction`으로 해당 창고만 로드, 구획 옵션에 배정 상품 표시). 자동배정과 같은 advisory lock. expectedLocationId 불일치 → 거부. 대상 칸 점유 시 교환(나 해제 → 상대를 내 원래 자리(없으면 해제) → 나 목표), 분류/창고유형 불일치(교환 상대 포함)는 경고. 경고가 있으면 status "confirm" 반환(변경 없음) → mode=set-confirmed + expectedOccupantId 일치 시에만 진행. 클라이언트는 확인받은 targetCode와 현재 선택이 같을 때만 [확인하고 변경] 표시. 해제(mode=clear) 지원. 이력 `ProductLocationHistory`(fromCode, toCode, swappedWithSku, reason) — 교환 시 양쪽 기록, 팝업에 최근 5건
- 기본 보관위치(`Product.locationId`, 한 칸에 한 상품)는 "원래 자리" 의미로 유지. 실제 재고는 어느 칸이든 여러 상품 가능
- 창고·랙 비활성화(2026-10-04) `active.ts`: `Warehouse.isActive`·`Rack.isActive`(기본 true, 마이그레이션 `20261004073800_warehouse_rack_active`). 칸은 창고와 랙이 모두 사용 중일 때만 새 위치로 지정 가능 — 입고 위치·발주 입고 위치·원장 [위치 이동] 대상·보관위치 변경 대상은 서버에서 `inactiveLocationMessage(tx, locationId)`로 거부(창고 행 `FOR SHARE`), 자동 배정·위치 선택(`listRacksForPicker`, LocationEditor 창고 목록)에서 제외, 비활성 창고는 랙 추가 불가. 비활성화 조건: 그 범위 칸에 재고(수량>0)·기본 보관위치 상품·확정 대기 입고(locationId)·대기 출고(pickLocationId)가 없어야 함(있으면 건수·예시와 함께 거부). 자동 배정과 같은 advisory lock → 창고 행 `FOR UPDATE` 순서로 잠금, 이미 그 상태면 거부. 다시 사용은 조건 없음. 기존 재고 조회·출고·취소(역이력으로 비활성 칸에 복원될 수 있음, 위치 이동으로 옮김)는 그대로. 화면: 창고 상세 [비활성화](확인 후)/[다시 사용], 랙 표 '상태' 칸 버튼, 창고 카드·상세 '비활성' 배지, 재고현황 창고 필터에 '(비활성)' 표시. 감사 로그 WAREHOUSE_ACTIVE/INACTIVE, RACK_ACTIVE/INACTIVE
- 구획별 재고 1단계 완료(2026-10-03). 2단계: ~~위치 이동(MOVE)~~ 완료, ~~출고 위치 직접 지정~~ 완료, ~~보관 온도 검사~~ 완료, ~~배치도 칸 수량~~ 완료, ~~창고 선택~~ 완료(재고현황 필터) / 3단계: ~~유통기한 임박·만료 알림~~ 완료, 칸 단위 실사. 그 외: ~~랙/창고 비활성화~~ 완료

## 수발주 (modules/order) — 2026-10-02
- 모델: `TradeOrder`(type PURCHASE/SALES, orderNo PO-/SO-YYYYMMDD-NNN unique, partnerId(필수, 거래처 마스터 FK), status OPEN/PARTIAL/DONE/CLOSED/CANCELLED, dueDate KST 자정, memo, version, requestId unique), `TradeOrderLine`(seq, productId unique per order, quantity>0, unitPrice?, processedQty CHECK 0~quantity). `Inbound.orderLineId?`, `Outbound.orderLineId?`
- 번호: `lib/doc-number.ts` `nextDocNumber`(접두어+KST날짜별 advisory lock → 마지막+1)
- `processOrder`: 주문 행 FOR UPDATE + version 확인, 품목별 남은 수량 이하만, 발주→Inbound+changeStock / 수주→Outbound+changeStock(재고 부족 시 전체 롤백), 요청키 `requestId:lineId`를 Inbound/Outbound.requestId로 → 이중 처리 차단, 처리 후 `refreshOrderStatus`
- `finishOrder`: close(잔량 종결, PARTIAL만) / cancel(OPEN이고 처리 0일 때만)
- 연동: 입고/출고 **수정**으로 수량이 바뀌면 `adjustOrderLineProcessed`(조건부 UPDATE, 범위 벗어나면 거부) + 상태 재계산. 불변식 processedQty == 연결된 입고/출고 수량 합
- 화면 (2026-10-01 발주/수주 메뉴 분리): 사이드 메뉴 '발주'·'수주'가 각각 `/orders/purchase`·`/orders/sales`(`?status=active|all|…&q=`) 목록으로 연결. 예전 `/orders`(`?type=sales`)는 새 주소로 리다이렉트. 목록 등록 모달(품목 줄 추가·삭제, 수주는 판매가 기본·재고 부족 경고, 성공 시 상세로 이동), `/orders/[type]/[id]` 상세(주소의 종류와 실제 주문 종류가 다르면 404, 사이드바가 상세에서도 맞는 메뉴를 강조)(품목별 주문/처리/남은 수량·이력), 입고/출고 처리 모달(기본값 남은 수량, 수주는 현재고까지), 잔량 종결·주문 취소(확인 후)

## 배차 (modules/dispatch) — 2026-10-02
- 모델: `Vehicle`(plateNo unique 공백 제거, storageType 적재 온도, driverName, driverPhone?, isActive), `Dispatch`(dispatchNo DSP-YYYYMMDD-NNN, deliveryDate KST 자정, vehicleId, status PLANNED/LOADED/IN_TRANSIT/DELIVERED/CANCELLED, version, requestId, deliveredAt, cancelledAt), `DispatchItem`(outboundId **unique** = 출고 1건은 배차 1곳, seq 배송 순서)
- 온도 규칙 `canCarry`: 냉동(2) ≥ 냉장(1) ≥ 실온(0), 차량 등급 ≥ 상품 등급(분류→`storageTypeForCategory`)이어야 적재
- 배정은 advisory lock 'dispatch-assign' + unique로 중복 배차 차단. 상태는 한 단계씩만(배차→상차 완료→배송중→배송 완료), 취소는 출발 전만 가능하며 품목을 지워 출고를 다시 배차 대기로. 품목 추가/빼기는 배차 단계에서만(마지막 1건은 빼기 불가 → 취소)
- 차량 운행 중지는 진행 중 배차가 없을 때만
- 화면 `/dispatch?date=YYYY-MM-DD`(전날/다음날, 배차 카드: 차량·기사·품목·상태 버튼·출고 추가·빼기·취소), 배차 등록 모달(차량 선택 시 못 싣는 출고는 체크 불가, 최근 14일 미배차 출고), `/dispatch/vehicles` 차량 등록·운행 중지/재개

## 사용자 · 권한 (modules/user) — 2026-10-02
- 모델: `User`(loginId unique 소문자 CHECK `^[a-z0-9][a-z0-9._-]{2,29}$`, name, role enum UserRole STAFF/ADMIN/WAREHOUSE/VIEWER, passwordHash scrypt, isActive, version), `Session`(id = 토큰 SHA-256, userId, expiresAt). 마이그레이션 `20261002121346_users_roles`
- 인증: 아이디·비밀번호 → `wl_session` 쿠키(httpOnly, sameSite lax, 운영 secure, 12시간). DB에는 토큰 해시만. 실패 사유는 구분하지 않고, 없는 아이디도 더미 해시와 비교(시간 차 노출 방지). 로그인·실패·로그아웃은 감사 로그(USER)
- `proxy.ts`: 쿠키 없으면 `/login` (1차 확인만). **실제 확인은 페이지 `requirePageUser()` + `can()`, Server Action `authorize(perm)`** — 메뉴 숨김에만 의존하지 않음
- 권한표 `modules/user/codes.ts` `PERMISSIONS`(화면·서버 공용):
  - 직원: `product.create`(대기로 등록, 판매가 입력 없음), `inbound.create`·`outbound.create`(대기로 등록, 단가 입력 없음), `inbound.view`·`outbound.view`·`stock.view`(조회만, 금액 제외)
  - 입출고 담당(WAREHOUSE, 마이그레이션 `user_roles_warehouse_viewer`): 직원 권한 + `inbound.manage`·`outbound.manage`(등록 즉시 확정·수정·취소) + `price.view`(확정·수정 때 단가를 다루므로 포함). 상품 확정·창고·배차·사용자 등 `admin` 기능은 없음
  - 조회 전용(VIEWER): `inbound.view`·`outbound.view`·`stock.view`만(금액 제외). 입고·출고 화면은 등록 폼 없이 내역만 표시. 등록·변경 Server Action은 모두 권한표로 거부
  - 관리자: 위 + `product.confirm`(확정·반려), `product.manage`(수정·비활성화·다시 사용), `inbound.manage`·`outbound.manage`(확정·수정·취소·대기 삭제), `price.view`, `admin`(발주·수주, 배차·차량, 창고, 안전재고·위치 변경, 로그, 사용자, 거래처)
- 금액 숨김은 서버에서 값을 내려주지 않는 방식(상품 판매가, 입고 단가·수정 기록의 단가, 재고현황 판매가·재고금액·요약 카드)
- 관리자 화면 `/users`: 사용자 추가, 이름·역할·사용 여부 수정(version), 비밀번호 재설정(기존 세션 종료). 본인 역할·사용 여부 변경 불가, 활성 관리자 최소 1명 유지(advisory lock). 역할 변경·중지 시 해당 사용자 세션 삭제
- 로그인 시도 제한 (2026-10-03, 마이그레이션 `20261003063758_login_throttle`): `LoginThrottle`(loginId PK, failCount CHECK >= 0, lockedUntil). 같은 아이디 연속 `LOGIN_LIMITS.maxFails`(5)회 실패 → `lockMinutes`(15)분 차단, 잠금 중엔 비밀번호를 비교하지 않음. 없는 아이디도 똑같이 세고 잠금(존재 여부 노출 방지). 실패 기록은 아이디별 advisory lock으로 직렬화, 잠금이 끝난 기록은 1부터 다시 셈. 성공·관리자 재설정·본인 변경 시 기록 삭제. 잠기는 순간 감사 로그 `LOGIN_LOCKED`(잠긴 동안의 시도는 기록 안 함). IP 기준 제한은 없음
- 본인 비밀번호 변경: 헤더 사용자 메뉴 [비밀번호 변경] 모달(`components/PasswordChangeModal.tsx`). 로그인 사용자 누구나(`changeOwnPasswordAction`, 권한표 항목 없음). 현재 비밀번호 확인(틀리면 로그인 시도 제한에 포함) + 새 비밀번호 규칙·확인 일치·현재와 다름. 현재 세션만 남기고 다른 세션 삭제, 감사 로그 `USER_PASSWORD_CHANGE`
- 시드 기본 계정: `admin`/`admin1234`(관리자), `staff`/`staff1234`(직원) — 운영 전 반드시 변경

## 거래처 마스터 (modules/partner) — 2026-10-08
- 목적: 공급처·출고처를 글자로 직접 입력하면 오타로 거래처별 집계가 어긋나므로, 등록된 거래처를 선택해 `partnerId`로 연결
- 모델: `Partner`(name, type enum PartnerType SUPPLIER/CUSTOMER/BOTH, isActive, version). 이름은 앞뒤 공백 제거·연속 공백 1칸(`normalizePartnerName`), DB CHECK + **대소문자 무시 유니크 인덱스 `lower(name)`**(`Partner_name_lower_key`). 마이그레이션 `20261008090000_partner_master`
- FK: `Inbound.partnerId?`(공급처), `Outbound.partnerId?`(출고처), `TradeOrder.partnerId`(필수). 모두 ON DELETE RESTRICT. 기존 문자열 컬럼(supplier·customer·partner)은 제거
- 마이그레이션 이전: 기존 문자열을 DISTINCT(대소문자·앞뒤 공백만 다른 값은 한 거래처로 합침)로 Partner 생성 → FK 연결. 입고에서 나온 값=공급처, 출고=출고처, 발주=공급처·수주=출고처, 양쪽에 쓰였으면 BOTH. 오타로 갈라진 기존 이름은 별개 거래처로 남으므로 관리자가 정리
- 검증: 입고·출고·주문 폼은 `partnerId`(형식만 `parsePartnerId`), 서비스 트랜잭션 안에서 `resolvePartner`로 존재·용도(공급처/출고처)·사용 중 여부 확인. 수정 시 원래 거래처는 사용 중지여도 그대로 둘 수 있음(`keepId`). 입고·발주는 SUPPLIER/BOTH, 출고·수주는 CUSTOMER/BOTH만 선택 가능
- 입고·출고의 거래처는 선택 입력(기존 규칙 유지), 발주·수주는 필수
- 관리자 화면 `/partners`(권한 `admin`, 메뉴 '관리 > 거래처'): 추가, 이름·구분·사용 여부 수정(version). 거래 기록이 있는 용도는 구분에서 뺄 수 없음. 이름 변경은 기존 기록에도 새 이름으로 표시됨. 직원은 목록에서 선택만 가능(등록·수정 불가)
- 감사 로그: category PARTNER, `PARTNER_CREATE`·`PARTNER_UPDATE`. 입고·출고 감사·수정 기록(JSON)의 `supplier`·`customer` 항목에는 거래처 **이름**을 남김(기록 시점 이름 보존)
- 선택 UI 공용 컴포넌트 `components/PartnerSelect.tsx`(name=`partnerId`)

## 공지사항 (modules/notice) — 2026-10-08
- 모델 `Notice`(title, body, isPinned, isPublished, authorName 작성 시점 이름, version, requestId unique). DB CHECK: 제목·내용은 공백만 불가. 마이그레이션 `20261008120000_notice`(AuditCategory `NOTICE` 추가 포함)
- 관리 화면 `/notices`(권한 `admin`, 메뉴 '관리 > 공지사항'): 작성·수정(모달, version으로 동시 수정 방지, 등록은 requestId). **삭제 없음** — 게시 중지로 내림. 제목 100자·내용 2000자
- 대시보드 '공지사항' 카드: 모든 로그인 사용자에게 게시 중인 공지 최대 5건(상단 고정 → 최신순), 제목 클릭 시 내용 펼침(줄바꿈 유지)
- 감사 로그: category NOTICE, `NOTICE_CREATE`·`NOTICE_UPDATE`

## 상품 확정 · 입고 확정/취소 — 2026-10-02
- `Product.status` PENDING/ACTIVE(기존 데이터 ACTIVE), createdBy/confirmedBy/confirmedAt. 직원 등록 = PENDING(price 0) → 관리자 확정(판매가 입력) 또는 반려(대기 상품만 실제 삭제, 사유는 감사 로그). 관리자 등록은 바로 ACTIVE
- **대기 상품은** 입고·출고·주문·재고현황·위치 자동 배정·위치 변경에서 제외/거부
- 상품 수정·비활성화(2026-10-04, `product.manage` = 관리자, `/products/new` 목록 행의 [수정]·[비활성화/다시 사용]):
  - `ProductStatus.INACTIVE` 추가(마이그레이션 `product_inactive`). INACTIVE도 대기 상품과 같이 입고·출고·주문·재고현황·위치 배정·변경에서 제외/거부(모두 `status: ACTIVE` 조건). 목록은 기본 숨김, '비활성 포함' 체크(`?inactive=1`)로 표시
  - 수정 대상: 품명·분류·보관 온도·판매가(ACTIVE만)·박스당 입수(BOX 단위 제외)·안전재고. **품목코드·기본단위·유통기한 관리는 수정 불가**(이력 의미 보존). 동시 수정 방지는 수정 대상 값 스냅샷(`productVersion`)을 hidden `version`으로 보내 서버가 행 잠금 후 비교(재고 변동으로 updatedAt이 바뀌어도 충돌하지 않음). 변경 없음이면 거부, 감사 로그 `PRODUCT_UPDATE`(전후 값)
  - 비활성화 조건(`setProductActive`): 현재고 0, 확정 대기 입고·출고 없음, 진행 중(OPEN/PARTIAL·잔량 있음) 발주·수주 없음. 기본 보관위치는 해제하고 `ProductLocationHistory`에 기록. 대기 상품은 대상 아님(확정·반려 사용). 이미 그 상태면 거부. 다시 사용 시 위치는 비어 있음. 감사 로그 `PRODUCT_INACTIVE`·`PRODUCT_ACTIVE`
- `Inbound.status` PENDING/CONFIRMED/CANCELLED(기존 CONFIRMED), createdBy/confirmedBy/cancelledBy, cancelReason. CHECK: 취소면 cancelledAt·cancelReason 필수, 대기면 orderLineId 없음(발주 입고는 즉시 확정)
  - 직원 등록 = PENDING, **재고 미반영**(StockMovement 없음, 단가 null). 관리자 등록은 바로 CONFIRMED + changeStock
  - 확정 `confirmInbound`: status·version 조건부 UPDATE → changeStock(INBOUND). 단가 입력 가능
  - 수정: 대기 건은 재고 영향 없음(InboundRevision.quantityDelta 0), 확정 건은 기존대로 정정 이력. 취소 건 수정 불가
  - 취소 `cancelInbound`(확정 건만): 삭제하지 않고 CANCELLED + changeStock(-수량, `INBOUND_CANCEL`), 재고 부족이면 거부. 발주 연결 건은 처리수량도 되돌림 → 불변식: processedQty == 연결된 **취소 안 된** 입고/출고 수량 합
  - 삭제 `deletePendingInbound`: 대기 건만 실제 삭제(수정 기록 포함). 재고 이력이 없으므로 불변식 영향 없음
- 입고 화면: 대기 건 전부(최대 200) + 최근 확정·취소 20건, 상태·등록자 칸. 관리자는 체크 1건 선택 후 [선택 확정]·[선택 수정]·[선택 취소]·[선택 삭제]
- 재고현황 최근 입고일은 확정 입고만, 원장에 '입고취소'(비고 = 취소 사유)

### 출고 (입고와 같은 구조) — 마이그레이션 `20261002123842_outbound_status`
- `Outbound.status` PENDING/CONFIRMED/CANCELLED(기존 CONFIRMED) + createdBy/confirmedBy/cancelledBy, cancelReason, 같은 CHECK 2개. 재고이력 `OUTBOUND_CANCEL`(+수량)
- 권한 `outbound.create`(직원·관리자, 메뉴 '출고'), `outbound.manage`(관리자: 확정·수정·취소·대기 삭제)
- 직원 등록 = PENDING, 재고 미차감, 단가 저장 안 함(폼에 단가 칸·판매가 기본값 없음). 등록 시점 현재고보다 많으면 거부하지만 **예약은 하지 않음** → 확정 시 재고 부족이면 거부(대기 유지)
- 확정 `confirmOutbound`: 조건부 UPDATE → changeStock(OUTBOUND, 부족 시 롤백). 단가 입력(기본 판매가)
- 취소 `cancelOutbound`(확정 건만): CANCELLED + changeStock(+수량, OUTBOUND_CANCEL), 수주 연결 건은 처리수량 되돌림. **배차에 실린 출고는 거부**(배차에서 빼거나 배차 취소 후)
- 삭제 `deletePendingOutbound`: 대기 건만 실제 삭제
- 배차: 확정 출고만 배차 대기 목록·배정 가능(`checkOutbounds`에서도 거부). 수주 상세 출고 내역·재고현황 최근 출고일은 취소/대기 제외

## 감사 로그 (modules/audit) — 2026-10-02
- 모델: `AuditLog`(category enum AuditCategory PRODUCT/INBOUND/OUTBOUND/STOCK/WAREHOUSE/ORDER/DISPATCH/VEHICLE/USER/PARTNER/NOTICE, action 작업코드, targetId?, targetLabel?, summary 한국어 한 줄, detail Json?(입력값·before/after), actorId?(FK 없음)·actor? "이름(아이디)" — `recordAudit`이 현재 로그인 사용자를 자동 기록, 요청 밖(시드)은 null, createdAt). 인덱스 (createdAt), (category, createdAt). 마이그레이션 `20261002120000_audit_log`
- **추가만 가능**: DB 트리거 `AuditLog_no_update_delete`(BEFORE UPDATE OR DELETE)·`AuditLog_no_truncate`가 예외 발생. 앱에도 수정·삭제 함수/화면 없음
- 기록: `recordAudit(tx, …)`를 **작업과 같은 트랜잭션**에서 호출 → 작업 롤백 시 로그도 없음, 로그 실패 시 작업 취소. 쓰기 작업을 새로 만들면 반드시 기록 추가
- 기록 대상: 상품 등록, 입고/출고 등록·수정(`auditRevision`으로 바뀐 항목 전후, 일시는 KST), 안전재고 변경(값이 같으면 기록 안 함), 창고 추가·랙 추가·창고/랙 비활성화·다시 사용·위치 자동 배정(대상 상품 있을 때)·보관위치 변경, 주문 등록·입고/출고 처리·잔량 종결·취소, 차량 등록·운행 중지/재개, 배차 등록·품목 추가/빼기·상태 변경
- 라벨: `codes.ts`(`AUDIT_ACTION_LABELS`, `AUDIT_FIELD_LABELS`, 구분 배지 색 `AUDIT_CATEGORY_TONE`)
- 화면 `/logs`(사이드바 관리 > 로그): 구분·기간(KST, 종료일 포함)·대상/내용 검색, 최신순 50건씩 페이지, 내용 클릭 시 상세 펼침

## 디자인 시스템 (Indigo Enterprise) — 요약본, 원문은 `docs/WMS_design-system_indigo.md`
방향: 업무용으로 깔끔하고 정보 밀도 높게. **Indigo(중요 정보) + White(업무 영역) + Cool Gray(배경)**. 장식·그라데이션·과한 둥근 모서리·애니메이션 금지. 새 색·반경·버튼 스타일을 만들지 말고 기존 토큰과 `components/ui/*`를 재사용한다. 색·반경은 `app/globals.css`의 `:root` 변수가 기준.

| 구분 | 값 | 구현 |
| --- | --- | --- |
| Primary | `#315EEA` (hover `#244ED8`) | `bg-primary` |
| 사이드바 | 배경 `#101B3D`, 활성 `#1D3A8A`, 글자 `#C7D0E3` | `--sidebar*` |
| 배경 / 카드 | 페이지 `#F6F8FC`, 카드·입력·헤더 `#FFFFFF` | `bg-background` / `bg-card` |
| 텍스트 | 기본 `#172033`, 보조 `#526078`, placeholder `#98A2B3` | `text-foreground`, `text-muted-foreground` |
| 테두리 | `#E3E8F0`, 입력 `#D3DAE6`, 포커스 `#6B82F5` | `border`, `border-input`, `--ring` |
| 상태 색 | 정상 초록 · 부족 노랑 · 품절 빨강 · 예약 파랑 (색만으로 구분 금지, 라벨 병기) | `Badge` variant green·amber·red·sky |
| 반경 | 입력·버튼 8px, 뱃지 6px, 카드 12px | `--radius-*` |
| 높이 | 버튼 36px(sm 32 / lg 40), 입력 36px, 뱃지 24px, 헤더 64px, 표 행 48px | `components/ui/*` |
| 폰트 | 영문·숫자·코드 Inter, 한글 Pretendard(`app/fonts/`에서 직접 제공, 외부 CDN 없음). 본문 14px, 표 13px | `layout.tsx`, `--font-sans` |

- 표(`.data-table`): 기본 가운데(날짜·상태), 상품명·코드·거래처·비고는 th/td에 `.left`, 수량·금액은 `.num`(오른쪽). 수량은 단위까지 표기, 부족 재고는 노랑·품절은 빨강 글자
- 다크 모드 없음. 전환 150~200ms ease-out, 그림자는 최소(카드 `0 1px 3px`, 모달·드롭다운만 강하게)
- 같은 기능은 모든 화면에서 같은 UI(검색 버튼, 제목, 상태 뱃지, 표, 모달). 상태→색 매핑은 `modules/*/codes.ts`의 `*_STATUS_TONE`
- 빈 상태·오류는 사용자가 이해할 한국어 문구로, 개발자용 오류는 로그로

## 헤더 · 대시보드 · 공통 UI (2026-10-02, 참조 목업 기준)
- **헤더** `components/Header.tsx`(64px): 현재 위치 / 상품 검색(→ `/stock?q=`) / 날짜·시각(KST, `lib/datetime.ts formatKstNow`, 30초마다 갱신) / 재고 알림 벨(재고 없음·부족 수, → `/stock?status=short`) / 사용자 메뉴(이름·역할, 로그아웃). 사이드바 하단의 사용자·로그아웃은 헤더로 이동. 검색·알림은 `stock.view` 권한이 있을 때만 표시. 알림 수는 `app/layout.tsx`에서 `countShortStock()`으로 조회. **창고 선택은 헤더에 두지 않음** — 재고현황에만 적용되므로 재고현황 필터의 '창고'로 둔다
- **대시보드** `/` (`app/page.tsx`, 집계 `modules/dashboard/queries.ts` 읽기 전용): 오늘의 운영 현황 KPI 4개(입고 건수·출고 건수·현재 재고 수량·재고 부족 상품) + 주요 알림(부족·품절 상위 5, 관리자는 확정 대기 상품·입고·출고 건수) + 최근 입출고 내역(확정 건 6개). 기간은 KST 하루(자정~자정), 입고·출고는 `CONFIRMED`만 집계하고 전일 대비 증감 표시. 재고 카드·알림은 `stock.view` 권한 필요, 대기 건수는 `admin`만
- **KpiCard** `components/KpiCard.tsx`: 라벨+아이콘 / 큰 숫자+단위 / 증감(▲▼ 화살표+문구, 색만으로 구분하지 않음) 또는 보조 문구. `href`를 주면 해당 목록으로 이동. 부족·품절은 `tone`으로 노랑·빨강
- **EmptyState** `components/EmptyState.tsx`: 아이콘+제목+안내 문구(+버튼). 표의 빈 행은 `<td colSpan className="p-0"><EmptyState …/></td>`로 통일(재고·입고·출고·상품·발주/수주·로그·차량·랙·재고 이력)
- **Skeleton** `components/Skeleton.tsx`(Skeleton·KpiCardSkeleton·TableSkeleton) + `app/loading.tsx`: 페이지 이동 중 제목·KPI·표 모양을 먼저 보여 줌(스피너로 화면 전체를 막지 않음)
- **대시보드 차트·위젯** (2026-10-08, 집계 `modules/dashboard/queries.ts`): 모두 읽기 전용, 차트 라이브러리 없이 SVG/CSS로 구현(색 토큰 `chart-1`·`chart-3`)
  - 입출고 추이 `components/charts/TrendChart.tsx`: 최근 7일(KST, 오늘 포함) 확정 입고·출고 **건수** 묶음 막대. 건수 없는 날은 0. 범례 글자·막대 위 숫자·sr-only 표 병행. `getInOutTrend`
  - 창고별 재고(`stock.view`): `StockBalance` 구획 재고를 창고별 합산, 위치 없는 재고는 '위치 미지정'. `getWarehouseStock`
  - 주문 상태 현황(`admin`): 발주·수주별 진행 전·일부 처리·완료 건수(종결·취소 제외), 각 칸은 `/orders/<type>?status=`로 이동. `getOrderStatusCounts`
- 아직 안 한 것: 홈 화면(Quick Action 카드), 대시보드 기간 전환(오늘·7일·30일)

## 기간별 리포트 · 엑셀 내보내기 (modules/report) — 2026-10-08
- 화면 `/reports`(권한 `admin`, 메뉴 '업무 > 리포트'): 구분(입고/출고)·집계 기준(일자별/상품별/거래처별)·기간(시작~종료, KST 종료일 포함) GET 필터 + 바로가기(오늘·7일·30일, 오늘 포함). 기본은 입고·일자별·최근 7일
- 집계 대상은 **확정(CONFIRMED)** 건만(대기·취소 제외). 입고 `receivedAt`, 출고 `shippedAt` 기준. 건수·금액(수량×단가, 단가 없는 건은 금액에서 제외하고 안내)이 기본, 수량은 단위가 같은 **상품별에서만** 표시(단위가 섞이는 일자·거래처별은 합산 안 함)
- 조회 기간 최대 366일(`REPORT_LIMITS.maxDays`), 시작>종료면 서로 바꿈. 일자 묶음은 KST(`+9시간`) 기준 SQL 집계
- 엑셀 `GET /reports/export?kind&group&from&to`(Route Handler, `getCurrentUser`+`can(admin)` 서버 재확인, exceljs): 시트1 '집계'(합계 행 포함), 시트2 '내역'(건별, 최대 `maxDetailRows` 5만건 — 넘으면 기간을 줄이라는 오류). 파일명 `입고_일자별_시작_종료.xlsx`
- 아직 안 한 것: 기존 입고·출고·재고 이동 이력 화면의 기간 필터, 대시보드 기간(오늘·7일·30일) 전환, 재고 증감(StockMovement) 기준 집계

## 입출고 상품 선택 = 서버 검색 — 2026-10-08
- 입고·출고 화면은 상품 전체를 내려받지 않고, 처음에는 앞쪽 `PRODUCT_SEARCH_LIMIT`(20)개 + 전체 개수만 받는다. 검색어를 입력하면 0.25초 뒤 Server Action(`searchInboundProductsAction`·`searchOutboundProductsAction`, 권한 `inbound.create`/`outbound.create`)으로 조회, 코드·품명·분류 부분일치(대소문자 무시)·확정(ACTIVE) 상품만, 최대 20개 + 검색 결과 전체 개수. 빈 검색어는 처음 목록으로 복귀
- 서비스 `searchProductsForInbound`·`searchProductsForOutbound`(조건 `activeProductSearchWhere`, 검색어 정리 `normalizeProductKeyword` — modules/product/service.ts). 출고는 판매가를 `price.view` 권한이 있을 때만 내려줌
- 화면: 고른 상품은 검색어를 바꿔도 유지, 결과가 20개를 넘으면 안내 문구 표시

## 중복 방지 (입고·출고 공통)
1. 요청 고유키: 폼이 저장 성공 전까지 같은 requestId 재사용 → 서버는 기존 requestId면 거부, 동시 요청은 unique 제약(P2002)로 1건만 저장
2. 유사 건 경고: 최근 10분 내 같은 상품·거래처·수량이 있으면 status "confirm" 반환(저장 안 함) → [그래도 등록](confirmDuplicate=1) 시 저장

## 화면
- `/products/new` 상품등록·목록·검색 (목록은 30개씩 페이지 나누기 `listProducts(keyword, includeInactive, page)` → `PRODUCT_PAGE_SIZE`, `?q=&inactive=1&page=`, 범위를 벗어난 page 는 마지막 페이지로, 확정 대기 수는 조건 전체 기준, 정렬 확정 대기 → 최신 등록 → 코드 → id)
- 박스 단위 환산 입출고(2026-10-08): 입고·출고 **등록 폼**에서 기본단위가 BOX가 아니고 `boxQty` ≥ 2인 상품을 고르면 수량 옆에 단위 선택(기본단위/박스, `qtyUnit`)이 나타남. 박스를 고르면 서버가 `convertBoxesToBase`(`modules/product/service.ts`)로 상품의 `boxQty`를 곱해 기본단위로 환산(클라이언트 값 불신, 환산 후 `maxQuantity` 재검증). 재고·이력·수정 모달은 항상 기본단위. 스키마 변경 없음. 수정·확정 모달은 기본단위 입력만
- `/inbound`, `/outbound`: 등록 폼 + 최근 20건 표(`.data-table` 정렬 규칙, '수정 사유' 칸). 체크박스 1건 선택 → [선택 수정] native `<dialog>` 모달
  - 모달 key에 version 넣지 말 것 (저장 직후 revalidate 리마운트로 성공 상태 유실)
  - 입고·출고 폼의 상품 선택 목록은 전체 상품을 내려받음 — 상품 많아지면 검색형(서버 검색)으로 바꿀 것
- `/stock` 재고현황: 요약 카드, GET 필터 폼(조회 시 page 초기화), 표, 페이지 이동(필터 유지, 1 … 4 5 [6] 7 8 … N), 행 클릭 → 재고 원장 + 안전재고 설정 모달
- 입출고 처리 시 `/inbound`, `/outbound`, `/products/new` 재검증 (`/stock`은 dynamic 페이지라 이동 시 최신 조회)

## 운영 메모
- 스키마 변경 후: 개발 서버 종료 → `npx prisma migrate dev` → 재시작 (윈도우는 실행 중 엔진 파일 잠김)
- DB는 docker compose (`warehouse-linker_pg`). Docker Desktop 꺼져 있으면 `Can't reach database server`

## 미결 / 추천 후보
- 로그인 시도 제한, 본인 비밀번호 변경, 역할 세분화(입출고 담당·조회 전용 등)
- 입고/출고 취소(전표 무효화 + 역이력)
- 유통기한 임박 우선(FEFO) 출고 옵션
- 배차관리 연동 (기간별 집계·엑셀은 `/reports`로 구현)
- 대시보드(`/`)는 개발중 안내 화면
- 대량 데이터 대비: 코드·품명 부분검색이 느려지면 pg_trgm 인덱스
