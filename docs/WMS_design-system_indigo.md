# WMS Design System
## Indigo Enterprise UI System

> WMS(Web-based Warehouse Management System)의 전체 UI/UX를 통일하기 위한 디자인 시스템이다.
> 신규 화면, 컴포넌트, 기능을 추가할 때 이 문서의 원칙과 토큰을 우선 적용한다.

---

# 1. Design Direction

## 1.1 Overall Style

목표는 다음과 같은 Enterprise SaaS WMS이다.

- Clean & Professional
- Modern Enterprise
- Data-focused
- Calm & Reliable
- High readability
- High information density without visual clutter

핵심 원칙:

> 화려해서 예쁜 화면보다, 업무용 프로그램인데 완성도가 높고 깔끔해서 계속 쓰고 싶은 화면을 만든다.

---

# 2. Visual Concept

## 2.1 Indigo Enterprise

전체 디자인의 중심은 다음 세 가지다.

```text
Indigo
   +
White
   +
Cool Gray
```

### Indigo

브랜드와 중요한 업무 정보를 표현한다.

- Sidebar
- Active navigation
- Primary button
- 핵심 KPI
- 선택 상태
- 주요 링크
- 핵심 아이콘

### White

실제 업무 영역이다.

- Card
- Table
- Form
- Dashboard content
- Modal

### Cool Gray

화면의 배경과 구분 영역이다.

- Page background
- Filter area
- Secondary area
- Disabled / subtle information

> 화면 전체를 Indigo로 채우지 않는다.
> White와 Cool Gray를 넓게 사용하고 Indigo는 중요한 정보에 집중한다.

---

# 3. Color System

## 3.1 Primary — Indigo

```text
Primary 900   #101B3D
Primary 800   #172554
Primary 700   #1D3A8A
Primary 600   #244ED8
Primary 500   #315EEA
Primary 400   #5B7CFA
Primary 300   #9BB0FF
Primary 200   #C7D2FE
Primary 100   #E8EDFF
Primary 50    #F3F6FF
```

## 3.2 Neutral

### Background

```text
Page Background     #F6F8FC
Surface             #FFFFFF
Surface Secondary   #F9FAFC
Surface Hover       #F3F6FA
```

### Text

```text
Text Primary        #172033
Text Secondary      #526078
Text Tertiary       #7C879B
Text Disabled       #AAB2C0
Text Inverse        #FFFFFF
```

### Border

```text
Border              #E3E8F0
Border Strong       #D3DAE6
Border Focus        #6B82F5
```

