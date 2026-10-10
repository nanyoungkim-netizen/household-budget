'use client'

/**
 * 검색형 드롭다운 (키보드 전용으로도 조작 가능)
 *
 * - 칸을 누르거나 Tab으로 들어와 바로 타이핑하면 목록이 걸러진다
 * - ↑/↓ 이동, Enter 선택, Esc 닫기 (한글 조합 중 Enter는 무시)
 * - 초성 검색: "ㅅㅂ" → 식비, "ㅈㄷ" → 잔돈모으기
 * - 목록은 body에 띄워서 표·모달의 overflow에 잘리지 않는다
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface SearchOption {
  value: string
  label: string
  icon?: string
  group?: string      // 상위 분류명 등 — 검색 대상이자 보조 표시
  keywords?: string   // 추가 검색어
}

interface Props {
  value: string
  options: SearchOption[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** 있으면 검색어로 새 항목 만들기 옵션을 노출 */
  onCreate?: (query: string) => void
  createLabel?: string
  ariaLabel?: string
}

const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
const norm = (s: string) => s.toLowerCase().replace(/[\s·・\-_/()]/g, '')
const chosung = (s: string) => [...s].map(ch => {
  const c = ch.charCodeAt(0) - 0xac00
  return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch
}).join('')

const CREATE = '__create__'

export default function SearchSelect({
  value, options, onChange, placeholder = '선택', className = '',
  onCreate, createLabel = '새로 만들기', ariaLabel,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number; up: boolean } | null>(null)
  const listId = `ss${useId().replace(/:/g, '')}`

  const selected = options.find(o => o.value === value)
  const display = selected ? `${selected.icon ? selected.icon + ' ' : ''}${selected.label}` : ''

  const filtered = useMemo(() => {
    const q = norm(query)
    if (!q) return options
    const choOnly = /^[ㄱ-ㅎ]+$/.test(q)
    const scored: { o: SearchOption; s: number }[] = []
    for (const o of options) {
      const l = norm(o.label)
      const g = norm(o.group || '')
      const k = norm(o.keywords || '')
      let s = -1
      if (l.startsWith(q)) s = 0
      else if (l.includes(q)) s = 1
      else if (choOnly && chosung(l).includes(q)) s = chosung(l).startsWith(q) ? 2 : 3
      else if (g.includes(q) || k.includes(q)) s = 4
      else if (choOnly && chosung(g).includes(q)) s = 5
      if (s >= 0) scored.push({ o, s })
    }
    return scored.sort((a, b) => a.s - b.s).map(x => x.o)
  }, [options, query])

  // 초성만 친 상태('ㅅㅂ')는 검색 의도이므로 새로 만들기를 띄우지 않는다
  const canCreate = !!onCreate && query.trim().length > 0 && !/^[ㄱ-ㅎ\s]+$/.test(query) &&
    !options.some(o => norm(o.label) === norm(query))
  const items: (SearchOption | typeof CREATE)[] = canCreate ? [...filtered, CREATE] : filtered

  // 목록 위치 — 아래 공간이 부족하면 위로 띄운다
  const place = () => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const up = below < 220 && above > below
    setPos({
      left: Math.min(r.left, window.innerWidth - Math.max(r.width, 240) - 8),
      top: up ? r.top - 4 : r.bottom + 4,
      width: Math.max(r.width, 240),
      maxH: Math.min(320, up ? above : below),
      up,
    })
  }

  useLayoutEffect(() => { if (open) place() }, [open, query])
  useEffect(() => {
    if (!open) return
    const h = () => place()
    window.addEventListener('scroll', h, true)
    window.addEventListener('resize', h)
    return () => { window.removeEventListener('scroll', h, true); window.removeEventListener('resize', h) }
  }, [open])

  // 활성 항목이 보이도록 스크롤
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function openList() {
    setQuery('')
    const i = options.findIndex(o => o.value === value)
    setActive(i >= 0 ? i : 0)
    setOpen(true)
  }

  // 닫힌 채 포커스가 남아 있으면 글자를 전체 선택해 둔다 → 바로 타이핑하면 덮어쓰기(한글 조합도 안전)
  const selectAllSoon = () => requestAnimationFrame(() => {
    if (document.activeElement === inputRef.current) inputRef.current?.select()
  })

  function close() {
    setOpen(false)
    setQuery('')
    selectAllSoon()
  }

  function commit(item: SearchOption | typeof CREATE | undefined) {
    if (!item) return
    if (item === CREATE) onCreate?.(query.trim())
    else if (item.value !== value) onChange(item.value)
    close()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // 한글 조합 확정용 Enter/방향키는 무시 (안 그러면 마지막 글자가 들어가기 전에 선택됨)
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      e.preventDefault(); openList(); return
    }
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % Math.max(items.length, 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + items.length) % Math.max(items.length, 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(Math.max(items.length - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); commit(items[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'Tab') { setOpen(false); setQuery('') }
  }

  return (
    <>
      <input
        ref={inputRef}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        value={open ? query : display}
        placeholder={open ? (display || placeholder) : placeholder}
        onFocus={openList}
        onClick={() => { if (!open) openList() }}
        onChange={e => {
          let v = e.target.value
          // 닫힌 상태에서 표시 글자 뒤에 이어 친 경우, 새로 친 부분만 검색어로 쓴다
          if (!open && display && v.startsWith(display)) v = v.slice(display.length)
          setQuery(v); setActive(0); if (!open) setOpen(true)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => { setOpen(false); setQuery('') }}
        className={`cursor-pointer text-ellipsis ${className}`}
        autoComplete="off"
        spellCheck={false}
      />
      {open && pos && typeof document !== 'undefined' && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          // 목록 클릭 시 input blur(=닫힘)가 먼저 일어나지 않도록
          onMouseDown={e => e.preventDefault()}
          style={{
            position: 'fixed', left: pos.left, width: pos.width, maxHeight: pos.maxH,
            ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
          }}
          className="z-[200] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-xl text-sm"
        >
          {items.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-400">일치하는 항목이 없습니다</li>
          )}
          {items.map((it, i) => {
            const isActive = i === active
            if (it === CREATE) {
              return (
                <li key={CREATE} id={`${listId}-${i}`} data-i={i} role="option" aria-selected={isActive}
                  onMouseEnter={() => setActive(i)} onClick={() => commit(it)}
                  className={`mx-1 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-blue-600 ${isActive ? 'bg-blue-50' : ''}`}>
                  <span>➕</span><span>‘{query.trim()}’ {createLabel}</span>
                </li>
              )
            }
            const isSel = it.value === value
            return (
              <li key={it.value} id={`${listId}-${i}`} data-i={i} role="option" aria-selected={isActive}
                onMouseEnter={() => setActive(i)} onClick={() => commit(it)}
                className={`mx-1 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}>
                {it.icon && <span className="w-5 shrink-0 text-center">{it.icon}</span>}
                <span className={`truncate ${isSel ? 'font-semibold' : ''}`}>{it.label}</span>
                {it.group && it.group !== it.label && (
                  <span className="ml-auto shrink-0 pl-2 text-[11px] text-gray-400">{it.group}</span>
                )}
                {isSel && <span className="shrink-0 text-blue-500">✓</span>}
              </li>
            )
          })}
        </ul>,
        document.body,
      )}
    </>
  )
}
