"use client"

import * as React from "react"
import { cn } from "cn"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
}

type ListItem = {
  index: number // select.options 기준 인덱스
  label: string
  disabled: boolean
  group: string | null // optgroup 라벨
}

const GAP = 4 // 트리거와 목록 사이 간격(px)
const MAX_LIST_HEIGHT = 288

/**
 * 폼 전송·검증·onChange는 실제 <select>가 그대로 담당하고,
 * 펼침 목록만 페이지 안에 직접 그린다.
 * (브라우저 기본 목록은 페이지 밖에 그려져 웹폰트가 적용되지 않음)
 */
function NativeSelect({
  className,
  size = "default",
  ref,
  onMouseDown,
  onKeyDown,
  ...props
}: NativeSelectProps) {
  const selectRef = React.useRef<HTMLSelectElement | null>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const listId = React.useId()
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<ListItem[]>([])
  const [active, setActive] = React.useState(-1) // items 배열 기준
  const [selectedIndex, setSelectedIndex] = React.useState(-1)
  const [pos, setPos] = React.useState<React.CSSProperties>({})
  const typeahead = React.useRef({ text: "", at: 0 })

  const setRefs = React.useCallback(
    (el: HTMLSelectElement | null) => {
      selectRef.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    [ref]
  )

  function openList() {
    const sel = selectRef.current
    if (!sel || sel.disabled) return
    const next: ListItem[] = Array.from(sel.options).map((o) => ({
      index: o.index,
      label: o.text,
      disabled: o.disabled || (o.parentElement instanceof HTMLOptGroupElement && o.parentElement.disabled),
      group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : null,
    }))
    const r = sel.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - GAP - 8
    const above = r.top - GAP - 8
    const upward = below < Math.min(MAX_LIST_HEIGHT, next.length * 32 + 8) && above > below
    setPos({
      left: r.left,
      minWidth: r.width,
      maxWidth: window.innerWidth - r.left - 8,
      maxHeight: Math.min(MAX_LIST_HEIGHT, upward ? above : below),
      ...(upward ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
    })
    setItems(next)
    setSelectedIndex(sel.selectedIndex)
    setActive(next.findIndex((it) => it.index === sel.selectedIndex))
    setOpen(true)
  }

  function closeList(focusSelect = true) {
    setOpen(false)
    if (focusSelect) selectRef.current?.focus()
  }

  function choose(item: ListItem) {
    const sel = selectRef.current
    if (!sel || item.disabled) return
    closeList()
    if (sel.selectedIndex === item.index) return
    sel.selectedIndex = item.index
    // React onChange 및 폼 리스너가 받을 수 있도록 실제 이벤트를 발생
    sel.dispatchEvent(new Event("input", { bubbles: true }))
    sel.dispatchEvent(new Event("change", { bubbles: true }))
  }

  function move(from: number, step: 1 | -1) {
    for (let i = from + step; i >= 0 && i < items.length; i += step) {
      if (!items[i].disabled) return i
    }
    return from
  }

  // 목록을 top layer(popover)에 띄움 → 모달 dialog 안에서도 잘리지 않음
  React.useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    if (open) {
      if (!list.matches(":popover-open")) list.showPopover()
      list.focus()
    } else if (list.matches(":popover-open")) {
      list.hidePopover()
    }
  }, [open])

  // 바깥 클릭·스크롤·창 크기 변경 시 닫기
  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (listRef.current?.contains(t) || selectRef.current?.contains(t)) return
      closeList(false)
    }
    const onScroll = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return
      closeList(false)
    }
    const onResize = () => closeList(false)
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onResize)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onResize)
    }
  }, [open])

  // 활성 항목이 보이도록 스크롤
  React.useEffect(() => {
    if (!open || active < 0) return
    listRef.current
      ?.querySelector(`[data-item="${active}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [open, active])

  function onListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setActive((a) => move(a, 1))
        return
      case "ArrowUp":
        e.preventDefault()
        setActive((a) => move(a, -1))
        return
      case "Home":
        e.preventDefault()
        setActive(move(-1, 1))
        return
      case "End":
        e.preventDefault()
        setActive(move(items.length, -1))
        return
      case "Enter":
      case " ":
        e.preventDefault()
        if (items[active]) choose(items[active])
        return
      case "Escape":
        e.preventDefault()
        e.stopPropagation() // 모달 dialog가 함께 닫히지 않도록
        closeList()
        return
      case "Tab":
        e.preventDefault()
        closeList()
        return
    }
    // 글자 입력으로 항목 찾기
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = e.timeStamp
      const ta = typeahead.current
      ta.text = now - ta.at > 700 ? e.key : ta.text + e.key
      ta.at = now
      const q = ta.text.toLowerCase()
      const found = items.findIndex((it) => !it.disabled && it.label.toLowerCase().includes(q))
      if (found >= 0) setActive(found)
    }
  }

  let lastGroup: string | null = null

  return (
    <div
      className={cn(
        "group/native-select relative w-fit has-[select:disabled]:opacity-50",
        className
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        ref={setRefs}
        data-slot="native-select"
        data-size={size}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="h-9 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-3 text-sm transition-colors outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=sm]:h-8 data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-[size=sm]:py-0.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
        onMouseDown={(e) => {
          onMouseDown?.(e)
          if (e.defaultPrevented || e.button !== 0) return
          e.preventDefault() // 브라우저 기본 목록 대신 직접 그린 목록을 연다
          if (open) {
            closeList()
          } else {
            e.currentTarget.focus()
            openList()
          }
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          if (e.defaultPrevented) return
          const opens =
            e.key === " " || e.key === "Enter" || e.key === "F4" ||
            (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp"))
          if (opens) {
            e.preventDefault()
            openList()
          }
        }}
        {...props}
      />
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none" aria-hidden="true" data-slot="native-select-icon" />

      <div
        ref={listRef}
        id={listId}
        popover="manual"
        role="listbox"
        tabIndex={-1}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onKeyDown={onListKeyDown}
        style={pos}
        className="fixed inset-auto m-0 overflow-y-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none"
      >
        {open &&
          items.map((it, i) => {
            const header = it.group !== lastGroup && it.group !== null
            lastGroup = it.group
            const selected = it.index === selectedIndex
            return (
              <React.Fragment key={it.index}>
                {header && (
                  <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{it.group}</div>
                )}
                <div
                  id={`${listId}-${i}`}
                  data-item={i}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={it.disabled || undefined}
                  onPointerEnter={() => !it.disabled && setActive(i)}
                  onClick={() => choose(it)}
                  className={cn(
                    "flex h-8 cursor-default items-center gap-2 rounded-md pr-2 pl-2 whitespace-nowrap",
                    i === active && "bg-accent text-accent-foreground",
                    it.disabled && "text-muted-foreground opacity-50",
                    it.group !== null && "pl-4"
                  )}
                >
                  <span className="flex-1 truncate">{it.label}</span>
                  <CheckIcon className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                </div>
              </React.Fragment>
            )
          })}
      </div>
    </div>
  )
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