> Pure Black (#000000)을 기본 텍스트로 사용하지 않는다.
> Dark Navy 계열을 사용해 장시간 업무 화면의 시각적 피로를 줄인다.

---

# 4. Semantic Colors

```text
Success
Primary: #16A67A
Background: #EAF8F3
Text: #087A5B

Warning
Primary: #D89B18
Background: #FFF7E1
Text: #996B00

Danger
Primary: #E05252
Background: #FFF0F0
Text: #B42323

Info
Primary: #3B82F6
Background: #EEF5FF
Text: #2459A6
```

## Inventory Status

```text
정상       → Success
부족       → Warning
품절       → Danger
예약       → Info
```

색상만으로 상태를 표현하지 않는다.

Badge, Text, Icon, 상태값을 함께 사용한다.

---

# 5. Typography

## Font Family

### Primary Font Stack

```css
font-family:
  "Inter",
  "Pretendard",
  system-ui,
  sans-serif;

Font Usage :

Korean UI → Pretendard
English → Inter
Numbers → Inter
SKU / Barcode / Product Code → Inter
Date / Quantity / Price → Inter
Mixed Korean + English → Global font stack 사용
별도의 span이나 class로 한글/영문 폰트를 수동 지정하지 않는다.

원칙:

- 영문 / 숫자 / 코드 → Inter 우선
- 한글 → Pretendard
- 숫자와 코드값은 가독성을 최우선으로 한다.

## 5.2 Typography Scale

### Page Title

```text
24px
font-weight: 700
line-height: 1.35
```

### Section Title

```text
18px
font-weight: 700
line-height: 1.4
```

### Card Title

```text
15px
font-weight: 600
```

### Body

```text
14px
font-weight: 400
line-height: 1.5
```

### Table

```text
13px ~ 14px
```

### Caption

```text
12px
font-weight: 400
```

---

# 6. Layout

## 6.1 Global Layout

```text
┌──────────────────────────────────────────────┐
│ Top Header                                   │
├────────────┬─────────────────────────────────┤
│            │                                 │
│ Sidebar    │ Main Content                    │
│            │                                 │
│            │                                 │
└────────────┴─────────────────────────────────┘
```

## 6.2 Sidebar

```text
Width: 220px ~ 240px
Background: #101B3D
```

### Active Menu

```text
Background: #1D3A8A
Text: #FFFFFF
Icon: #FFFFFF
Radius: 8px
```

### Inactive Menu

```text
Text: #C7D0E3
Icon: #AEB9CF
```

---

# 7. Header

```text
Height: 64px
Background: #FFFFFF
Border Bottom: #E3E8F0
```

권장 구성:

```text
[Global Search]

[Warehouse Selector]
[Date]
[Notification]
[User]
```

Header에는 불필요한 장식을 넣지 않는다.

---

# 8. Page Structure

업무 화면은 다음 구조를 기본으로 한다.

```text
Page
 ├── Page Header
 │    ├── Title
 │    ├── Description
 │    └── Actions
 │
 ├── Filter / Search Area
 │
 ├── KPI / Summary
 │
 ├── Main Content
 │
 └── Pagination / Footer
```

---

# 9. Dashboard

Dashboard의 목적은 물류 운영 상태를 빠르게 파악하는 것이다.

## KPI Card

```text
┌─────────────────────┐
│ 입고 건수        ○  │
│                     │
│ 48 건               │
│ ↑ 12% 전일 대비     │
└─────────────────────┘
```

```text
Background: #FFFFFF
Border: #E3E8F0
Radius: 12px
Padding: 20px
```

권장 Shadow:

```css
box-shadow:
  0 1px 3px rgba(15, 23, 42, 0.04);
```

---

# 10. Dashboard Color Hierarchy

색상은 정보의 중요도를 표현하는 용도로 사용한다.

```text
1. Indigo
   → 핵심 KPI / 주요 데이터

2. Green
   → 정상 / 증가 / 완료

3. Amber
   → 주의 / 부족

4. Red
   → 위험 / 품절 / 오류

5. Gray
   → 일반 정보
```

색상 종류를 불필요하게 늘리지 않는다.

---

# 11. Card System

## Standard Card

```text
Background: #FFFFFF
Border: 1px solid #E3E8F0
Radius: 12px
Padding: 20px
```

## Large Card

```text
Radius: 14px
Padding: 24px
```

Card 안에 Card를 반복해서 중첩하지 않는다.

가능하면:

```text
Card
 ├── Header
 ├── Content
 └── Footer
```

구조를 유지한다.

---

# 12. Buttons

## Primary

```text
Background: #315EEA
Text: #FFFFFF
Radius: 8px
```

## Secondary

```text
Background: #FFFFFF
Border: #D3DAE6
Text: #344054
Radius: 8px
```

## Ghost

```text
Background: transparent
Text: #526078
```

## Danger

```text
Background: #E05252
Text: #FFFFFF
```

### Button Height

```text
Small: 32px
Medium: 36px
Large: 40px
```

기본 업무 버튼은 36px을 사용한다.

---

# 13. Input

```text
Height: 36px ~ 40px
Background: #FFFFFF
Border: #D3DAE6
Radius: 8px
```

Focus:

```text
Border: #6B82F5
Ring: rgba(49, 94, 234, 0.12)
```

Placeholder:

```text
#98A2B3
```

---

# 14. Search / Filter Area

WMS에서 검색 영역은 중요한 업무 영역이다.

권장 구조:

```text
┌───────────────────────────────────────────────┐
│ 검색어 [                    ]  상태 [전체 ▼] │
│ 창고 [전체 ▼]  기간 [        ]  [검색]       │
└───────────────────────────────────────────────┘
```

원칙:

- 검색 조건을 한눈에 파악할 수 있어야 한다.
- 지나치게 큰 입력창을 사용하지 않는다.
- Filter 영역과 Content 영역을 명확하게 구분한다.
- 검색 버튼은 Primary Indigo를 사용한다.

---

# 15. Data Table

WMS에서 가장 중요한 컴포넌트 중 하나다.

## Table Style

```text
Header Background: #F8FAFC
Header Text: #526078
Border: #E3E8F0
Row Height: 48px ~ 52px
```

### Table Header

```text
font-size: 12px
font-weight: 600
color: #526078
```

### Table Body

```text
font-size: 13px ~ 14px
color: #172033
```

### Row Hover

```text
Background: #F7F9FD
```

### Selected Row

```text
Background: #F0F4FF
```

---

# 16. Number Alignment

```text
상품명       → Left
SKU          → Left
바코드        → Left
수량          → Right
금액          → Right
날짜          → Center
상태          → Center
```

숫자 데이터는 기본적으로 Right Align을 사용한다.

---

# 17. Inventory Quantity

재고 수량은 단위까지 명확하게 표현한다.

```text
120 EA
35 BOX
30 L
12 KG
```

### 일반 수량

```text
font-weight: 600
color: #172033
```

### 부족 재고

```text
color: #D89B18
```

### 품절

```text
color: #E05252
```

---

# 18. Badge

```text
Height: 24px
Padding: 0 8px
Radius: 6px
Font Size: 12px
Font Weight: 600
```

예:

```text
[정상]
[부족]
[품절]
[입고]
[출고]
```

Badge에 과도한 Border와 Gradient를 사용하지 않는다.

---

# 19. Icons

Lucide Icons 스타일을 기본으로 사용한다.

```text
Style: Outline
Stroke: 1.8px ~ 2px
```

권장 아이콘:

- Package
- Boxes
- Warehouse
- Truck
- Clipboard
- Search
- Bell
- User
- BarChart3
- ArrowDown
- ArrowUp
- AlertTriangle

아이콘은 장식보다 정보 전달을 위해 사용한다.

---

# 20. Charts

Dashboard Chart는 과도하게 화려하게 만들지 않는다.

```text
Primary   → Indigo
Secondary → Blue / Light Indigo
Positive  → Green
Warning   → Amber
```

Grid는 매우 연하게 사용한다.

Chart 배경은 White를 유지한다.

---

# 21. Spacing System

기본 spacing은 4px 단위 기반으로 한다.

```text
4px
8px
12px
16px
20px
24px
32px
40px
48px
```

권장:

```text
Page Padding       24px ~ 32px
Section Gap        24px
Card Gap           16px
Component Gap      12px
Text Gap           8px
```

---

# 22. Border Radius

```text
Small       6px
Default     8px
Card        12px
Large       14px
```

과도한 `rounded-full` 사용을 금지한다.

WMS는 업무용 시스템이므로 정돈된 Enterprise UI를 유지한다.

---

# 23. Shadow

Shadow는 최소한으로 사용한다.

### Default

```css
0 1px 3px rgba(15, 23, 42, 0.04)
```

### Elevated

```css
0 4px 12px rgba(15, 23, 42, 0.08)
```

Modal / Dropdown / Popover 등에서만 강한 Shadow를 사용한다.

---

# 24. Visual Density

WMS는 일반 소비자용 웹사이트가 아니다.

## Do

- 정보를 효율적으로 배치
- 테이블 행 간격을 적절하게 유지
- 작은 Caption 활용
- KPI와 주요 숫자를 명확하게 강조
- 충분한 여백
- 명확한 정보 계층

## Don't

- 지나치게 큰 글씨
- 과도한 카드
- 과도한 색상
- 과도한 애니메이션
- 과도한 Gradient
- Glassmorphism 남용
- 모든 요소를 둥글게 만들기

---

# 25. Animation

Animation은 업무 흐름을 방해하지 않는 수준으로 사용한다.

```text
Duration: 150ms ~ 200ms
Easing: ease-out
```

사용 예:

- Button hover
- Table row hover
- Sidebar transition
- Dropdown
- Modal

페이지 전체에 과도한 Animation을 사용하지 않는다.

---

# 26. Responsive

Desktop WMS를 기본으로 설계한다.

Primary target:

```text
1440 × 900
1920 × 1080
```

Minimum supported desktop:

```text
1280px
```

화면이 작아질 경우:

- Sidebar 축소
- Filter wrapping
- Table horizontal scroll
- Card layout adjustment

을 사용한다.

---

# 27. Home Screen

Home과 Dashboard의 목적을 구분한다.

## Home

사용자가 자주 사용하는 업무로 빠르게 이동한다.

```text
입고등록
출고등록
재고조회
상품관리
```

## Dashboard

현재 물류 운영 상태를 분석한다.

```text
입고
출고
재고
부족재고
창고가동률
최근 작업
알림
```

---

# 28. Quick Action Card

홈 화면의 주요 업무는 Action Card로 제공한다.

```text
┌────────────────────┐
│  📦                │
│                    │
│  입고등록       →  │
│  입고 예정 상품을  │
│  등록합니다.       │
└────────────────────┘
```

Primary 업무는 Indigo를 사용한다.

나머지 Action은 White Card로 구성한다.

---

# 29. Empty State

데이터가 없을 경우 빈 화면을 보여주지 않는다.

```text
       📦

등록된 상품이 없습니다.

상품을 등록하면
재고 관리가 시작됩니다.

       [상품 등록]
```

Empty State는 차분하고 간결하게 만든다.

---

# 30. Loading State

가능하면 Skeleton UI를 사용한다.

```text
Card  → Skeleton
Table → Row Skeleton
Chart → Chart Skeleton
```

페이지 전체를 단순 Spinner 하나로 막지 않는다.

---

# 31. Error State

사용자가 이해할 수 있는 메시지를 사용한다.

Bad:

```text
PrismaClientValidationError
```

Good:

```text
재고 정보를 불러오지 못했습니다.

잠시 후 다시 시도해주세요.
```

개발자용 상세 오류는 별도의 로그에서 확인한다.

---

# 32. Accessibility

반드시 다음을 준수한다.

- 충분한 Color Contrast
- Keyboard Navigation
- Focus State
- Button 명확한 Label
- Input Label
- Icon-only Button Tooltip
- 색상만으로 상태를 구분하지 않음

---

# 33. Forbidden Styles

다음 디자인은 기본적으로 사용하지 않는다.

```text
❌ 과도한 Gradient
❌ Neon Color
❌ 과도한 Glassmorphism
❌ 과도한 Drop Shadow
❌ 과도한 Border Radius
❌ 과도한 Animation
❌ 무분별한 색상 사용
❌ 페이지마다 다른 UI 스타일
❌ 소비자용 쇼핑몰 같은 화려한 UI
❌ 의미 없는 장식용 그래픽
```

---

# 34. AI Coding Rules

Claude Code / AI Coding Agent가 UI를 생성할 때 반드시 다음 순서를 따른다.

```text
1. design-system.md 확인
2. 기존 공통 컴포넌트 확인
3. 기존 색상 토큰 재사용
4. 기존 Typography 재사용
5. 기존 Button / Input / Table / Card 재사용
6. 새로운 컴포넌트가 필요한지 판단
7. 필요한 경우에만 새로운 컴포넌트 생성
```

## 중요한 원칙

AI가 새로운 화면을 만들 때 자체적으로 새로운 색상이나 스타일을 만들지 않는다.

```text
❌ 새로운 Blue 계열 추가
❌ 새로운 Card Radius 추가
❌ 새로운 Button 스타일 추가
❌ 페이지마다 다른 Table 스타일 생성
```

기존 Design Token과 공통 컴포넌트를 우선 사용한다.

---

# 35. Component Consistency

동일한 기능은 모든 페이지에서 동일한 UI를 사용한다.

예:

```text
검색 버튼
→ 모든 페이지 동일

페이지 제목
→ 동일한 Typography

상태 Badge
→ 동일한 Semantic Color

Table
→ 동일한 Header / Row / Hover

Modal
→ 동일한 구조

Toast
→ 동일한 스타일
```

새로운 컴포넌트를 만들기 전에 기존 컴포넌트를 재사용할 수 있는지 먼저 확인한다.

---

# 36. Recommended Component Catalog

프로젝트에서 다음 공통 컴포넌트를 우선적으로 만든다.

```text
Layout
├── AppShell
├── Sidebar
└── Header

Navigation
├── NavItem
├── Breadcrumb
└── PageHeader

Data
├── DataTable
├── Pagination
├── StatusBadge
├── EmptyState
└── Skeleton

Form
├── SearchBar
├── FilterBar
├── FormField
├── Select
├── DateRangePicker
└── QuantityInput

Dashboard
├── KpiCard
├── QuickActionCard
├── ChartCard
├── ActivityList
└── AlertList

Overlay
├── Modal
├── Drawer
├── Dropdown
└── ConfirmDialog

Feedback
├── Toast
├── ErrorState
└── LoadingState
```

---

# 37. Dashboard Recommended Structure

```text
Dashboard

┌─────────────────────────────────────────────┐
│ Dashboard                                   │
│ 물류 운영 현황을 한눈에 확인할 수 있습니다. │
└─────────────────────────────────────────────┘

┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ 입고   │ │ 출고   │ │ 재고   │ │ 부족   │
│ 48건   │ │ 52건   │ │12,482  │ │ 7개    │
└────────┘ └────────┘ └────────┘ └────────┘

┌──────────────────────┐ ┌───────────────────┐
│ 입출고 추이          │ │ 창고별 재고       │
│                      │ │                   │
│       Chart          │ │      Chart        │
└──────────────────────┘ └───────────────────┘

┌──────────────────────┐ ┌───────────────────┐
│ 주요 알림            │ │ 최근 작업         │
│                      │ │                   │
└──────────────────────┘ └───────────────────┘
```

---

# 38. Design Priority

디자인 충돌이 발생할 경우 다음 우선순위를 따른다.

```text
1. 가독성
2. 업무 효율성
3. 정보 계층
4. 일관성
5. 접근성
6. 시각적 아름다움
```

예쁜 디자인 때문에 업무 효율성이 떨어지는 경우 업무 효율성을 우선한다.

---

# 39. Final Design Principle

이 WMS의 디자인은

> "화려해서 예쁜 화면"

이 아니라

> **"업무용 프로그램인데 완성도가 높고 깔끔해서 계속 쓰고 싶은 화면"**

을 목표로 한다.

전체 UI는

**Indigo + White + Cool Gray**

를 중심으로 구성한다.

**Strong Indigo는 중요한 정보에만 사용하고,
나머지는 White와 Neutral Color로 안정감을 유지한다.**

모든 화면은 하나의 제품에서 만들어진 것처럼
일관된 Typography, Spacing, Radius, Border, Color, Component를 유지한다.
