'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useApp, DEFAULT_INVESTMENT_ACCOUNT_TYPES } from '@/lib/AppContext'
import {
  Investment, InvestmentTrade, InvestmentAccount, InvestmentDividend, InvestmentCashDeposit,
  InvestmentAssetType, InvestmentCurrency, InvestmentAccountType, InvestmentTargetAllocation,
  PortfolioPlan, PortfolioPlanGroup, PortfolioPlanItem, WatchlistItem,
} from '@/types'
import DeleteConfirmModal from '@/components/DeleteConfirmModal'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function fmtPct(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%' }
function parseAmt(s: string) { return parseFloat(s.replace(/[^0-9.]/g, '')) || 0 }
function fmtInput(s: string | number): string {
  const str = String(s)
  const n = parseInt(str.replace(/[^0-9]/g, ''))
  return isNaN(n) || n === 0 ? '' : n.toLocaleString('ko-KR')
}
function fmtDecimalInput(s: string | number): string {
  const str = String(s === 0 ? '' : s)
  if (!str) return ''
  const clean = str.replace(/[^0-9.]/g, '')
  const parts = clean.split('.')
  const intPart = parseInt(parts[0]) || 0
  const decPart = parts.length > 1 ? '.' + parts[1] : (clean.endsWith('.') ? '.' : '')
  return intPart === 0 && !decPart ? '' : intPart.toLocaleString('ko-KR') + decPart
}

const today = new Date().toISOString().slice(0, 10)

const ASSET_TYPE_META: Record<InvestmentAssetType, { label: string; icon: string; color: string }> = {
  domestic_stock: { label: '국내 주식',  icon: '🇰🇷', color: '#3B82F6' },
  foreign_stock:  { label: '해외 주식',  icon: '🌏', color: '#8B5CF6' },
  etf_fund:       { label: 'ETF/펀드',   icon: '📊', color: '#10B981' },
  crypto:         { label: '가상화폐',   icon: '₿',  color: '#F59E0B' },
}

const CURRENCIES: InvestmentCurrency[] = ['KRW', 'USD', 'USDT', 'other']

const ACCOUNT_COLORS = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6']

type PageTab = 'dashboard' | 'holdings' | 'watchlist' | 'trades' | 'portfolio'

const ETF_NAME_PREFIXES = ['TIGER', 'KODEX', 'KBSTAR', 'ARIRANG', 'HANARO', 'KOSEF', 'TIMEFOLIO', 'ACE', 'PLUS', 'SOL', 'TREX', 'WOORI', 'KB']
function isDomesticEtf(name: string, market?: string): boolean {
  if (market && /ETF/i.test(market)) return true
  return ETF_NAME_PREFIXES.some(p => name.toUpperCase().startsWith(p))
}

const EMPTY_INVESTMENT: Omit<Investment, 'id'> = {
  assetType: 'domestic_stock',
  name: '',
  ticker: '',
  exchange: '',
  currency: 'KRW',
  currentPrice: undefined,
  accountId: undefined,
}

const EMPTY_TRADE: Omit<InvestmentTrade, 'id' | 'investmentId'> = {
  type: 'buy',
  date: '',
  quantity: 0,
  price: 0,
  currency: 'KRW',
  exchangeRate: undefined,
  fee: undefined,
  note: '',
  cashAccountId: undefined,
}

const EMPTY_ACCOUNT: Omit<InvestmentAccount, 'id'> = {
  name: '',
  bank: '',
  typeId: 'iat_general',
  color: ACCOUNT_COLORS[0],
  accountNumber: undefined,
}

const EMPTY_DIVIDEND: Omit<InvestmentDividend, 'id'> = {
  accountId: '',
  investmentId: undefined,
  date: today,
  grossAmount: 0,
  tax: 0,
  netAmount: 0,
  note: '',
  cashAccountId: undefined,
}

export default function InvestmentsPage() {
  const { data, setInvestments, setInvestmentTrades, setInvestmentAccounts, setInvestmentDividends, setInvestmentCashDeposits, setInvestmentAccountTypes, setInvestmentTargetAllocations, setInvestmentExchangeRates, setPortfolioPlans, setWatchlist, user } = useApp()
  const { investments, investmentTrades, investmentAccounts, investmentDividends } = data
  const watchlist: WatchlistItem[] = data.watchlist ?? []
  const investmentCashDeposits: InvestmentCashDeposit[] = data.investmentCashDeposits ?? []
  const investmentAccountTypes: InvestmentAccountType[] = data.investmentAccountTypes ?? DEFAULT_INVESTMENT_ACCOUNT_TYPES
  const investmentTargetAllocations: InvestmentTargetAllocation[] = data.investmentTargetAllocations ?? []
  const portfolioPlans: PortfolioPlan[] = data.portfolioPlans ?? []

  const [pageTab, setPageTab] = useState<PageTab>('dashboard')

  // 종목 모달
  const [showInvestmentModal, setShowInvestmentModal] = useState(false)
  const [editInvestmentId, setEditInvestmentId] = useState<string | null>(null)
  const [investmentForm, setInvestmentForm] = useState<Omit<Investment, 'id'>>(EMPTY_INVESTMENT)
  const [initialBuy, setInitialBuy] = useState<{ date: string; quantity: string; price: string; fee: string } | null>(null)
  const [initialBuyUsesCash, setInitialBuyUsesCash] = useState(true)
  const [deleteInvestmentId, setDeleteInvestmentId] = useState<string | null>(null)
  const [currentPriceInput, setCurrentPriceInput] = useState<Record<string, string>>({})

  // F-01: 항상 최신 investments를 참조하도록 ref 유지 (stale closure 방지)
  const investmentsRef = useRef(investments)
  useEffect(() => { investmentsRef.current = investments })

  // F-04 + PRD §10: 종목명 자동완성 (로컬 + 네이버 금융)
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const nameDropdownRef = useRef<HTMLDivElement>(null)

  // PRD §10-1: 네이버 금융 검색 결과
  type NaverSearchItem = { name: string; ticker: string; market: string; isForeign?: boolean }
  const [naverResults, setNaverResults] = useState<NaverSearchItem[]>([])
  const [naverLoading, setNaverLoading] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [priceLoadingIds, setPriceLoadingIds] = useState<Set<string>>(new Set())
  const [priceRefreshing, setPriceRefreshing] = useState(false)
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>(data.investmentExchangeRates ?? {})
  const [exchangeRateUpdatedAt, setExchangeRateUpdatedAt] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showExchangeRates, setShowExchangeRates] = useState(false)

  // ── ETF 구성 팝업 state ────────────────────────────────────────────────────
  type CompositionItem = { name: string; pct: number; noRealPct?: boolean }
  const [compositionCache, setCompositionCache] = useState<Record<string, CompositionItem[]>>({})
  const [compositionLoading, setCompositionLoading] = useState<Set<string>>(new Set())
  const [activeCompositionKey, setActiveCompositionKey] = useState<{ id: string; ticker: string; name: string } | null>(null)
  const [compositionPopupPos, setCompositionPopupPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const compositionPopupRef = useRef<HTMLDivElement>(null)
  const activeButtonRef = useRef<HTMLElement | null>(null)  // 스크롤 추적용 버튼 ref

  // ── 관심종목 드래그 순서 변경 (마우스 + 터치) ───────────────────────────────
  const [wlDragId, setWlDragId] = useState<string | null>(null)
  const [wlOverId, setWlOverId] = useState<string | null>(null)
  const wlTouchDragRef = useRef<string | null>(null)
  const wlTouchOverRef = useRef<string | null>(null)

  function reorderWatchlist(dragId: string, targetId: string) {
    if (!dragId || dragId === targetId) return
    const arr = [...watchlist]
    const from = arr.findIndex(w => w.id === dragId)
    const to = arr.findIndex(w => w.id === targetId)
    if (from < 0 || to < 0) return
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    setWatchlist(arr)
  }
  function onWlDragOver(e: React.DragEvent, id: string) { e.preventDefault(); if (id !== wlDragId) setWlOverId(id) }
  function onWlDrop(e: React.DragEvent, id: string) { e.preventDefault(); if (wlDragId) reorderWatchlist(wlDragId, id); setWlDragId(null); setWlOverId(null) }
  function onWlDragEnd() { setWlDragId(null); setWlOverId(null) }
  function onWlTouchStart(id: string) { wlTouchDragRef.current = id; wlTouchOverRef.current = null; setWlDragId(id) }
  function onWlTouchMove(e: React.TouchEvent) {
    if (!wlTouchDragRef.current) return
    e.preventDefault()
    const t = e.touches[0]
    const el = document.elementFromPoint(t.clientX, t.clientY)
    const item = el?.closest('[data-wl-id]') as HTMLElement | null
    if (item?.dataset.wlId && item.dataset.wlId !== wlTouchDragRef.current) { wlTouchOverRef.current = item.dataset.wlId; setWlOverId(item.dataset.wlId) }
  }
  function onWlTouchEnd() {
    if (wlTouchDragRef.current && wlTouchOverRef.current) reorderWatchlist(wlTouchDragRef.current, wlTouchOverRef.current)
    wlTouchDragRef.current = null; wlTouchOverRef.current = null; setWlDragId(null); setWlOverId(null)
  }

  async function fetchComposition(ticker: string, invName?: string) {
    if (compositionCache[ticker] || compositionLoading.has(ticker)) return
    setCompositionLoading(prev => new Set(prev).add(ticker))
    try {
      const params = new URLSearchParams({ symbol: ticker })
      if (invName) params.set('name', invName)
      const res = await fetch(`/api/stock/composition?${params}`)
      const json = await res.json()
      if (json.items?.length) {
        setCompositionCache(prev => ({ ...prev, [ticker]: json.items }))
      }
    } catch { /* silent */ } finally {
      setCompositionLoading(prev => { const s = new Set(prev); s.delete(ticker); return s })
    }
  }

  function calcPopupPos(btn: HTMLElement) {
    const rect = btn.getBoundingClientRect()
    const popupW = 260
    const margin = 8
    let left = rect.right + margin
    if (left + popupW > window.innerWidth - 8) left = rect.left - popupW - margin
    if (left < 8) left = 8
    return { top: rect.top, left }
  }

  function openCompositionPopup(e: React.MouseEvent, id: string, ticker: string, invName?: string) {
    e.stopPropagation()
    if (activeCompositionKey?.id === id) {
      setActiveCompositionKey(null)
      activeButtonRef.current = null
      return
    }
    fetchComposition(ticker, invName)
    const btn = e.currentTarget as HTMLElement
    activeButtonRef.current = btn
    setCompositionPopupPos(calcPopupPos(btn))
    setActiveCompositionKey({ id, ticker, name: invName ?? '' })
  }

  // 스크롤 시 팝업 위치를 버튼 위치에 맞게 실시간 업데이트
  // + 팝업 외부 클릭 시 닫기 (오버레이 없이 처리)
  useEffect(() => {
    if (!activeCompositionKey) {
      activeButtonRef.current = null
      return
    }
    const onScroll = () => {
      if (!activeButtonRef.current) return
      setCompositionPopupPos(calcPopupPos(activeButtonRef.current))
    }
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      // 팝업 카드 or 버튼 클릭 → 닫지 않음
      if (compositionPopupRef.current?.contains(target)) return
      if (activeButtonRef.current?.contains(target)) return
      setActiveCompositionKey(null)
      activeButtonRef.current = null
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('mousedown', onMouseDown)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompositionKey])

  // ── 관심종목 state ─────────────────────────────────────────────────────────
  const [watchlistQuery, setWatchlistQuery] = useState('')
  const [watchlistResults, setWatchlistResults] = useState<{ name: string; ticker: string; assetType: InvestmentAssetType; currency: InvestmentCurrency; exchange?: string }[]>([])
  const [watchlistSearching, setWatchlistSearching] = useState(false)
  const [watchlistPriceLoading, setWatchlistPriceLoading] = useState(false)
  const watchlistSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const watchlistDropdownRef = useRef<HTMLDivElement>(null)

  // PRD F-03: 통화 전환 토글 (localStorage 유지)
  const [currencyMode, setCurrencyMode] = useState<'KRW' | 'USD'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('inv_currency_mode') as 'KRW' | 'USD') || 'KRW'
    }
    return 'KRW'
  })
  function toggleCurrencyMode() {
    setCurrencyMode(prev => {
      const next = prev === 'KRW' ? 'USD' : 'KRW'
      localStorage.setItem('inv_currency_mode', next)
      return next
    })
  }

  // PRD F-03: 주가 업데이트 토스트
  const [refreshToast, setRefreshToast] = useState<string | null>(null)
  const refreshToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showRefreshToast(msg: string) {
    setRefreshToast(msg)
    if (refreshToastTimerRef.current) clearTimeout(refreshToastTimerRef.current)
    refreshToastTimerRef.current = setTimeout(() => setRefreshToast(null), 3000)
  }

  // PRD §10-2: 장중 여부 판단 (09:00~15:30, 월~금)
  function isMarketOpen(): boolean {
    const now = new Date()
    const day = now.getDay() // 0=일, 6=토
    if (day === 0 || day === 6) return false
    const h = now.getHours(), m = now.getMinutes()
    const t = h * 60 + m
    return t >= 9 * 60 && t <= 15 * 60 + 30
  }

  // PRD §10-2: 현재가 자동 폴링 (국내주식·ETF → 네이버, 해외주식 → Yahoo Finance)
  const fetchPricesRef = useRef<(() => Promise<void>) | null>(null)
  fetchPricesRef.current = async () => {
    const domesticTargets = investments.filter(
      inv => (inv.assetType === 'domestic_stock' || inv.assetType === 'etf_fund') && inv.ticker
    )
    const foreignTargets = investments.filter(
      inv => inv.assetType === 'foreign_stock' && inv.ticker
    )
    const allTargets = [...domesticTargets, ...foreignTargets]
    if (allTargets.length === 0) return

    setPriceLoadingIds(new Set(allTargets.map(t => t.id)))

    const fetchPrice = async (inv: typeof investments[0]) => {
      const isForeign = inv.assetType === 'foreign_stock'
      const endpoint = isForeign
        ? `/api/stock/price-foreign?symbol=${encodeURIComponent(inv.ticker!)}`
        : `/api/stock/price?symbol=${encodeURIComponent(inv.ticker!)}`
      const res = await fetch(endpoint)
      if (!res.ok) return null
      const json = await res.json()
      if (json.error || !json.price) return null
      return { id: inv.id, price: json.price as number, change: json.change as number | undefined, changeRate: json.changeRate as number | undefined, updatedAt: json.updatedAt as string }
    }

    const updated = await Promise.allSettled(allTargets.map(fetchPrice))

    const patches: Record<string, { price: number; change?: number; changeRate?: number; updatedAt: string }> = {}
    updated.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) {
        patches[allTargets[i].id] = { price: r.value.price, change: r.value.change, changeRate: r.value.changeRate, updatedAt: r.value.updatedAt }
      }
    })

    setPriceLoadingIds(new Set())
    if (Object.keys(patches).length === 0) return

    setInvestments(investmentsRef.current.map(inv =>
      patches[inv.id]
        ? { ...inv, currentPrice: patches[inv.id].price, currentPriceUpdatedAt: patches[inv.id].updatedAt, prevCloseDiff: patches[inv.id].change, prevCloseDiffRate: patches[inv.id].changeRate }
        : inv
    ))
  }

  useEffect(() => {
    // 최초 1회 가격 조회 + 환율 조회
    fetchPricesRef.current?.()
    fetchExchangeRates()

    const scheduleNext = () => {
      const interval = isMarketOpen() ? 60_000 : 600_000  // 장중 1분, 장외 10분
      return setTimeout(async () => {
        await fetchPricesRef.current?.()
        pollingTimerRef.current = scheduleNext()
      }, interval)
    }

    const pollingTimerRef = { current: scheduleNext() }
    return () => clearTimeout(pollingTimerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investments.length])  // 종목 수가 바뀔 때만 폴링 재설정

  // 환율 조회 (해외주식 원화 환산용)
  async function fetchExchangeRates() {
    try {
      const res = await fetch('/api/stock/exchange-rate')
      const json = await res.json()
      if (json.rates && Object.keys(json.rates).length > 0) {
        setExchangeRates(json.rates)
        setExchangeRateUpdatedAt(new Date().toISOString())
        setInvestmentExchangeRates(json.rates)
      }
    } catch { /* silent */ }
  }

  // ── 관심종목 검색 (디바운스 300ms) ────────────────────────────────────────
  function triggerWatchlistSearch(q: string) {
    if (watchlistSearchTimer.current) clearTimeout(watchlistSearchTimer.current)
    if (!q || q.length < 1) { setWatchlistResults([]); return }
    watchlistSearchTimer.current = setTimeout(async () => {
      setWatchlistSearching(true)
      try {
        const [domRes, forRes] = await Promise.allSettled([
          fetch(`/api/stock/search?q=${encodeURIComponent(q)}`).then(r => r.json()),
          fetch(`/api/stock/search-foreign?q=${encodeURIComponent(q)}`).then(r => r.json()),
        ])
        const domItems: { name: string; ticker: string; market?: string }[] =
          (domRes.status === 'fulfilled' ? domRes.value?.items ?? [] : [])
        const forItems: { name: string; ticker: string; market?: string; nation?: string }[] =
          (forRes.status === 'fulfilled' ? forRes.value?.items ?? [] : [])

        const results: typeof watchlistResults = []
        const seen = new Set<string>()
        domItems.slice(0, 12).forEach(item => {
          if (!item.ticker || seen.has(item.ticker)) return
          seen.add(item.ticker)
          const assetType: InvestmentAssetType = isDomesticEtf(item.name, item.market) ? 'etf_fund' : 'domestic_stock'
          results.push({ name: item.name, ticker: item.ticker, assetType, currency: 'KRW', exchange: item.market })
        })
        forItems.slice(0, 6).forEach(item => {
          if (!item.ticker || seen.has(item.ticker)) return
          seen.add(item.ticker)
          results.push({ name: item.name, ticker: item.ticker, assetType: 'foreign_stock', currency: 'USD', exchange: item.market ?? item.nation })
        })
        setWatchlistResults(results)
      } finally {
        setWatchlistSearching(false)
      }
    }, 300)
  }

  // 관심종목 시세 일괄 조회
  async function refreshWatchlistPrices(items: WatchlistItem[]) {
    const targets = items.filter(w => w.ticker)
    if (targets.length === 0) return
    setWatchlistPriceLoading(true)
    try {
      const results = await Promise.allSettled(
        targets.map(async w => {
          const isForeign = w.assetType === 'foreign_stock'
          const endpoint = isForeign
            ? `/api/stock/price-foreign?symbol=${encodeURIComponent(w.ticker!)}`
            : `/api/stock/price?symbol=${encodeURIComponent(w.ticker!)}`
          const res = await fetch(endpoint)
          const json = await res.json()
          if (json.error || !json.price) return null
          return { id: w.id, price: json.price as number, change: json.change as number | undefined, changeRate: json.changeRate as number | undefined, updatedAt: json.updatedAt as string }
        })
      )
      const patches: Record<string, { price: number; change?: number; changeRate?: number; updatedAt: string }> = {}
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) patches[targets[i].id] = r.value
      })
      if (Object.keys(patches).length > 0) {
        setWatchlist(items.map(w =>
          patches[w.id]
            ? { ...w, currentPrice: patches[w.id].price, prevCloseDiff: patches[w.id].change, prevCloseDiffRate: patches[w.id].changeRate, currentPriceUpdatedAt: patches[w.id].updatedAt }
            : w
        ))
      }
    } finally {
      setWatchlistPriceLoading(false)
    }
  }

  // F-03: 전체 종목 현재가 수동 새로고침 — 완료 후 성공/실패 토스트
  async function refreshAllPrices() {
    fetchExchangeRates()
    const targets = investments.filter(inv => inv.ticker)
    if (targets.length === 0) { showRefreshToast('조회할 종목이 없습니다'); return }
    setPriceRefreshing(true)
    setPriceLoadingIds(new Set(targets.map(t => t.id)))
    const patches: Record<string, { price: number; change?: number; changeRate?: number; updatedAt: string }> = {}
    try {
      const results = await Promise.allSettled(
        targets.map(async inv => {
          const isForeign = inv.assetType === 'foreign_stock'
          const endpoint = isForeign
            ? `/api/stock/price-foreign?symbol=${encodeURIComponent(inv.ticker!)}`
            : `/api/stock/price?symbol=${encodeURIComponent(inv.ticker!)}`
          const res = await fetch(endpoint)
          const json = await res.json()
          if (json.error || !json.price) return null
          return { id: inv.id, price: json.price as number, change: json.change as number | undefined, changeRate: json.changeRate as number | undefined, updatedAt: json.updatedAt as string }
        })
      )
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) patches[targets[i].id] = r.value
      })
      if (Object.keys(patches).length > 0) {
        setInvestments(investments.map(inv =>
          patches[inv.id]
            ? { ...inv, currentPrice: patches[inv.id].price, currentPriceUpdatedAt: patches[inv.id].updatedAt, prevCloseDiff: patches[inv.id].change, prevCloseDiffRate: patches[inv.id].changeRate }
            : inv
        ))
      }
    } catch { /* silent */ } finally {
      setPriceRefreshing(false)
      setPriceLoadingIds(new Set())
      const successCount = Object.keys(patches).length
      const failCount = targets.length - successCount
      if (failCount === 0) {
        showRefreshToast(`✅ ${successCount}개 종목 현재가 갱신 완료`)
      } else {
        showRefreshToast(`⚠ ${successCount}개 갱신 완료, ${failCount}개 실패`)
      }
    }
  }

  // 단일 종목 현재가 즉시 조회 후 반영 (매수 등록 직후 자동 호출)
  async function fetchAndUpdatePrice(invId: string, ticker: string, assetType: string) {
    if (!ticker) return
    setPriceLoadingIds(prev => new Set(prev).add(invId))
    try {
      const isForeign = assetType === 'foreign_stock'
      const endpoint = isForeign
        ? `/api/stock/price-foreign?symbol=${encodeURIComponent(ticker)}`
        : `/api/stock/price?symbol=${encodeURIComponent(ticker)}`
      const res = await fetch(endpoint)
      const json = await res.json()
      if (!json.error && json.price) {
        setInvestments(investmentsRef.current.map(inv =>
          inv.id === invId
            ? { ...inv, currentPrice: json.price, currentPriceUpdatedAt: json.updatedAt, prevCloseDiff: json.change, prevCloseDiffRate: json.changeRate }
            : inv
        ))
      }
    } catch { /* silent */ } finally {
      setPriceLoadingIds(prev => { const s = new Set(prev); s.delete(invId); return s })
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        nameDropdownRef.current && !nameDropdownRef.current.contains(e.target as Node) &&
        nameInputRef.current && !nameInputRef.current.contains(e.target as Node)
      ) {
        setNameDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 관심종목 검색 드롭다운 — 바깥 클릭 시 닫기
  // compositionPopupRef 클릭은 드롭다운 닫힘에서 제외
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        watchlistDropdownRef.current && !watchlistDropdownRef.current.contains(target) &&
        !(compositionPopupRef.current && compositionPopupRef.current.contains(target))
      ) {
        setWatchlistResults([])
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 로컬 종목명 자동완성 (기존 등록 종목) — Investment 객체로 반환해 ticker·currency·assetType 함께 전달
  const localSuggestions = useMemo(() => {
    const q = investmentForm.name.trim()
    if (!q) return []
    const seen = new Set<string>()
    return investments
      .filter(inv => inv.id !== editInvestmentId && inv.name.includes(q))
      .filter(inv => { if (seen.has(inv.name)) return false; seen.add(inv.name); return true })
      .slice(0, 5)
  }, [investmentForm.name, investments, editInvestmentId])

  // F-01: 국내·해외 통합 종목 검색 (두 API 병렬 호출, 디바운스 300ms)
  const triggerNaverSearch = useCallback((q: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!q || q.length < 1) { setNaverResults([]); return }
    searchTimerRef.current = setTimeout(async () => {
      setNaverLoading(true)
      try {
        const [domRes, forRes] = await Promise.allSettled([
          fetch(`/api/stock/search?q=${encodeURIComponent(q)}`).then(r => r.json()),
          fetch(`/api/stock/search-foreign?q=${encodeURIComponent(q)}`).then(r => r.json()),
        ])
        const domItems: NaverSearchItem[] = ((domRes.status === 'fulfilled' ? domRes.value.items : []) ?? []).map(
          (i: NaverSearchItem) => ({ ...i, isForeign: false })
        )
        const forItems: NaverSearchItem[] = ((forRes.status === 'fulfilled' ? forRes.value.items : []) ?? []).map(
          (i: NaverSearchItem) => ({ ...i, isForeign: true })
        )
        const seen = new Set<string>()
        const merged: NaverSearchItem[] = []
        for (const item of [...domItems, ...forItems]) {
          if (item.ticker && !seen.has(item.ticker)) {
            seen.add(item.ticker)
            merged.push(item)
          }
        }
        setNaverResults(merged.slice(0, 15))
      } catch {
        setNaverResults([])
      } finally {
        setNaverLoading(false)
      }
    }, 300)
  }, [])

  // 거래 모달
  const [showTradeModal, setShowTradeModal] = useState(false)
  const [editTradeId, setEditTradeId] = useState<string | null>(null)
  const [tradeInvestmentId, setTradeInvestmentId] = useState<string | null>(null)
  const [tradeForm, setTradeForm] = useState<Omit<InvestmentTrade, 'id' | 'investmentId'>>(EMPTY_TRADE)
  const [tradeStr, setTradeStr] = useState({ quantity: '', price: '', fee: '', exchangeRate: '' })
  const [tradeUsesCash, setTradeUsesCash] = useState(false)
  const [tradeModalAccountId, setTradeModalAccountId] = useState<string | undefined>(undefined)
  const [deleteTradeId, setDeleteTradeId] = useState<string | null>(null)
  const [selectedInvestmentId, setSelectedInvestmentId] = useState<string | null>(null)
  const [selectedTradeAccountId, setSelectedTradeAccountId] = useState<string | null>(null)
  const [selectedTradeInvName, setSelectedTradeInvName] = useState<string | null>(null)
  const [collapsedTradeInvIds, setCollapsedTradeInvIds] = useState<Set<string>>(new Set())
  const [tradeTypeFilter, setTradeTypeFilter] = useState<'trade' | 'deposit'>('trade')

  // 계좌 모달
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [editAccountId, setEditAccountId] = useState<string | null>(null)
  const [accountForm, setAccountForm] = useState<Omit<InvestmentAccount, 'id'>>(EMPTY_ACCOUNT)
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null)

  // F-03: 계좌 유형 관리 모달
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [editTypeId, setEditTypeId] = useState<string | null>(null)
  const [editTypeName, setEditTypeName] = useState('')
  const [deleteTypeId, setDeleteTypeId] = useState<string | null>(null)

  // 배당금 모달
  const [showDividendModal, setShowDividendModal] = useState(false)
  const [dividendAccountId, setDividendAccountId] = useState<string | null>(null)
  const [editDividendId, setEditDividendId] = useState<string | null>(null)
  const [dividendForm, setDividendForm] = useState<Omit<InvestmentDividend, 'id'>>(EMPTY_DIVIDEND)
  const [dividendStr, setDividendStr] = useState({ grossAmount: '', tax: '', netAmount: '' })
  const [deleteDividendId, setDeleteDividendId] = useState<string | null>(null)
  const [expandedDividendAccId, setExpandedDividendAccId] = useState<string | null>(null)
  const [dividendFilterAccId, setDividendFilterAccId] = useState<string | null>(null)
  const [dividendFilterYear, setDividendFilterYear] = useState<string | null>(null)

  // 예수금 입금 모달
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [depositAccountId, setDepositAccountId] = useState<string | null>(null)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositDate, setDepositDate] = useState(today)
  const [depositNote, setDepositNote] = useState('')
  const [editDepositId, setEditDepositId] = useState<string | null>(null)
  const [showDepositHistoryAccId, setShowDepositHistoryAccId] = useState<string | null>(null)
  const [deleteDepositId, setDeleteDepositId] = useState<string | null>(null)

  function openDeposit(accId: string) {
    setDepositAccountId(accId)
    setDepositAmount('')
    setDepositDate(today)
    setDepositNote('')
    setEditDepositId(null)
    setShowDepositModal(true)
  }

  function openEditDeposit(dep: InvestmentCashDeposit) {
    setDepositAccountId(dep.accountId)
    setDepositAmount(String(Math.abs(dep.amount)))
    setDepositDate(dep.date)
    setDepositNote(dep.note ?? '')
    setEditDepositId(dep.id)
    setShowDepositModal(true)
  }

  function handleSaveDeposit() {
    const amount = parseAmt(depositAmount)
    if (!depositAccountId || amount <= 0) return
    if (editDepositId?.startsWith('__legacy__')) {
      // 기존잔액 수정 → cashDeposits 직접 업데이트
      setInvestmentAccounts(investmentAccounts.map(a =>
        a.id === depositAccountId ? { ...a, cashDeposits: amount } : a
      ))
    } else if (editDepositId) {
      setInvestmentCashDeposits(investmentCashDeposits.map(d =>
        d.id === editDepositId ? { ...d, amount, date: depositDate, note: depositNote || undefined } : d
      ))
    } else {
      const newDep: InvestmentCashDeposit = {
        id: `dep${Date.now()}`,
        accountId: depositAccountId,
        date: depositDate,
        amount,
        note: depositNote || undefined,
      }
      setInvestmentCashDeposits([...investmentCashDeposits, newDep])
    }
    setShowDepositModal(false)
    setEditDepositId(null)
  }

  function handleDeleteDeposit(id: string) {
    setInvestmentCashDeposits(investmentCashDeposits.filter(d => d.id !== id))
    setInvestmentTrades(investmentTrades.filter(t => t.linkedDepositId !== id))
    setDeleteDepositId(null)
  }

  // F-05: 계좌별 접기/펼치기 — 기본값 접힌 상태 (expandedAccounts에 없으면 접힘)
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())
  function toggleCollapse(id: string) {
    setExpandedAccounts(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // F-05 v2: 포트폴리오 관리
  const [portfolioAccId, setPortfolioAccId] = useState<string | null>(null)
  const [editingPlan, setEditingPlan] = useState<PortfolioPlan | null>(null)
  const [showInvPicker, setShowInvPicker] = useState<{ mode: 'ungrouped' | 'group'; groupId?: string } | null>(null)
  const [pickerCustomName, setPickerCustomName] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [additionalInvestment, setAdditionalInvestment] = useState('')
  const [rebalanceResult, setRebalanceResult] = useState<{ id: string; name: string; addAmt: number; expectedPct: number; action: 'buy' | 'sell' }[] | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)  // group.id | 'ungrouped'
  // 최신 portfolioPlans를 항상 참조 (stale closure 방지)
  const portfolioPlansRef = useRef(portfolioPlans)
  portfolioPlansRef.current = portfolioPlans

  // ── 보유 종목별 계산 ────────────────────────────────────────────────────────
  const holdingsMap = useMemo(() => {
    const map = new Map<string, {
      investment: Investment
      avgPrice: number
      avgPriceKRW: number
      holdingQty: number
      totalBuyAmt: number
      totalBuyAmtKRW: number
      totalFee: number
      realizedPnl: number
    }>()

    investments.forEach(inv => {
      const trades = investmentTrades
        .filter(t => t.investmentId === inv.id)
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

      let holdingQty = 0
      let totalBuyAmt = 0
      let totalBuyAmtKRW = 0
      let totalFee = 0
      let realizedPnl = 0

      trades.forEach(trade => {
        const tradeAmt = trade.quantity * trade.price
        const fee = trade.fee ?? 0
        totalFee += fee
        // 거래 당시 환율 기준 KRW 금액 (예수금 차감 로직과 동일하게 exchangeRate ?? 1 사용)
        const tradeRate = trade.currency !== 'KRW' ? (trade.exchangeRate ?? 1) : 1
        const tradeAmtKRW = Math.round(tradeAmt * tradeRate)
        if (trade.type === 'buy') {
          holdingQty += trade.quantity
          totalBuyAmt += tradeAmt
          totalBuyAmtKRW += tradeAmtKRW
        } else {
          const avgCost = holdingQty > 0 ? totalBuyAmt / holdingQty : 0
          const avgCostKRW = holdingQty > 0 ? totalBuyAmtKRW / holdingQty : 0
          realizedPnl += (tradeAmt - fee) - avgCost * trade.quantity
          holdingQty = Math.max(0, holdingQty - trade.quantity)
          totalBuyAmt = holdingQty * avgCost
          totalBuyAmtKRW = Math.round(holdingQty * avgCostKRW)
        }
      })

      const avgPrice = holdingQty > 0 ? totalBuyAmt / holdingQty : 0
      const avgPriceKRW = holdingQty > 0 ? totalBuyAmtKRW / holdingQty : 0
      map.set(inv.id, { investment: inv, avgPrice, avgPriceKRW, holdingQty, totalBuyAmt, totalBuyAmtKRW, totalFee, realizedPnl })
    })
    return map
  }, [investments, investmentTrades])

  // ── 투자계좌별 예수금 (입금 내역 + 배당 실수령 합산) ─────────────────────
  const cashBalanceMap = useMemo(() => {
    const map = new Map<string, number>()
    investmentAccounts.forEach(acc => {
      const legacy = acc.cashDeposits ?? 0
      const fromHistory = investmentCashDeposits
        .filter(d => d.accountId === acc.id)
        .reduce((s, d) => s + d.amount, 0)
      const fromDividends = investmentDividends
        .filter(d => d.accountId === acc.id)
        .reduce((s, d) => s + d.netAmount, 0)
      map.set(acc.id, legacy + fromHistory + fromDividends)
    })
    return map
  }, [investmentAccounts, investmentCashDeposits, investmentDividends])

  // ── 포트폴리오 요약 ────────────────────────────────────────────────────────
  const portfolio = useMemo(() => {
    let totalBuy = 0, totalEval = 0, totalRealized = 0, totalFee = 0
    const byType: Record<string, number> = {}
    const byAccount: Record<string, { buy: number; eval: number; divs: number }> = {}

    holdingsMap.forEach(({ investment, holdingQty, totalBuyAmt, totalBuyAmtKRW, totalFee: invFee, realizedPnl }) => {
      const isForeign = investment.assetType === 'foreign_stock'
      const fxRate = isForeign ? (exchangeRates['USD'] ?? 0) : 1
      const toKRW = (v: number) => isForeign && fxRate > 0 ? Math.round(v * fxRate) : v

      const currentPrice = investment.currentPrice ?? 0
      const evalAmt    = toKRW(holdingQty * currentPrice)
      const buyAmtKRW  = totalBuyAmtKRW  // 거래 당시 환율 기준 KRW (예수금 차감과 동일 로직)
      const realizedKRW = toKRW(realizedPnl)
      const feeKRW     = toKRW(invFee)

      totalBuy     += buyAmtKRW
      totalEval    += evalAmt
      totalRealized += realizedKRW
      totalFee     += feeKRW
      const type = investment.assetType
      byType[type] = (byType[type] || 0) + evalAmt
      const aId = investment.accountId ?? '__none__'
      if (!byAccount[aId]) byAccount[aId] = { buy: 0, eval: 0, divs: 0 }
      byAccount[aId].buy  += buyAmtKRW
      byAccount[aId].eval += evalAmt
    })

    // 배당금 → 계좌별 예수금(현금 잔고)에 합산
    const totalDividend = investmentDividends.reduce((s, d) => s + d.netAmount, 0)
    investmentDividends.forEach(d => {
      const aId = d.accountId ?? '__none__'
      if (!byAccount[aId]) byAccount[aId] = { buy: 0, eval: 0, divs: 0 }
      byAccount[aId].divs = (byAccount[aId].divs ?? 0) + d.netAmount
    })

    const unrealizedPnl = totalEval - totalBuy
    const returnRate = totalBuy > 0 ? (unrealizedPnl / totalBuy) * 100 : 0
    const totalReturn = unrealizedPnl + totalRealized + totalDividend
    return { totalBuy, totalEval, unrealizedPnl, returnRate, totalRealized, totalDividend, totalFee, totalReturn, byType, byAccount }
  }, [holdingsMap, investmentDividends, exchangeRates])

  // F-03: 달러 기준 합계 (USD 모드에서 대시보드에 표시)
  const portfolioUSD = useMemo(() => {
    let buyUSD = 0, evalUSD = 0
    holdingsMap.forEach(({ investment, holdingQty, totalBuyAmt }) => {
      if (investment.currency === 'USD') {
        buyUSD += totalBuyAmt
        evalUSD += holdingQty * (investment.currentPrice ?? 0)
      }
    })
    return { buyUSD, evalUSD, pnlUSD: evalUSD - buyUSD }
  }, [holdingsMap])

  // ── F-03: 계좌 유형 헬퍼 ─────────────────────────────────────────────────
  function getTypeLabel(typeId: string): string {
    return investmentAccountTypes.find(t => t.id === typeId)?.name ?? typeId
  }

  function handleAddType() {
    const name = newTypeName.trim()
    if (!name) return
    const newType: InvestmentAccountType = { id: `iat_${Date.now()}`, name, isDefault: false }
    setInvestmentAccountTypes([...investmentAccountTypes, newType])
    setNewTypeName('')
  }

  function handleSaveTypeName() {
    if (!editTypeId || !editTypeName.trim()) return
    setInvestmentAccountTypes(investmentAccountTypes.map(t => t.id === editTypeId ? { ...t, name: editTypeName.trim() } : t))
    setEditTypeId(null)
    setEditTypeName('')
  }

  function handleDeleteType(id: string) {
    const usedCount = investmentAccounts.filter(a => a.typeId === id).length
    if (usedCount > 0) {
      alert(`${usedCount}개 계좌에서 사용 중입니다. 삭제할 수 없습니다.`)
      return
    }
    setInvestmentAccountTypes(investmentAccountTypes.filter(t => t.id !== id))
    setDeleteTypeId(null)
  }

  // ── 계좌 CRUD ──────────────────────────────────────────────────────────────
  function openAddAccount() {
    setEditAccountId(null)
    setAccountForm({ ...EMPTY_ACCOUNT, color: ACCOUNT_COLORS[investmentAccounts.length % ACCOUNT_COLORS.length] })
    setShowAccountModal(true)
  }

  function openEditAccount(acc: InvestmentAccount) {
    setEditAccountId(acc.id)
    setAccountForm({ name: acc.name, bank: acc.bank, typeId: acc.typeId, color: acc.color, accountNumber: acc.accountNumber })
    setShowAccountModal(true)
  }

  function handleSaveAccount() {
    if (!accountForm.name) return
    if (editAccountId) {
      setInvestmentAccounts(investmentAccounts.map(a => a.id === editAccountId ? { id: editAccountId, ...accountForm } : a))
    } else {
      setInvestmentAccounts([...investmentAccounts, { id: `ia${Date.now()}`, ...accountForm }])
    }
    setShowAccountModal(false)
    setEditAccountId(null)
  }

  function handleDeleteAccount(id: string) {
    // 해당 계좌의 예수금 레코드 ID 수집
    const depositIdsToRemove = new Set(
      investmentCashDeposits.filter(d => d.accountId === id).map(d => d.id)
    )
    // 예수금 레코드 삭제
    setInvestmentCashDeposits(investmentCashDeposits.filter(d => d.accountId !== id))
    // 해당 예수금에 연동된 거래의 linkedDepositId 초기화
    if (depositIdsToRemove.size > 0) {
      setInvestmentTrades(investmentTrades.map(t =>
        t.linkedDepositId && depositIdsToRemove.has(t.linkedDepositId)
          ? { ...t, linkedDepositId: undefined }
          : t
      ))
    }
    setInvestments(investments.map(inv => inv.accountId === id ? { ...inv, accountId: undefined } : inv))
    setInvestmentAccounts(investmentAccounts.filter(a => a.id !== id))
    setDeleteAccountId(null)
  }

  // ── 종목 CRUD ──────────────────────────────────────────────────────────────
  function openAddInvestment(presetAccountId?: string) {
    setEditInvestmentId(null)
    setInvestmentForm({ ...EMPTY_INVESTMENT, accountId: presetAccountId })
    setInitialBuy({ date: today, quantity: '', price: '', fee: '' })
    setInitialBuyUsesCash(true)
    setShowInvestmentModal(true)
  }

  function openEditInvestment(inv: Investment) {
    setEditInvestmentId(inv.id)
    setInvestmentForm({
      assetType: inv.assetType, name: inv.name, ticker: inv.ticker, exchange: inv.exchange,
      currency: inv.currency, currentPrice: inv.currentPrice, accountId: inv.accountId,
    })
    setInitialBuy(null)
    setShowInvestmentModal(true)
  }

  function handleSaveInvestment() {
    if (!investmentForm.name || isSaving) return
    setIsSaving(true)
    try {
      const invId = editInvestmentId ?? `inv${Date.now()}`
      const newInv: Investment = { id: invId, ...investmentForm }
      if (editInvestmentId) {
        setInvestments(investments.map(i => i.id === editInvestmentId ? newInv : i))
      } else {
        let finalInv = newInv
        if (initialBuy && initialBuy.quantity && initialBuy.price) {
          const qty = parseAmt(initialBuy.quantity)
          const price = parseAmt(initialBuy.price)
          const fee = parseAmt(initialBuy.fee)
          if (qty > 0 && price > 0) {
            finalInv = { ...finalInv, currentPrice: price, currentPriceUpdatedAt: new Date().toISOString() }
            let linkedDepositId: string | undefined
            if (investmentForm.accountId && initialBuyUsesCash) {
              const depositAmt = -(Math.round(qty * price) + (fee > 0 ? fee : 0))
              const newDep: InvestmentCashDeposit = {
                id: `dep${Date.now()}`,
                accountId: investmentForm.accountId,
                date: initialBuy.date || today,
                amount: depositAmt,
                note: `거래 연동: ${investmentForm.name}`,
              }
              setInvestmentCashDeposits([...investmentCashDeposits, newDep])
              linkedDepositId = newDep.id
            }
            const trade: InvestmentTrade = {
              id: `tr${Date.now()}`,
              investmentId: invId,
              type: 'buy',
              date: initialBuy.date,
              quantity: qty,
              price,
              currency: investmentForm.currency,
              fee: fee > 0 ? fee : undefined,
              linkedDepositId,
            }
            setInvestmentTrades([...investmentTrades, trade])
          }
        }
        // investmentsRef는 setState 직후 재렌더까지 업데이트 안 되므로 직접 합산 후 ref도 갱신
        const nextInvestments = [...investments, finalInv]
        investmentsRef.current = nextInvestments
        setInvestments(nextInvestments)
        // 티커 있으면 즉시 현재가 조회 (ref 통해 stale closure 방지)
        if (finalInv.ticker) {
          setTimeout(() => fetchAndUpdatePrice(invId, finalInv.ticker!, finalInv.assetType), 100)
        }
      }
      setShowInvestmentModal(false)
      setEditInvestmentId(null)
      setInitialBuy(null)
    } finally {
      setIsSaving(false)
    }
  }

  function handleDeleteInvestment(id: string) {
    // 종목에 속한 거래의 linkedDepositId 모두 수집해서 예수금 레코드도 삭제
    const linkedIds = new Set(
      investmentTrades
        .filter(t => t.investmentId === id && t.linkedDepositId)
        .map(t => t.linkedDepositId as string)
    )
    if (linkedIds.size > 0) {
      setInvestmentCashDeposits(investmentCashDeposits.filter(d => !linkedIds.has(d.id)))
    }
    setInvestments(investments.filter(i => i.id !== id))
    setInvestmentTrades(investmentTrades.filter(t => t.investmentId !== id))
    setDeleteInvestmentId(null)
    if (selectedInvestmentId === id) setSelectedInvestmentId(null)
    setSelectedTradeInvName(null)
  }

  function handleUpdateCurrentPrice(invId: string) {
    const price = parseAmt(currentPriceInput[invId] ?? '')
    if (price <= 0) return
    setInvestments(investments.map(i => i.id === invId ? { ...i, currentPrice: price, currentPriceUpdatedAt: new Date().toISOString() } : i))
    setCurrentPriceInput(prev => ({ ...prev, [invId]: '' }))
  }

  // ── 거래 CRUD ──────────────────────────────────────────────────────────────
  function openAddTrade(investmentId: string) {
    const inv = investments.find(i => i.id === investmentId)
    setTradeInvestmentId(investmentId)
    setEditTradeId(null)
    setTradeUsesCash(true)   // 신규 거래 기본값 ON
    setTradeModalAccountId(inv?.accountId)
    setTradeForm({ ...EMPTY_TRADE, currency: inv?.currency ?? 'KRW' })
    setTradeStr({ quantity: '', price: '', fee: '', exchangeRate: '' })
    setShowTradeModal(true)
  }

  function openEditTrade(trade: InvestmentTrade) {
    const inv = investments.find(i => i.id === trade.investmentId)
    setTradeInvestmentId(trade.investmentId)
    setEditTradeId(trade.id)
    setTradeUsesCash(!!trade.linkedDepositId)
    setTradeModalAccountId(inv?.accountId)
    setTradeForm({ type: trade.type, date: trade.date, quantity: trade.quantity, price: trade.price, currency: trade.currency, exchangeRate: trade.exchangeRate, fee: trade.fee, note: trade.note, cashAccountId: trade.cashAccountId })
    setTradeStr({
      quantity: fmtDecimalInput(trade.quantity),
      price: fmtDecimalInput(trade.price),
      fee: trade.fee ? fmtDecimalInput(trade.fee) : '',
      exchangeRate: trade.exchangeRate ? fmtDecimalInput(trade.exchangeRate) : '',
    })
    setShowTradeModal(true)
  }

  function updateTradeInput(field: 'quantity' | 'price' | 'fee' | 'exchangeRate', raw: string) {
    const clean = raw.replace(/[^0-9.]/g, '')
    const parts = clean.split('.')
    const intVal = parseInt(parts[0]) || 0
    const dec = parts.length > 1 ? '.' + parts[1] : (clean.endsWith('.') ? '.' : '')
    const display = (intVal === 0 && !dec) ? '' : intVal.toLocaleString('ko-KR') + dec
    setTradeStr(s => ({ ...s, [field]: display }))
    const num = parseFloat(clean) || 0
    if (field === 'fee' || field === 'exchangeRate') {
      setTradeForm(f => ({ ...f, [field]: num || undefined }))
    } else {
      setTradeForm(f => ({ ...f, [field]: num }))
    }
  }

  function handleSaveTrade() {
    if (!tradeInvestmentId || !tradeForm.quantity || !tradeForm.price) return
    const inv = investments.find(i => i.id === tradeInvestmentId)
    const accountId = tradeModalAccountId
    // 계좌가 변경됐으면 종목도 업데이트
    if (inv && tradeModalAccountId !== inv.accountId) {
      setInvestments(investments.map(i => i.id === tradeInvestmentId ? { ...i, accountId: tradeModalAccountId } : i))
    }

    const baseAmt = tradeForm.quantity * tradeForm.price
    const feeAmt = tradeForm.fee ?? 0
    const rate = tradeForm.currency !== 'KRW' ? (tradeForm.exchangeRate ?? 1) : 1
    const krwAmt = Math.round(baseAmt * rate)
    const depositAmt = tradeForm.type === 'buy' ? -(krwAmt + feeAmt) : (krwAmt - feeAmt)

    let linkedDepositId: string | undefined

    if (editTradeId) {
      const oldTrade = investmentTrades.find(t => t.id === editTradeId)
      if (accountId && tradeUsesCash) {
        // 연동 ON: 기존 deposit 업데이트 or 신규 생성
        if (oldTrade?.linkedDepositId) {
          setInvestmentCashDeposits(investmentCashDeposits.map(d =>
            d.id === oldTrade.linkedDepositId ? { ...d, amount: depositAmt, date: tradeForm.date ?? today } : d
          ))
          linkedDepositId = oldTrade.linkedDepositId
        } else {
          const newDep: InvestmentCashDeposit = {
            id: `dep${Date.now()}`,
            accountId,
            date: tradeForm.date ?? today,
            amount: depositAmt,
            note: `거래 연동: ${inv?.name ?? ''}`,
          }
          setInvestmentCashDeposits([...investmentCashDeposits, newDep])
          linkedDepositId = newDep.id
        }
      } else if (oldTrade?.linkedDepositId) {
        // 연동 OFF로 변경: 기존 deposit 삭제
        setInvestmentCashDeposits(investmentCashDeposits.filter(d => d.id !== oldTrade.linkedDepositId))
      }
      setInvestmentTrades(investmentTrades.map(t => t.id === editTradeId ? { ...t, ...tradeForm, linkedDepositId } : t))
    } else {
      if (accountId && tradeUsesCash) {
        // 신규 거래 + 연동 ON
        const newDep: InvestmentCashDeposit = {
          id: `dep${Date.now()}`,
          accountId,
          date: tradeForm.date ?? today,
          amount: depositAmt,
          note: `거래 연동: ${inv?.name ?? ''}`,
        }
        setInvestmentCashDeposits([...investmentCashDeposits, newDep])
        linkedDepositId = newDep.id
      }
      const newTrade: InvestmentTrade = { id: `tr${Date.now()}`, investmentId: tradeInvestmentId, ...tradeForm, linkedDepositId }
      setInvestmentTrades([...investmentTrades, newTrade])
    }

    const parentInv = investments.find(i => i.id === tradeInvestmentId)
    if (parentInv?.ticker) {
      setTimeout(() => fetchAndUpdatePrice(parentInv.id, parentInv.ticker!, parentInv.assetType), 100)
    }
    setShowTradeModal(false)
    setEditTradeId(null)
  }

  function handleDeleteTrade(id: string) {
    const trade = investmentTrades.find(t => t.id === id)
    const inv = trade ? investments.find(i => i.id === trade.investmentId) : undefined
    const linkedId = trade?.linkedDepositId
    setInvestmentCashDeposits(investmentCashDeposits.filter(d => {
      if (linkedId && d.id === linkedId) return false
      if (!linkedId && inv && d.note === `거래 연동: ${inv.name}`) return false
      return true
    }))
    setInvestmentTrades(investmentTrades.filter(t => t.id !== id))
    setDeleteTradeId(null)
  }

  // ── 배당금 CRUD ────────────────────────────────────────────────────────────
  function openAddDividend(accountId?: string) {
    const accId = accountId ?? (investmentAccounts.length === 1 ? investmentAccounts[0].id : '')
    setDividendAccountId(accId || null)
    setEditDividendId(null)
    setDividendForm({ ...EMPTY_DIVIDEND, accountId: accId, investmentId: undefined })
    setDividendStr({ grossAmount: '', tax: '', netAmount: '' })
    setShowDividendModal(true)
  }

  function openEditDividend(d: InvestmentDividend) {
    setDividendAccountId(d.accountId)
    setEditDividendId(d.id)
    setDividendForm({ accountId: d.accountId, investmentId: d.investmentId, date: d.date, grossAmount: d.grossAmount, tax: d.tax, netAmount: d.netAmount, note: d.note })
    setDividendStr({ grossAmount: fmtInput(d.grossAmount), tax: fmtInput(d.tax), netAmount: fmtInput(d.netAmount) })
    setShowDividendModal(true)
  }

  function handleSaveDividend() {
    if (!dividendAccountId || !dividendForm.accountId || dividendForm.netAmount <= 0) return
    const formWithAccount = { ...dividendForm, accountId: dividendAccountId }
    if (editDividendId) {
      setInvestmentDividends(investmentDividends.map(d => d.id === editDividendId ? { ...d, ...formWithAccount } : d))
    } else {
      setInvestmentDividends([...investmentDividends, { id: `div${Date.now()}`, ...formWithAccount }])
    }
    setShowDividendModal(false)
    setEditDividendId(null)
  }

  function handleDeleteDividend(id: string) {
    setInvestmentDividends(investmentDividends.filter(d => d.id !== id))
    setDeleteDividendId(null)
  }

  // ── F-05: 포트폴리오 관리 ────────────────────────────────────────────────────
  // 보유 종목 (holdingQty > 0)
  const holdingInvestments = useMemo(() =>
    investments.filter(inv => (holdingsMap.get(inv.id)?.holdingQty ?? 0) > 0)
  , [investments, holdingsMap])

  // 계좌별 보유 종목 평가금액
  const evalByAccount = useMemo(() => {
    const map: Record<string, number> = {}
    holdingInvestments.forEach(inv => {
      const h = holdingsMap.get(inv.id)
      const accId = inv.accountId ?? '__none__'
      map[accId] = (map[accId] ?? 0) + (h ? h.holdingQty * (inv.currentPrice ?? 0) : 0)
    })
    return map
  }, [holdingInvestments, holdingsMap])

  // 포트폴리오 계좌 목록 (보유종목 있는 계좌)
  const portfolioAccounts = useMemo(() => {
    const accIds = [...new Set(holdingInvestments.map(inv => inv.accountId ?? '__none__'))]
    return accIds.map(id => ({
      id,
      name: investmentAccounts.find(a => a.id === id)?.name ?? '미분류',
    }))
  }, [holdingInvestments, investmentAccounts])

  // 계좌 선택 시 플랜 로드 (portfolioPlansRef로 항상 최신 데이터 사용)
  function loadPlanForAccount(accId: string) {
    const existing = portfolioPlansRef.current.find(p => p.accountId === accId)
    if (existing) {
      setEditingPlan(JSON.parse(JSON.stringify(existing)))
    } else {
      const accInvs = holdingInvestments.filter(inv => (inv.accountId ?? '__none__') === accId)
      const n = accInvs.length
      const base = n > 0 ? parseFloat((100 / n).toFixed(1)) : 0
      setEditingPlan({
        accountId: accId,
        items: accInvs.map((inv, i) => ({
          id: `item_${inv.id}`,
          investmentId: inv.id,
          targetPct: i === n - 1 ? parseFloat((100 - base * (n - 1)).toFixed(1)) : base,
        })),
        groups: [],
      })
    }
    setRebalanceResult(null)
  }

  useEffect(() => {
    if (pageTab === 'portfolio' && portfolioAccounts.length > 0 && !portfolioAccId) {
      const firstId = portfolioAccounts[0].id
      setPortfolioAccId(firstId)
      loadPlanForAccount(firstId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTab, portfolioAccounts.length])

  // 관심종목 탭 진입 시 시세 자동 갱신
  useEffect(() => {
    if (pageTab === 'watchlist' && watchlist.length > 0) {
      refreshWatchlistPrices(watchlist)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageTab])

  // 편집 중인 플랜 합계 %
  const accountTotalPct = editingPlan
    ? editingPlan.items.reduce((s, i) => s + i.targetPct, 0) +
      editingPlan.groups.reduce((s, g) => s + g.targetPct, 0)
    : 0

  // 편집 플랜 저장 (저장 즉시 ref도 갱신되므로 editingPlan은 그대로 유지)
  function savePlan() {
    if (!editingPlan) return
    const others = portfolioPlansRef.current.filter(p => p.accountId !== editingPlan.accountId)
    setPortfolioPlans([...others, editingPlan])
  }

  // 저장된 플랜 (현재 계좌)
  const savedPlan = portfolioAccId ? portfolioPlans.find(p => p.accountId === portfolioAccId) ?? null : null

  // DnD: 아이템 드롭 처리
  function handleItemDrop(itemId: string, sourceGroupId: string | null, destGroupId: string | null) {
    setEditingPlan(prev => {
      if (!prev) return prev
      // 출발지에서 아이템 추출
      let item: PortfolioPlanItem | undefined
      let newItems = prev.items
      let newGroups = prev.groups
      if (sourceGroupId === null) {
        item = prev.items.find(i => i.id === itemId)
        newItems = prev.items.filter(i => i.id !== itemId)
      } else {
        const srcGroup = prev.groups.find(g => g.id === sourceGroupId)
        item = srcGroup?.items.find(i => i.id === itemId)
        newGroups = prev.groups.map(g =>
          g.id === sourceGroupId ? { ...g, items: g.items.filter(i => i.id !== itemId) } : g
        )
      }
      if (!item) return prev
      // 목적지에 아이템 추가
      if (destGroupId === null) {
        newItems = [...newItems, item]
      } else {
        newGroups = newGroups.map(g => {
          if (g.id !== destGroupId) return g
          const updated = [...g.items, item!]
          const n = updated.length
          const base = parseFloat((100 / n).toFixed(1))
          return {
            ...g,
            items: updated.map((it, i) => ({
              ...it,
              targetPct: i === n - 1 ? parseFloat((100 - base * (n - 1)).toFixed(1)) : base,
            })),
          }
        })
      }
      return { ...prev, items: newItems, groups: newGroups }
    })
    setDragOverId(null)
  }

  // 플랜 항목 이름 헬퍼
  function getItemName(item: PortfolioPlanItem) {
    if (item.investmentId) return investments.find(i => i.id === item.investmentId)?.name ?? item.investmentId
    return item.customName ?? '?'
  }

  // 그룹 내 균등분배
  function equalizeGroup(groupId: string) {
    setEditingPlan(prev => {
      if (!prev) return prev
      return {
        ...prev,
        groups: prev.groups.map(g => {
          if (g.id !== groupId) return g
          const n = g.items.length
          if (n === 0) return g
          const base = parseFloat((100 / n).toFixed(1))
          return {
            ...g,
            items: g.items.map((item, i) => ({
              ...item,
              targetPct: i === n - 1 ? parseFloat((100 - base * (n - 1)).toFixed(1)) : base,
            })),
          }
        }),
      }
    })
  }

  // 종목 추가 (피커에서)
  function addItemFromPicker(investmentId?: string, customName?: string) {
    if (!editingPlan || (!investmentId && !customName)) return
    const newItem: PortfolioPlanItem = {
      id: `item_${Date.now()}`,
      investmentId,
      customName: investmentId ? undefined : customName,
      targetPct: 0,
    }
    if (showInvPicker?.mode === 'group' && showInvPicker.groupId) {
      const gid = showInvPicker.groupId
      setEditingPlan(prev => {
        if (!prev) return prev
        return {
          ...prev,
          groups: prev.groups.map(g => {
            if (g.id !== gid) return g
            const updated = [...g.items, newItem]
            const n = updated.length
            const base = parseFloat((100 / n).toFixed(1))
            return {
              ...g,
              items: updated.map((it, i) => ({
                ...it,
                targetPct: i === n - 1 ? parseFloat((100 - base * (n - 1)).toFixed(1)) : base,
              })),
            }
          }),
        }
      })
    } else {
      setEditingPlan(prev => prev ? { ...prev, items: [...prev.items, newItem] } : prev)
    }
    setShowInvPicker(null)
    setPickerCustomName('')
  }

  // 리밸런싱 계산
  function handleCalcRebalance() {
    if (!savedPlan || !portfolioAccId) return
    const addAmt = parseAmt(additionalInvestment)
    const accEval = evalByAccount[portfolioAccId] ?? 0
    const totalAfter = accEval + addAmt

    // 플랜 내 전체 항목 (유효 계좌 %)
    const planItems: { itemId: string; invId?: string; name: string; effectivePct: number }[] = []
    savedPlan.items.forEach(item => {
      planItems.push({ itemId: item.id, invId: item.investmentId, name: getItemName(item), effectivePct: item.targetPct })
    })
    savedPlan.groups.forEach(g => {
      g.items.forEach(item => {
        planItems.push({ itemId: item.id, invId: item.investmentId, name: getItemName(item), effectivePct: g.targetPct * item.targetPct / 100 })
      })
    })

    const results: { id: string; name: string; addAmt: number; expectedPct: number; action: 'buy' | 'sell' }[] = []

    planItems.forEach(({ itemId, invId, name, effectivePct }) => {
      const inv = invId ? investments.find(i => i.id === invId) : undefined
      const h = inv ? holdingsMap.get(inv.id) : undefined
      const isForeign = inv?.assetType === 'foreign_stock'
      const fxRate = isForeign ? (exchangeRates['USD'] ?? 0) : 1
      const currentEval = h && inv
        ? (isForeign && fxRate > 0 ? Math.round(h.holdingQty * (inv.currentPrice ?? 0) * fxRate) : h.holdingQty * (inv.currentPrice ?? 0))
        : 0
      const targetAmt = (effectivePct / 100) * totalAfter
      const diff = targetAmt - currentEval
      results.push({ id: itemId, name, addAmt: Math.abs(diff), expectedPct: totalAfter > 0 ? (Math.max(0, currentEval + Math.max(0, diff)) / totalAfter) * 100 : 0, action: diff >= 0 ? 'buy' : 'sell' })
    })

    // 보유 중이지만 플랜에 없는 종목 → 매도 추천
    const planInvIds = new Set(planItems.map(p => p.invId).filter(Boolean))
    holdingInvestments
      .filter(inv => (inv.accountId ?? '__none__') === portfolioAccId && !planInvIds.has(inv.id))
      .forEach(inv => {
        const h = holdingsMap.get(inv.id)
        const isForeign = inv.assetType === 'foreign_stock'
        const fxRate = isForeign ? (exchangeRates['USD'] ?? 0) : 1
        const currentEval = h ? (isForeign && fxRate > 0 ? Math.round(h.holdingQty * (inv.currentPrice ?? 0) * fxRate) : h.holdingQty * (inv.currentPrice ?? 0)) : 0
        results.push({ id: inv.id, name: inv.name, addAmt: currentEval, expectedPct: 0, action: 'sell' })
      })

    setRebalanceResult(results)
  }

  // ── 그룹: 계좌별 종목 목록 ───────────────────────────────────────────────
  const investmentsByAccount = useMemo(() => {
    const map = new Map<string, Investment[]>()
    investments.forEach(inv => {
      const key = inv.accountId ?? '__none__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(inv)
    })
    return map
  }, [investments])

  // 거래 이력 필터
  const tradeFilteredByAccount = selectedTradeAccountId
    ? investmentTrades.filter(t => {
        const inv = investments.find(i => i.id === t.investmentId)
        return inv?.accountId === selectedTradeAccountId
      })
    : investmentTrades
  const selectedTrades = (selectedTradeInvName
    ? tradeFilteredByAccount.filter(t => {
        const inv = investments.find(i => i.id === t.investmentId)
        return inv?.name === selectedTradeInvName
      })
    : tradeFilteredByAccount
  ).slice().sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  // 거래 이력 - 계좌 필터에 맞는 종목 이름 (중복 제거)
  const tradeInvNames = (() => {
    const base = selectedTradeAccountId
      ? investments.filter(inv => inv.accountId === selectedTradeAccountId)
      : investments
    const seen = new Set<string>()
    return base
      .filter(inv => (holdingsMap.get(inv.id)?.holdingQty ?? 0) > 0)
      .map(inv => inv.name)
      .filter(n => { if (seen.has(n)) return false; seen.add(n); return true })
  })()

  // 거래 이력 - 이름 기준 그룹화 (같은 이름 = 같은 종목), 특정 이름 선택 시 null
  const tradeGroupsByName = (() => {
    if (selectedTradeInvName) return null
    const map = new Map<string, typeof selectedTrades>()
    for (const t of selectedTrades) {
      const name = investments.find(i => i.id === t.investmentId)?.name ?? t.investmentId
      const arr = map.get(name) ?? []
      arr.push(t)
      map.set(name, arr)
    }
    return map
  })()

  // ── 종목 카드 렌더 헬퍼 ──────────────────────────────────────────────────
  function renderInvestmentCard(inv: Investment) {
    const h = holdingsMap.get(inv.id)
    const meta = ASSET_TYPE_META[inv.assetType]
    const currentPrice = inv.currentPrice ?? 0
    const evalAmt = (h?.holdingQty ?? 0) * currentPrice
    const evalPnl = evalAmt - (h?.totalBuyAmt ?? 0)
    const evalRate = h?.totalBuyAmt ? (evalPnl / h.totalBuyAmt) * 100 : 0
    const isProfit = evalPnl >= 0
    const invDividends = investmentDividends.filter(d => d.investmentId === inv.id)
    const totalDividend = invDividends.reduce((s, d) => s + d.netAmount, 0)

    return (
      <div key={inv.id} className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: meta.color + '20' }}>
              {meta.icon}
            </div>
            <div>
              <div className="font-semibold text-gray-900 flex items-center gap-1.5 flex-wrap">
                {inv.name}
                {inv.assetType === 'etf_fund' && inv.ticker && (
                  <button
                    onClick={e => openCompositionPopup(e, inv.id, inv.ticker!, inv.name)}
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md transition-colors ${activeCompositionKey?.id === inv.id ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-500 hover:bg-blue-100'}`}>
                    구성
                  </button>
                )}
              </div>
              <div className="text-xs text-gray-400">
                {meta.label} {inv.ticker ? `· ${inv.ticker}` : ''} {inv.currency !== 'KRW' ? `· ${inv.currency}` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => openAddTrade(inv.id)} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors">+ 거래</button>
            <button onClick={() => openEditInvestment(inv)} className="text-xs text-gray-400 hover:text-blue-500 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">수정</button>
            <button onClick={() => setDeleteInvestmentId(inv.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">삭제</button>
          </div>
        </div>

        {h && h.holdingQty > 0 && (() => {
          const isForeign = inv.assetType === 'foreign_stock'
          const fxRate = isForeign ? (exchangeRates['USD'] ?? 0) : 1
          const hasFx = fxRate > 0
          // 매수 비용은 inv.currency 기준으로 입력됨
          const costIsKRW = inv.currency === 'KRW'

          const showInUSD = currencyMode === 'USD' && isForeign && hasFx
          const showInKRW = currencyMode === 'KRW' && isForeign && hasFx

          // 모든 금액을 표시 통화로 정규화
          let dispCurrentPrice: number, dispAvgPrice: number, dispTotalBuyAmt: number
          if (isForeign && hasFx) {
            if (showInKRW) {
              dispCurrentPrice = currentPrice * fxRate
              // 매수금액은 거래 당시 환율로 이미 KRW 환산된 값 사용
              dispAvgPrice    = h.avgPriceKRW
              dispTotalBuyAmt = h.totalBuyAmtKRW
            } else {
              // USD 모드
              dispCurrentPrice = currentPrice
              dispAvgPrice    = h.avgPriceKRW > 0 ? h.avgPriceKRW / fxRate : h.avgPrice
              dispTotalBuyAmt = h.totalBuyAmtKRW > 0 ? h.totalBuyAmtKRW / fxRate : h.totalBuyAmt
            }
          } else {
            dispCurrentPrice = currentPrice
            dispAvgPrice    = h.avgPriceKRW || h.avgPrice
            dispTotalBuyAmt = h.totalBuyAmtKRW || h.totalBuyAmt
          }

          const dispEvalAmt  = h.holdingQty * dispCurrentPrice
          const dispEvalPnl  = dispEvalAmt - dispTotalBuyAmt
          const dispEvalRate = dispTotalBuyAmt > 0 ? (dispEvalPnl / dispTotalBuyAmt) * 100 : 0
          const dispPriceDiff = dispCurrentPrice - dispAvgPrice
          const dispPriceRate = dispAvgPrice > 0 ? (dispPriceDiff / dispAvgPrice) * 100 : 0
          const isProfit = dispEvalPnl >= 0  // 바깥 isProfit 대체

          const fmtDisp = (v: number) => {
            if (showInKRW || !isForeign) {
              return `${Math.round(v).toLocaleString('ko-KR')}원`
            }
            return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          }

          // USD 모드 시 원화 참고값 (costIsKRW이면 원래 입력값, 아니면 환산)
          const secBuy   = showInUSD ? `≈ ${fmtKRW(costIsKRW ? Math.round(h.totalBuyAmt) : Math.round(h.totalBuyAmt * fxRate))}` : null
          const secAvg   = showInUSD ? `≈ ${fmtKRW(costIsKRW ? Math.round(h.avgPrice)    : Math.round(h.avgPrice    * fxRate))}` : null
          const secPrice = showInUSD ? `≈ ${fmtKRW(Math.round(currentPrice * fxRate))}` : null

          return (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-gray-50 rounded-xl p-2.5">
              <div className="text-xs text-gray-400 mb-0.5">보유수량</div>
              <div className="text-sm font-semibold text-gray-900">{h.holdingQty.toLocaleString()}주</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-2.5">
              <div className="text-xs text-gray-400 mb-0.5">총 매수금액</div>
              <div className="text-sm font-semibold text-gray-900">{fmtDisp(dispTotalBuyAmt)}</div>
              {secBuy && <div className="text-xs text-gray-400 mt-0.5">{secBuy}</div>}
            </div>
            <div className="bg-gray-50 rounded-xl p-2.5">
              <div className="text-xs text-gray-400 mb-0.5">평균매수단가</div>
              <div className="text-sm font-semibold text-gray-900">{fmtDisp(dispAvgPrice)}</div>
              {secAvg && <div className="text-xs text-gray-400 mt-0.5">{secAvg}</div>}
            </div>
            <div className="bg-gray-50 rounded-xl p-2.5">
              <div className="text-xs text-gray-400 mb-0.5">현재가</div>
              {dispCurrentPrice > 0 ? (
                <>
                  <div className="text-sm font-semibold text-gray-900">{fmtDisp(dispCurrentPrice)}</div>
                  {secPrice && <div className="text-xs text-gray-400 mt-0.5">{secPrice}</div>}
                  {inv.prevCloseDiff !== undefined && (
                    (() => {
                      const diff = showInKRW && isForeign && hasFx
                        ? Math.round(inv.prevCloseDiff * fxRate)
                        : inv.prevCloseDiff
                      const rate = inv.prevCloseDiffRate ?? 0
                      const isUp = diff >= 0
                      return (
                        <div className={`text-xs mt-0.5 flex items-center gap-1 ${isUp ? 'text-red-500' : 'text-blue-500'}`}>
                          <span className="bg-gray-200 text-gray-500 text-[10px] font-semibold px-1 py-0.5 rounded">전일</span>
                          {isUp ? '▲' : '▼'}{Math.abs(diff).toLocaleString('ko-KR')} ({isUp ? '+' : ''}{rate.toFixed(2)}%)
                        </div>
                      )
                    })()
                  )}
                  <div className={`text-xs mt-0.5 flex items-center gap-1 ${dispPriceDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    <span className="bg-gray-200 text-gray-500 text-[10px] font-semibold px-1 py-0.5 rounded">평단</span>
                    {dispPriceDiff >= 0 ? '+' : ''}{fmtDisp(dispPriceDiff)} ({fmtPct(dispPriceRate)})
                  </div>
                </>
              ) : <div className="text-sm font-semibold text-gray-400">미입력</div>}
            </div>
            {/* 평가손익 셀 */}
            <div className={`rounded-xl p-2.5 ${isProfit ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div className={`text-xs mb-1 ${isProfit ? 'text-emerald-500' : 'text-red-500'}`}>평가손익</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span className={`text-sm font-bold ${isProfit ? 'text-emerald-700' : 'text-red-600'}`}>
                  {isProfit ? '+' : ''}{fmtDisp(dispEvalPnl)}
                </span>
                <span className={`text-xs ${isProfit ? 'text-emerald-600' : 'text-red-500'}`}>
                  ({fmtPct(dispEvalRate)})
                </span>
              </div>
              {inv.prevCloseDiff !== undefined && h && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '4px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 600, background: '#e5e7eb', color: '#6b7280', padding: '1px 4px', borderRadius: '3px' }}>전일</span>
                  {(() => {
                    const dayChangeAmt = showInKRW && isForeign && hasFx
                      ? Math.round(inv.prevCloseDiff! * h.holdingQty * fxRate)
                      : Math.round(inv.prevCloseDiff! * h.holdingQty)
                    const isUp = dayChangeAmt >= 0
                    return (
                      <span style={{ fontSize: '10px', color: isUp ? '#ef4444' : '#3b82f6' }}>
                        {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{fmtDisp(Math.abs(dayChangeAmt) / (showInUSD ? fxRate : 1))}
                      </span>
                    )
                  })()}
                </div>
              )}
            </div>
            {/* 총 평가금액 셀 */}
            <div className={`rounded-xl p-2.5 ${isProfit ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div className={`text-xs mb-1 ${isProfit ? 'text-emerald-500' : 'text-red-500'}`}>총 평가금액</div>
              <div className={`text-sm font-bold ${isProfit ? 'text-emerald-700' : 'text-red-600'}`}>
                {fmtDisp(dispEvalAmt)}
              </div>
              {hasFx && showInUSD && (
                <div className="mt-1 text-xs text-blue-500">
                  ≈ {fmtKRW(Math.round(dispEvalAmt * fxRate))}
                </div>
              )}
            </div>
            {(h.totalFee > 0 || totalDividend > 0) && (
              <div className="col-span-2 flex gap-2">
                {h.totalFee > 0 && (
                  <div className="flex-1 bg-gray-50 rounded-xl p-2.5">
                    <div className="text-xs text-gray-400 mb-0.5">납부 수수료</div>
                    <div className="text-sm font-semibold text-gray-500">-{fmtKRW(Math.round(h.totalFee))}</div>
                  </div>
                )}
                {totalDividend > 0 && (
                  <div className="flex-1 bg-emerald-50 rounded-xl p-2.5">
                    <div className="text-xs text-emerald-500 mb-0.5">배당 수령</div>
                    <div className="text-sm font-semibold text-emerald-700">+{fmtKRW(Math.round(totalDividend))}</div>
                  </div>
                )}
              </div>
            )}
          </div>
          )
        })()}

        {/* PRD §10-2: 자동 업데이트 상태 표시 */}
        {(inv.assetType === 'domestic_stock' || inv.assetType === 'etf_fund' || inv.assetType === 'foreign_stock') && inv.ticker && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full font-medium">🔄 자동 업데이트</span>
            {priceLoadingIds.has(inv.id) ? (
              <span className="text-[10px] text-blue-400 animate-pulse">⏳ 조회 중...</span>
            ) : inv.currentPriceUpdatedAt ? (
              <span className="text-[10px] text-gray-400">
                최종: {new Date(inv.currentPriceUpdatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : (
              <span className="text-[10px] text-amber-500">⚠ 첫 조회 대기 중 — 잠시 후 자동 갱신</span>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <input type="text" inputMode="numeric"
            placeholder="현재가 입력"
            value={currentPriceInput[inv.id] ?? ''}
            onChange={e => setCurrentPriceInput(prev => ({ ...prev, [inv.id]: fmtDecimalInput(e.target.value) }))}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={() => handleUpdateCurrentPrice(inv.id)}
            className="px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            업데이트
          </button>
          <button onClick={() => { setSelectedInvestmentId(prev => prev === inv.id ? null : inv.id); setPageTab('trades') }}
            className="px-3 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-xl hover:bg-gray-200 transition-colors">
            이력 보기
          </button>
        </div>
        {inv.currentPriceUpdatedAt && (
          <div className="text-xs text-gray-400 mt-1">현재가 기준: {new Date(inv.currentPriceUpdatedAt).toLocaleString('ko-KR')}</div>
        )}
        <div className="text-xs text-gray-400 mt-1.5">💡 매수·매도 내역 수정은 <button onClick={() => { setSelectedInvestmentId(inv.id); setPageTab('trades') }} className="text-blue-500 underline">거래 이력 탭</button>에서 가능합니다</div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* F-03: 주가 업데이트 토스트 */}
      {refreshToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl animate-fade-in">
          {refreshToast}
        </div>
      )}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">투자 내역 관리</h1>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* F-03: 통화 전환 토글 */}
          <button onClick={toggleCurrencyMode}
            className="flex items-center gap-1 bg-gray-100 text-gray-700 text-sm font-semibold px-3 py-2 rounded-xl hover:bg-gray-200 transition-colors border border-gray-200">
            <span className={currencyMode === 'KRW' ? 'text-blue-600' : 'text-gray-400'}>₩</span>
            <span className="text-gray-300">/</span>
            <span className={currencyMode === 'USD' ? 'text-green-600' : 'text-gray-400'}>$</span>
          </button>
          <button onClick={() => setShowTypeModal(true)}
            className="bg-gray-100 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-200 transition-colors">
            계좌유형 관리
          </button>
          <button
            onClick={refreshAllPrices}
            disabled={priceRefreshing}
            className="flex items-center gap-1.5 bg-gray-100 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50">
            <span className={`inline-block transition-transform ${priceRefreshing ? 'animate-spin' : ''}`}>🔄</span>
            {priceRefreshing ? '갱신 중...' : '주가 업데이트'}
          </button>
          <button onClick={() => openAddAccount()}
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors">
            + 계좌 추가
          </button>
        </div>
      </div>
      {/* F-02: 환율 기준 (토글로 펼치기) */}
      {exchangeRateUpdatedAt && Object.keys(exchangeRates).length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setShowExchangeRates(v => !v)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            <span>💱 환율 기준</span>
            <span className="text-gray-300">{showExchangeRates ? '▲' : '▼'}</span>
          </button>
          {showExchangeRates && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400 flex-wrap">
              {Object.entries(exchangeRates).map(([currency, rate]) => (
                <span key={currency} className="text-gray-500 font-medium">{currency}/KRW {rate.toLocaleString('ko-KR')}</span>
              ))}
              <span className="text-gray-300">·</span>
              <span>업데이트 {new Date(exchangeRateUpdatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
        </div>
      )}

      {/* 탭 */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-5 gap-1 overflow-x-auto">
        {([['dashboard','📊 대시보드'],['holdings','💼 보유 종목'],['watchlist','⭐ 관심종목'],['trades','📋 거래 이력'],['portfolio','🎯 포트폴리오']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setPageTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${pageTab === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ══ 대시보드 탭 ══════════════════════════════════════════════════════ */}
      {pageTab === 'dashboard' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
            {(() => {
              const totalCashBalance = [...cashBalanceMap.values()].reduce((s, v) => s + Math.max(0, v), 0)
              const totalWithCash = portfolio.totalEval + totalCashBalance
              return (
            <>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs opacity-70">투자 현황 요약</div>
              <div className="text-xs opacity-60">{currencyMode === 'USD' ? '달러($) 기준' : '원화(₩) 기준'}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-xs opacity-70 mb-1">총 투자금액</div>
                <div className="text-lg font-bold">{fmtKRW(Math.round(portfolio.totalBuy))}</div>
                {currencyMode === 'USD' && portfolioUSD.buyUSD > 0 && (
                  <div className="text-xs opacity-60 mt-0.5">해외 ${portfolioUSD.buyUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                )}
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-xs opacity-70 mb-1">총 평가금액</div>
                <div className="text-lg font-bold">{fmtKRW(Math.round(totalWithCash))}</div>
                {currencyMode === 'USD' && portfolioUSD.evalUSD > 0 ? (
                  <div className="text-xs opacity-60 mt-0.5">해외 ${portfolioUSD.evalUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                ) : totalCashBalance > 0 ? (
                  <div className="text-xs opacity-60 mt-0.5">주식 {fmtKRW(Math.round(portfolio.totalEval))} + 예수금 {fmtKRW(Math.round(totalCashBalance))}</div>
                ) : null}
              </div>
            </div>
            </>
              )
            })()}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className={`rounded-xl p-3 ${portfolio.unrealizedPnl >= 0 ? 'bg-emerald-400/30' : 'bg-red-400/30'}`}>
                <div className="text-xs opacity-70 mb-1">평가손익</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', flexWrap: 'wrap' }}>
                  <span className="text-base font-bold">{portfolio.unrealizedPnl >= 0 ? '+' : ''}{fmtKRW(Math.round(portfolio.unrealizedPnl))}</span>
                  <span className="text-xs opacity-85">{fmtPct(portfolio.returnRate)}</span>
                </div>
                {currencyMode === 'USD' && portfolioUSD.pnlUSD !== 0 && (
                  <div className="text-xs opacity-70">{portfolioUSD.pnlUSD >= 0 ? '+' : ''}${portfolioUSD.pnlUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                )}
                {(() => {
                  const totalDayChange = [...holdingsMap.entries()].reduce((sum, [invId, h]) => {
                    const inv = investments.find(i => i.id === invId)
                    if (!inv || inv.prevCloseDiff === undefined || inv.prevCloseDiff === null) return sum
                    const isForeign = inv.assetType === 'foreign_stock'
                    const fxRate = isForeign ? (exchangeRates['USD'] ?? 0) : 1
                    if (isForeign && fxRate === 0) return sum  // 환율 없으면 제외
                    return sum + Math.round(inv.prevCloseDiff * h.holdingQty * fxRate)
                  }, 0)
                  const hasDayChange = investments.some(inv => inv.prevCloseDiff !== undefined)
                  if (!hasDayChange) return null
                  const isUp = totalDayChange >= 0
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '5px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 600, background: 'rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.9)', padding: '1px 4px', borderRadius: '3px' }}>전일</span>
                      <span style={{ fontSize: '10px', color: isUp ? '#fca5a5' : '#93c5fd' }}>
                        {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{fmtKRW(Math.round(totalDayChange))}
                      </span>
                    </div>
                  )
                })()}
              </div>
              <div className={`rounded-xl p-3 ${portfolio.totalRealized >= 0 ? 'bg-emerald-400/20' : 'bg-red-400/20'}`}>
                <div className="text-xs opacity-70 mb-1">실현손익</div>
                <div className="text-base font-bold">{portfolio.totalRealized >= 0 ? '+' : ''}{fmtKRW(Math.round(portfolio.totalRealized))}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-xs opacity-70 mb-1">배당수익 합계</div>
                <div className="text-base font-bold text-emerald-300">+{fmtKRW(Math.round(portfolio.totalDividend))}</div>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-xs opacity-70 mb-1">납부 수수료</div>
                <div className="text-base font-bold text-white/60">-{fmtKRW(Math.round(portfolio.totalFee))}</div>
              </div>
            </div>
            {(portfolio.totalDividend > 0 || portfolio.totalRealized !== 0) && (
              <div className={`mt-3 rounded-xl p-3 ${portfolio.totalReturn >= 0 ? 'bg-emerald-400/30' : 'bg-red-400/30'}`}>
                <div className="text-xs opacity-70 mb-1">총 수익 (평가손익 + 실현손익 + 배당)</div>
                <div className="text-lg font-bold">{portfolio.totalReturn >= 0 ? '+' : ''}{fmtKRW(Math.round(portfolio.totalReturn))}</div>
              </div>
            )}
          </div>

          {investmentAccounts.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-3">계좌별 현황</div>
              <div className="space-y-3">
                {investmentAccounts.map(acc => {
                  const stats = portfolio.byAccount[acc.id]
                  if (!stats) return (
                    <div key={acc.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ backgroundColor: acc.color + '20', color: acc.color }}>
                        {getTypeLabel(acc.typeId).slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{acc.name}</div>
                        <div className="text-xs text-gray-400">{acc.bank} · {getTypeLabel(acc.typeId)}</div>
                      </div>
                      <div className="text-xs text-gray-400">종목 없음</div>
                    </div>
                  )
                  const pnl = stats.eval - stats.buy
                  const rate = stats.buy > 0 ? (pnl / stats.buy) * 100 : 0
                  const cash = cashBalanceMap.get(acc.id) ?? 0
                  const accountDayChange = investments
                    .filter(inv => inv.accountId === acc.id)
                    .reduce((sum, inv) => {
                      const h = holdingsMap.get(inv.id)
                      if (!h || inv.prevCloseDiff === undefined || inv.prevCloseDiff === null) return sum
                      const isForeign = inv.assetType === 'foreign_stock'
                      const fxRate = isForeign ? (exchangeRates['USD'] ?? 0) : 1
                      if (isForeign && fxRate === 0) return sum
                      return sum + Math.round(inv.prevCloseDiff * h.holdingQty * fxRate)
                    }, 0)
                  const hasDayChange = investments
                    .filter(inv => inv.accountId === acc.id)
                    .some(inv => inv.prevCloseDiff !== undefined)
                  return (
                    <div key={acc.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ backgroundColor: acc.color + '20', color: acc.color }}>
                        {getTypeLabel(acc.typeId).slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{acc.name}</div>
                        <div className="text-xs text-gray-400">{acc.bank} · {getTypeLabel(acc.typeId)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                          {fmtKRW(Math.round(stats.eval + Math.max(0, cash)))}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '2px' }}>
                          <span style={{ fontSize: '10px', color: '#6b7280' }}>원금 <b style={{ color: '#374151', fontWeight: 500 }}>{fmtKRW(Math.round(stats.buy))}</b></span>
                          <span style={{ fontSize: '10px', color: '#d1d5db' }}>|</span>
                          <span style={{ fontSize: '10px', color: '#6b7280' }}>예수금 <b style={{ color: '#374151', fontWeight: 500 }}>{fmtKRW(Math.round(cash))}</b></span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', marginTop: '3px' }}>
                          <span style={{ fontSize: '11px', color: pnl >= 0 ? '#059669' : '#ef4444', fontWeight: 500 }}>
                            {pnl >= 0 ? '+' : ''}{fmtKRW(Math.round(pnl))} ({fmtPct(rate)})
                          </span>
                          {hasDayChange && (
                            <>
                              <span style={{ fontSize: '9px', fontWeight: 600, background: '#e5e7eb', color: '#6b7280', padding: '1px 4px', borderRadius: '3px' }}>전일</span>
                              <span style={{ fontSize: '10px', color: accountDayChange >= 0 ? '#ef4444' : '#3b82f6' }}>
                                {accountDayChange >= 0 ? '▲' : '▼'} {accountDayChange >= 0 ? '+' : ''}{fmtKRW(Math.round(accountDayChange))}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {Object.keys(portfolio.byType).length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-3">자산 유형별 비중</div>
              <div className="space-y-2">
                {Object.entries(portfolio.byType).sort((a, b) => b[1] - a[1]).map(([type, amt]) => {
                  const meta = ASSET_TYPE_META[type as InvestmentAssetType]
                  const pct = portfolio.totalEval > 0 ? (amt / portfolio.totalEval) * 100 : 0
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700">{meta.icon} {meta.label}</span>
                        <span className="text-sm font-semibold text-gray-900">{fmtKRW(Math.round(amt))} <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span></span>
                      </div>
                      <div className="bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {investments.length === 0 && investmentAccounts.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">📈</div>
              <div className="text-sm">투자 계좌를 추가하고 종목을 기록해보세요!</div>
              <button onClick={() => openAddAccount()} className="mt-4 bg-indigo-600 text-white text-sm px-6 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors">+ 계좌 추가</button>
            </div>
          )}
        </div>
      )}

      {/* ══ 보유 종목 탭 ══════════════════════════════════════════════════════ */}
      {pageTab === 'holdings' && (
        <div className="space-y-5">
          {investmentAccounts.length === 0 && investments.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">💼</div>
              <div className="text-sm mb-1">먼저 투자 계좌를 추가해보세요</div>
              <div className="text-xs text-gray-400 mb-4">계좌별로 종목을 관리할 수 있습니다</div>
              <button onClick={() => openAddAccount()} className="bg-indigo-600 text-white text-sm px-6 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors">+ 계좌 추가</button>
            </div>
          )}

          {investmentAccounts.map(acc => {
            const allAccInvestments = investmentsByAccount.get(acc.id) ?? []
            // 거래 이력이 없는 종목은 목록에서 숨김 (등록만 하고 거래 내역 전체 삭제된 경우)
            const accInvestments = allAccInvestments.filter(inv =>
              investmentTrades.some(t => t.investmentId === inv.id)
            )
            const stats = portfolio.byAccount[acc.id]
            const isCollapsed = !expandedAccounts.has(acc.id)
            return (
              <div key={acc.id}>
                <div className="mb-3">
                  {/* 상단 행: 아이콘 + 계좌명 + 잔액 */}
                  <div className="flex items-center gap-3 cursor-pointer select-none mb-2"
                    onClick={() => toggleCollapse(acc.id)}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0" style={{ backgroundColor: acc.color + '20', color: acc.color }}>
                      {getTypeLabel(acc.typeId).slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{acc.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">{isCollapsed ? '▶' : '▼'}</span>
                      </div>
                      <div className="text-xs text-gray-400 truncate">{acc.bank} · {getTypeLabel(acc.typeId)} · {accInvestments.length}종목{acc.accountNumber ? ` · ${acc.accountNumber}` : ''}</div>
                    </div>
                    {(() => {
                      const cash = cashBalanceMap.get(acc.id) ?? 0
                      const pnl = stats ? stats.eval - stats.buy : 0
                      const rate = stats && stats.buy > 0 ? (pnl / stats.buy) * 100 : 0
                      const accountDayChange = investments
                        .filter(inv => inv.accountId === acc.id)
                        .reduce((sum, inv) => {
                          const h = holdingsMap.get(inv.id)
                          if (!h || inv.prevCloseDiff === undefined || inv.prevCloseDiff === null) return sum
                          const isForeign = inv.assetType === 'foreign_stock'
                          const fxRate = isForeign ? (exchangeRates['USD'] ?? 0) : 1
                          if (isForeign && fxRate === 0) return sum
                          return sum + Math.round(inv.prevCloseDiff * h.holdingQty * fxRate)
                        }, 0)
                      const hasDayChange = investments
                        .filter(inv => inv.accountId === acc.id)
                        .some(inv => inv.prevCloseDiff !== undefined)
                      return (
                        <div style={{ textAlign: 'right' }} className="flex-shrink-0">
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                            {fmtKRW(Math.round((stats?.eval ?? 0) + Math.max(0, cash)))}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '2px' }}>
                            <span style={{ fontSize: '10px', color: '#6b7280' }}>원금 <b style={{ color: '#374151', fontWeight: 500 }}>{fmtKRW(Math.round(stats?.buy ?? 0))}</b></span>
                            <span style={{ fontSize: '10px', color: '#d1d5db' }}>|</span>
                            <span style={{ fontSize: '10px', color: '#6b7280' }}>예수금 <b style={{ color: '#374151', fontWeight: 500 }}>{fmtKRW(Math.round(cash))}</b></span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', marginTop: '3px' }}>
                            {stats && (
                              <span style={{ fontSize: '11px', color: pnl >= 0 ? '#059669' : '#ef4444', fontWeight: 500 }}>
                                {pnl >= 0 ? '+' : ''}{fmtKRW(Math.round(pnl))} ({fmtPct(rate)})
                              </span>
                            )}
                            {hasDayChange && (
                              <>
                                <span style={{ fontSize: '9px', fontWeight: 600, background: '#e5e7eb', color: '#6b7280', padding: '1px 4px', borderRadius: '3px' }}>전일</span>
                                <span style={{ fontSize: '10px', color: accountDayChange >= 0 ? '#ef4444' : '#3b82f6' }}>
                                  {accountDayChange >= 0 ? '▲' : '▼'} {accountDayChange >= 0 ? '+' : ''}{fmtKRW(Math.round(accountDayChange))}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                  {/* 하단 행: 버튼들 (아이콘 너비만큼 들여쓰기) */}
                  <div className="flex items-center gap-1.5 pl-[52px]" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openDeposit(acc.id)}
                      className="text-xs bg-amber-50 text-amber-600 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 transition-colors font-medium">
                      입금
                    </button>
                    <button onClick={() => openAddInvestment(acc.id)}
                      className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors font-medium">
                      + 종목
                    </button>
                    <button onClick={() => openAddDividend(acc.id)}
                      className="text-xs bg-emerald-50 text-emerald-600 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors font-medium">
                      + 배당
                    </button>
                    <button onClick={() => openEditAccount(acc)}
                      className="text-xs text-gray-400 hover:text-blue-500 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                      ✏️
                    </button>
                    <button onClick={() => setDeleteAccountId(acc.id)}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                      🗑️
                    </button>
                  </div>
                </div>

                {!isCollapsed && (() => {
                  const accDividends = investmentDividends
                    .filter(d => d.accountId === acc.id)
                    .sort((a, b) => b.date.localeCompare(a.date))
                  const isAccDivExpanded = expandedDividendAccId === acc.id
                  const displayDividends = isAccDivExpanded ? accDividends : accDividends.slice(0, 3)
                  return (
                    <>
                      {accInvestments.length === 0 ? (
                        <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-400 border-2 border-dashed border-gray-200 mb-4">
                          <div className="text-2xl mb-1">📭</div>
                          <div className="text-xs">등록된 종목이 없습니다</div>
                          <button onClick={() => openAddInvestment(acc.id)} className="mt-2 text-xs text-blue-500 underline">+ 종목 추가</button>
                        </div>
                      ) : (
                        <div className="space-y-3 pl-1 border-l-2 mb-4" style={{ borderColor: acc.color + '60' }}>
                          {accInvestments.map(inv => renderInvestmentCard(inv))}
                        </div>
                      )}

                    </>
                  )
                })()}
              </div>
            )
          })}

          {(() => {
            const noneInvs = (investmentsByAccount.get('__none__') ?? []).filter(inv =>
              investmentTrades.some(t => t.investmentId === inv.id)
            )
            if (noneInvs.length === 0) return null
            return (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg">📦</div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-700">미분류</div>
                    <div className="text-xs text-gray-400">계좌가 지정되지 않은 종목</div>
                  </div>
                </div>
                <div className="space-y-3 pl-1 border-l-2 border-gray-200">
                  {noneInvs.map(inv => renderInvestmentCard(inv))}
                </div>
              </div>
            )
          })()}

          {investmentAccounts.length > 0 && (
            <button onClick={() => openAddAccount()}
              className="w-full py-3 border-2 border-dashed border-indigo-200 text-indigo-500 rounded-2xl text-sm hover:bg-indigo-50 transition-colors">
              + 새 계좌 추가
            </button>
          )}
        </div>
      )}

      {/* ══ 관심종목 탭 ══════════════════════════════════════════════════════ */}
      {pageTab === 'watchlist' && (
        <div className="space-y-4">
          {/* 검색창 + 드롭다운 */}
          <div ref={watchlistDropdownRef} className="relative">
            <div className="bg-white rounded-2xl shadow-sm flex items-center px-4 py-3 gap-2">
              <span className="text-gray-400 text-base shrink-0">🔍</span>
              <input
                value={watchlistQuery}
                onChange={e => {
                  setWatchlistQuery(e.target.value)
                  triggerWatchlistSearch(e.target.value)
                  if (!e.target.value && activeCompositionKey?.id?.startsWith('search_')) setActiveCompositionKey(null)
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setWatchlistQuery('')
                    setWatchlistResults([])
                    if (activeCompositionKey?.id?.startsWith('search_')) setActiveCompositionKey(null)
                  }
                }}
                placeholder="종목명 또는 티커 검색 (예: 삼성전자, AAPL)"
                className="flex-1 text-sm focus:outline-none placeholder-gray-400 bg-transparent"
              />
              {watchlistSearching && (
                <div className="text-xs text-gray-400 whitespace-nowrap shrink-0">검색 중…</div>
              )}
              {watchlistQuery && !watchlistSearching && (
                <button onClick={() => {
                  setWatchlistQuery('')
                  setWatchlistResults([])
                  if (activeCompositionKey?.id?.startsWith('search_')) setActiveCompositionKey(null)
                }}
                  className="text-gray-300 hover:text-gray-500 text-lg shrink-0 leading-none">×</button>
              )}
            </div>

            {/* 플로팅 드롭다운 */}
            {watchlistResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                <div className="overflow-y-auto max-h-72">
                {watchlistResults.map((item, i) => {
                  const alreadyAdded = watchlist.some(w => w.ticker === item.ticker && w.assetType === item.assetType)
                  const isEtf = item.assetType === 'etf_fund' || isDomesticEtf(item.name, item.exchange)
                  const searchId = `search_${item.ticker}`
                  return (
                    <div key={i}
                      className="flex items-center justify-between px-4 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-0 cursor-pointer transition-colors"
                      onClick={() => {
                        if (alreadyAdded) return
                        const newItem: WatchlistItem = {
                          id: `wl_${Date.now()}`,
                          name: item.name,
                          ticker: item.ticker,
                          exchange: item.exchange,
                          assetType: item.assetType,
                          currency: item.currency,
                        }
                        const updated = [...watchlist, newItem]
                        setWatchlist(updated)
                        setWatchlistQuery('')
                        setWatchlistResults([])
                        if (activeCompositionKey?.id?.startsWith('search_')) setActiveCompositionKey(null)
                        refreshWatchlistPrices(updated)
                      }}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl shrink-0">{ASSET_TYPE_META[item.assetType].icon}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5 flex-wrap">
                            {item.name}
                            {isEtf && item.ticker && (
                              <button
                                onClick={e => openCompositionPopup(e, searchId, item.ticker, item.name)}
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md transition-colors shrink-0 ${activeCompositionKey?.id === searchId ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-500 hover:bg-blue-100'}`}>
                                구성
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {item.ticker}
                            {item.exchange ? <span className="ml-1 text-gray-300">· {item.exchange}</span> : null}
                          </div>
                        </div>
                      </div>
                      {alreadyAdded ? (
                        <span className="ml-2 shrink-0 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">추가됨</span>
                      ) : (
                        <span className="ml-2 shrink-0 text-xs text-blue-600 font-semibold">+ 추가</span>
                      )}
                    </div>
                  )
                })}
                </div>
              </div>
            )}
          </div>

          {/* 관심종목 목록 */}
          {watchlist.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-5xl mb-3">⭐</div>
              <div className="text-sm font-medium text-gray-500">관심종목이 없습니다</div>
              <div className="text-xs mt-1">위에서 종목을 검색하여 추가해보세요</div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-gray-400 font-medium">{watchlist.length}개 종목</div>
                <button
                  onClick={() => refreshWatchlistPrices(watchlist)}
                  disabled={watchlistPriceLoading}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50">
                  {watchlistPriceLoading ? '⏳ 조회 중…' : '🔄 시세 새로고침'}
                </button>
              </div>
              {watchlist.map(w => {
                const diff = w.prevCloseDiff ?? 0
                const rate = w.prevCloseDiffRate ?? 0
                const isUp = diff >= 0
                const hasChange = w.prevCloseDiff !== undefined
                const isForeignCcy = w.currency !== 'KRW'
                return (
                  <div key={w.id}
                    data-wl-id={w.id}
                    draggable
                    onDragStart={() => setWlDragId(w.id)}
                    onDragOver={e => onWlDragOver(e, w.id)}
                    onDrop={e => onWlDrop(e, w.id)}
                    onDragEnd={onWlDragEnd}
                    className={`bg-white rounded-2xl p-4 shadow-sm flex items-center gap-2 transition-all ${wlDragId === w.id ? 'opacity-40' : ''} ${wlOverId === w.id && wlDragId !== w.id ? 'ring-2 ring-blue-400' : ''}`}>
                    {/* 드래그 손잡이 (터치는 여기서 시작) */}
                    <span
                      onTouchStart={() => onWlTouchStart(w.id)}
                      onTouchMove={onWlTouchMove}
                      onTouchEnd={onWlTouchEnd}
                      className="shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 select-none touch-none text-lg leading-none"
                      title="드래그하여 순서 변경">⠿</span>
                    <span className="text-2xl shrink-0">{ASSET_TYPE_META[w.assetType].icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-800 text-sm flex items-center gap-1.5 flex-wrap">
                        {w.name}
                        {(w.assetType === 'etf_fund' || isDomesticEtf(w.name, w.exchange)) && w.ticker && (
                          <button
                            onClick={e => openCompositionPopup(e, w.id, w.ticker!, w.name)}
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md transition-colors ${activeCompositionKey?.id === w.id ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-500 hover:bg-blue-100'}`}>
                            구성
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{w.ticker}{w.exchange ? ` · ${w.exchange}` : ''}</div>
                      {w.currentPriceUpdatedAt && (
                        <div className="text-[10px] text-gray-300 mt-0.5">{new Date(w.currentPriceUpdatedAt).toLocaleString('ko-KR')}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {w.currentPrice !== undefined ? (
                        <>
                          <div className="font-bold text-gray-800 text-sm">
                            {isForeignCcy
                              ? '$' + w.currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : w.currentPrice.toLocaleString('ko-KR') + '원'}
                          </div>
                          {hasChange && (
                            <div className={`text-xs flex items-center justify-end gap-0.5 mt-0.5 font-medium ${isUp ? 'text-red-500' : 'text-blue-500'}`}>
                              {isUp ? '▲' : '▼'}
                              <span>
                                {isForeignCcy
                                  ? Math.abs(diff).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                  : Math.abs(diff).toLocaleString('ko-KR')}
                              </span>
                              {w.prevCloseDiffRate !== undefined && (
                                <span className="ml-0.5 text-[11px]">({rate >= 0 ? '+' : ''}{rate.toFixed(2)}%)</span>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-xs text-gray-400">시세 없음</div>
                      )}
                    </div>
                    <button
                      onClick={() => setWatchlist(watchlist.filter(x => x.id !== w.id))}
                      className="text-gray-300 hover:text-red-400 transition-colors text-xl shrink-0 leading-none">
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ 거래 이력 탭 ══════════════════════════════════════════════════════ */}
      {pageTab === 'trades' && (
        <div>
          {/* 타입 필터 */}
          <div className="flex gap-1.5 mb-4 bg-gray-100 rounded-2xl p-1">
            {([['trade', '매수/매도'], ['deposit', '예수금']] as const).map(([type, label]) => (
              <button key={type} onClick={() => setTradeTypeFilter(type)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${tradeTypeFilter === type ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* 계좌 필터 — 전탭 공통 */}
          {investmentAccounts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              <button onClick={() => setSelectedTradeAccountId(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${!selectedTradeAccountId ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                전체
              </button>
              {investmentAccounts.map(acc => (
                <button key={acc.id} onClick={() => setSelectedTradeAccountId(prev => prev === acc.id ? null : acc.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${selectedTradeAccountId === acc.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                  {acc.name}
                </button>
              ))}
            </div>
          )}

          {/* ── 예수금 변동 내역 ── */}
          {tradeTypeFilter === 'deposit' && (() => {
            type CashRow =
              | { kind: 'deposit'; id: string; accountId: string; date: string; amount: number; note?: string }
              | { kind: 'dividend'; id: string; accountId: string; date: string; amount: number; invName: string }

            const depositRows: CashRow[] = investmentCashDeposits
              .filter(d => !selectedTradeAccountId || d.accountId === selectedTradeAccountId)
              .map(d => ({ kind: 'deposit', id: d.id, accountId: d.accountId, date: d.date, amount: d.amount, note: d.note }))

            const dividendRows: CashRow[] = investmentDividends
              .filter(d => !selectedTradeAccountId || d.accountId === selectedTradeAccountId)
              .map(d => ({
                kind: 'dividend',
                id: d.id,
                accountId: d.accountId,
                date: d.date,
                amount: d.netAmount,
                invName: d.investmentId ? (investments.find(i => i.id === d.investmentId)?.name ?? '') : '',
              }))

            const rows = [...depositRows, ...dividendRows].sort((a, b) => b.date.localeCompare(a.date))
            const totalIn  = rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0)
            const totalOut = rows.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0)
            const net = totalIn + totalOut
            return (
              <div className="space-y-3">
                {/* 요약 카드 */}
                {rows.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">입금 합계</div>
                      <div className="text-sm font-bold text-emerald-600">+{totalIn.toLocaleString('ko-KR')}원</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">차감 합계</div>
                      <div className="text-sm font-bold text-red-500">{totalOut.toLocaleString('ko-KR')}원</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">순 변동</div>
                      <div className={`text-sm font-bold ${net >= 0 ? 'text-gray-800' : 'text-red-500'}`}>
                        {net >= 0 ? '+' : ''}{net.toLocaleString('ko-KR')}원
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-400">{rows.length}건</div>
                  <button onClick={() => openDeposit(selectedTradeAccountId ?? investmentAccounts[0]?.id ?? '')}
                    className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-xl hover:bg-amber-600 transition-colors font-medium">
                    + 입금
                  </button>
                </div>
                {rows.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <div className="text-3xl mb-2">💵</div>
                    <div className="text-sm">예수금 변동 내역이 없습니다</div>
                  </div>
                )}
                {rows.map(row => {
                  const accName = investmentAccounts.find(a => a.id === row.accountId)?.name ?? ''
                  const isIn = row.amount > 0
                  const isDividend = row.kind === 'dividend'
                  const label = isDividend
                    ? `배당금 입금${row.kind === 'dividend' && row.invName ? ` · ${row.invName}` : ''}`
                    : (row.kind === 'deposit' ? row.note : undefined)
                  return (
                    <div key={`${row.kind}-${row.id}`} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${isDividend ? 'bg-emerald-50' : isIn ? 'bg-blue-50' : 'bg-red-50'}`}>
                        {isDividend ? '💰' : isIn ? '⬆' : '⬇'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between">
                          <span className={`text-sm font-bold ${isIn ? 'text-emerald-600' : 'text-red-500'}`}>
                            {isIn ? '+' : ''}{row.amount.toLocaleString('ko-KR')}원
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5 flex-wrap">
                          <span>{row.date}</span>
                          <span className="text-indigo-400">{accName}</span>
                          {label && <span>{label}</span>}
                        </div>
                      </div>
                      {row.kind === 'deposit' && (
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => openEditDeposit(investmentCashDeposits.find(d => d.id === row.id)!)}
                            className="text-gray-300 hover:text-blue-500 p-1 rounded hover:bg-blue-50 text-xs">✏️</button>
                          <button onClick={() => setDeleteDepositId(row.id)}
                            className="text-gray-300 hover:text-red-500 p-1 rounded hover:bg-red-50 text-xs">🗑️</button>
                        </div>
                      )}
                      {row.kind === 'dividend' && (
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => openEditDividend(investmentDividends.find(d => d.id === row.id)!)}
                            className="text-gray-300 hover:text-blue-500 p-1 rounded hover:bg-blue-50 text-xs">✏️</button>
                          <button onClick={() => setDeleteDividendId(row.id)}
                            className="text-gray-300 hover:text-red-500 p-1 rounded hover:bg-red-50 text-xs">🗑️</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}


          {/* ── 매수/매도 거래 목록 ── */}
          {tradeTypeFilter === 'trade' && <>
          {/* 요약 카드 */}
          {(() => {
            const filtered = selectedTradeAccountId
              ? investmentTrades.filter(t => investments.find(i => i.id === t.investmentId)?.accountId === selectedTradeAccountId)
              : investmentTrades
            if (filtered.length === 0) return null
            const buyAmt  = filtered.filter(t => t.type === 'buy').reduce((s, t) => s + t.quantity * t.price, 0)
            const sellAmt = filtered.filter(t => t.type === 'sell').reduce((s, t) => s + t.quantity * t.price, 0)
            const feeAmt  = filtered.reduce((s, t) => s + (t.fee ?? 0), 0)
            return (
              <div className="bg-white rounded-2xl p-4 shadow-sm grid grid-cols-3 gap-3 text-center mb-4">
                <div>
                  <div className="text-xs text-gray-400 mb-1">매수 합계</div>
                  <div className="text-sm font-bold text-blue-600">{fmtKRW(Math.round(buyAmt))}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">매도 합계</div>
                  <div className="text-sm font-bold text-emerald-600">+{fmtKRW(Math.round(sellAmt))}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">총 수수료</div>
                  <div className="text-sm font-bold text-gray-500">{fmtKRW(Math.round(feeAmt))}</div>
                </div>
              </div>
            )
          })()}

          {/* 종목 필터 — 이름 기준 중복 제거 */}
          {tradeInvNames.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => setSelectedTradeInvName(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${!selectedTradeInvName ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                전체 종목
              </button>
              {tradeInvNames.map(name => {
                const assetType = investments.find(i => i.name === name)?.assetType ?? 'domestic_stock'
                const meta = ASSET_TYPE_META[assetType as InvestmentAssetType]
                return (
                  <button key={name} onClick={() => setSelectedTradeInvName(prev => prev === name ? null : name)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${selectedTradeInvName === name ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                    {meta.icon} {name}
                  </button>
                )
              })}
            </div>
          )}

          {/* 거래 목록 */}
          {tradeGroupsByName ? (
            /* 전체 보기: 이름 기준 그룹화 */
            <div className="space-y-3">
              {tradeGroupsByName.size === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-3xl mb-2">📋</div>
                  <div className="text-sm">거래 이력이 없습니다</div>
                </div>
              )}
              {Array.from(tradeGroupsByName.entries()).map(([invName, trades]) => {
                // 이 그룹에 속한 고유 investment 목록 (아이콘·계좌 표시용)
                const groupInvIds = [...new Set(trades.map(t => t.investmentId))]
                const groupInvs = groupInvIds.map(id => investments.find(i => i.id === id)).filter(Boolean) as typeof investments
                const meta = groupInvs[0] ? ASSET_TYPE_META[groupInvs[0].assetType] : null
                // 계좌 목록 (중복 제거)
                const accNames = [...new Set(
                  groupInvs.map(inv => inv.accountId ? investmentAccounts.find(a => a.id === inv.accountId)?.name : null).filter(Boolean) as string[]
                )]
                const isCollapsed = collapsedTradeInvIds.has(invName)
                const buyTotal = trades.filter(t => t.type === 'buy').reduce((s, t) => s + t.quantity * t.price, 0)
                const sellTotal = trades.filter(t => t.type === 'sell').reduce((s, t) => s + t.quantity * t.price, 0)
                const buyCount = trades.filter(t => t.type === 'buy').length
                const sellCount = trades.filter(t => t.type === 'sell').length
                return (
                  <div key={invName} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    {/* 그룹 헤더 */}
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                      onClick={() => setCollapsedTradeInvIds(prev => {
                        const next = new Set(prev)
                        if (next.has(invName)) next.delete(invName); else next.add(invName)
                        return next
                      })}>
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-base flex-shrink-0">
                        {meta?.icon ?? '📦'}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-semibold text-gray-900 truncate">{invName}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                          {accNames.map(n => <span key={n} className="text-indigo-400">{n}</span>)}
                          {accNames.length > 0 && <span>·</span>}
                          <span>총 {trades.length}건</span>
                          {buyCount > 0 && <span className="text-blue-500">매수 {buyCount}건</span>}
                          {sellCount > 0 && <span className="text-red-400">매도 {sellCount}건</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 mr-1">
                        {buyTotal > 0 && <div className="text-xs text-red-400">매수 {fmtKRW(Math.round(buyTotal))}</div>}
                        {sellTotal > 0 && <div className="text-xs text-emerald-600">매도 +{fmtKRW(Math.round(sellTotal))}</div>}
                      </div>
                      <div className="text-gray-400 text-sm flex-shrink-0">{isCollapsed ? '▶' : '▼'}</div>
                    </button>
                    {/* 그룹 내 거래 목록 */}
                    {!isCollapsed && (
                      <div className="border-t border-gray-100 divide-y divide-gray-50">
                        {trades.map(trade => {
                          const isBuy = trade.type === 'buy'
                          const tradeAmt = trade.quantity * trade.price
                          const fee = trade.fee ?? 0
                          const totalCash = isBuy ? tradeAmt + fee : tradeAmt - fee
                          return (
                            <div key={trade.id} className="flex items-center gap-2 px-4 py-2.5">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${isBuy ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-500'}`}>
                                {isBuy ? '매수' : '매도'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-medium text-gray-700">{trade.date ?? '날짜 미입력'}</span>
                                  <span className="text-xs text-gray-400">{trade.quantity.toLocaleString()}주</span>
                                  <span className="text-xs text-gray-400">@{trade.price.toLocaleString()}{trade.currency !== 'KRW' ? ` ${trade.currency}` : '원'}</span>
                                </div>
                                {(fee > 0 || trade.note) && (
                                  <div className="text-[11px] text-gray-400 mt-0.5">
                                    {fee > 0 && `수수료 ${fmtKRW(fee)}`}{fee > 0 && trade.note && ' · '}{trade.note}
                                  </div>
                                )}
                              </div>
                              <div className={`text-sm font-bold flex-shrink-0 ${isBuy ? 'text-red-500' : 'text-emerald-600'}`}>
                                {isBuy ? '-' : '+'}{fmtKRW(Math.round(totalCash))}
                              </div>
                              <div className="flex gap-0.5 flex-shrink-0">
                                <button onClick={() => openEditTrade(trade)} className="text-gray-300 hover:text-blue-500 p-1 rounded hover:bg-blue-50 transition-colors text-xs">✏️</button>
                                <button onClick={() => setDeleteTradeId(trade.id)} className="text-gray-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors text-xs">🗑️</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            /* 특정 종목 선택: 기존 플랫 리스트 */
            <div className="space-y-2">
              {selectedTrades.map(trade => {
                const inv = investments.find(i => i.id === trade.investmentId)
                const acc = inv?.accountId ? investmentAccounts.find(a => a.id === inv.accountId) : null
                const isBuy = trade.type === 'buy'
                const tradeAmt = trade.quantity * trade.price
                const totalAmt = isBuy ? tradeAmt + (trade.fee ?? 0) : tradeAmt - (trade.fee ?? 0)
                return (
                  <div key={trade.id} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${isBuy ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-500'}`}>
                        {isBuy ? '매수' : '매도'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-900 truncate">{inv?.name ?? '-'}</span>
                          <span className={`text-sm font-bold flex-shrink-0 ${isBuy ? 'text-red-500' : 'text-emerald-600'}`}>
                            {isBuy ? '-' : '+'}{trade.currency !== 'KRW' ? `$${totalAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : fmtKRW(Math.round(totalAmt))}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                          <span>{trade.date ?? '날짜 미입력'}</span>
                          <span>·</span>
                          <span>{trade.quantity.toLocaleString()}주 × {trade.price.toLocaleString()}{trade.currency !== 'KRW' ? ` ${trade.currency}` : '원'}</span>
                          {trade.fee ? <><span>·</span><span>수수료 {trade.fee.toLocaleString()}원</span></> : null}
                          {acc && <><span>·</span><span className="text-indigo-400">{acc.name}</span></>}
                        </div>
                        {trade.note && <div className="text-xs text-gray-400 mt-0.5">{trade.note}</div>}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => openEditTrade(trade)} className="text-xs text-gray-400 hover:text-blue-500 px-1.5 py-1 rounded-lg hover:bg-blue-50 transition-colors">✏️</button>
                        <button onClick={() => setDeleteTradeId(trade.id)} className="text-red-400 hover:text-red-600 text-xs px-1.5 py-1 rounded-lg hover:bg-red-50 transition-colors">🗑️</button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {selectedTrades.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-3xl mb-2">📋</div>
                  <div className="text-sm">거래 이력이 없습니다</div>
                </div>
              )}
            </div>
          )}
          </>}
        </div>
      )}


      {/* ══ 포트폴리오 관리 탭 (F-05) ══════════════════════════════════════════ */}
      {pageTab === 'portfolio' && (
        <div className="space-y-4">
          {holdingInvestments.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">🎯</div>
              <div className="text-sm">등록된 투자 내역이 없습니다</div>
              <div className="text-xs mt-1">보유 종목이 있어야 포트폴리오 관리를 사용할 수 있습니다</div>
            </div>
          ) : (
            <>
              {/* 계좌 탭 */}
              {portfolioAccounts.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {portfolioAccounts.map(acc => (
                    <button key={acc.id}
                      onClick={() => { setPortfolioAccId(acc.id); loadPlanForAccount(acc.id) }}
                      className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${portfolioAccId === acc.id ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 shadow-sm'}`}>
                      {acc.name}
                      {portfolioPlans.find(p => p.accountId === acc.id) && (
                        <span className="ml-1 text-xs text-emerald-400">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* 목표 비율 설정 */}
              {editingPlan && (
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-gray-800">목표 비율 설정</div>
                    <div className={`text-xs font-medium px-2 py-1 rounded-lg ${Math.abs(accountTotalPct - 100) < 0.1 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                      합계 {accountTotalPct.toFixed(1)}%
                      {Math.abs(accountTotalPct - 100) >= 0.1 && ' ⚠️'}
                    </div>
                  </div>

                  <div className="space-y-3 mb-3">
                    {/* 그룹 목록 */}
                    {editingPlan.groups.map(group => {
                      const groupItemSum = group.items.reduce((s, i) => s + i.targetPct, 0)
                      const isOver = dragOverId === group.id
                      return (
                        <div key={group.id}
                          className={`border rounded-xl overflow-hidden transition-colors ${isOver ? 'border-indigo-400 bg-indigo-50/60' : 'border-indigo-100'}`}
                          onDragOver={e => { e.preventDefault(); setDragOverId(group.id) }}
                          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null) }}
                          onDrop={e => {
                            e.preventDefault()
                            const itemId = e.dataTransfer.getData('itemId')
                            const srcGroupId = e.dataTransfer.getData('sourceGroupId')
                            if (itemId && srcGroupId !== group.id) handleItemDrop(itemId, srcGroupId === 'null' ? null : srcGroupId, group.id)
                          }}
                        >
                          {/* 그룹 헤더 */}
                          <div className="flex items-center gap-2 px-3 py-2.5 bg-indigo-50">
                            <span className="text-sm">📦</span>
                            <input
                              type="text" value={group.name}
                              onChange={e => setEditingPlan(prev => prev ? { ...prev, groups: prev.groups.map(g => g.id === group.id ? { ...g, name: e.target.value } : g) } : prev)}
                              className="flex-1 text-sm font-semibold text-indigo-700 bg-transparent border-none outline-none min-w-0"
                              placeholder="그룹명"
                            />
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <input
                                type="number" min={0} max={100} step={0.1}
                                value={group.targetPct || ''}
                                onChange={e => setEditingPlan(prev => prev ? { ...prev, groups: prev.groups.map(g => g.id === group.id ? { ...g, targetPct: parseFloat(e.target.value) || 0 } : g) } : prev)}
                                className="w-16 text-right border border-indigo-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              />
                              <span className="text-xs text-indigo-400">%</span>
                              <button onClick={() => setEditingPlan(prev => prev ? { ...prev, groups: prev.groups.filter(g => g.id !== group.id) } : prev)}
                                className="ml-1 text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                            </div>
                          </div>
                          {/* 그룹 내 종목 */}
                          <div className="px-3 py-2 space-y-2">
                            {group.items.length === 0 && (
                              <div className="text-xs text-gray-400 py-2 text-center border border-dashed border-indigo-200 rounded-lg">
                                {isOver ? '여기에 놓으세요' : '종목을 드래그하거나 추가하세요'}
                              </div>
                            )}
                            {group.items.map(item => (
                              <div key={item.id}
                                draggable
                                onDragStart={e => {
                                  e.dataTransfer.setData('itemId', item.id)
                                  e.dataTransfer.setData('sourceGroupId', group.id)
                                  e.dataTransfer.effectAllowed = 'move'
                                }}
                                className="flex items-center gap-2 cursor-grab active:cursor-grabbing"
                              >
                                <span className="text-gray-300 text-sm select-none">⠿</span>
                                <div className="flex-1 text-sm text-gray-700 truncate">{getItemName(item)}</div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <input
                                    type="number" min={0} max={100} step={0.1}
                                    value={item.targetPct || ''}
                                    onChange={e => setEditingPlan(prev => prev ? { ...prev, groups: prev.groups.map(g => g.id === group.id ? { ...g, items: g.items.map(i => i.id === item.id ? { ...i, targetPct: parseFloat(e.target.value) || 0 } : i) } : g) } : prev)}
                                    className="w-16 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    onClick={e => e.stopPropagation()}
                                  />
                                  <span className="text-xs text-gray-400">%</span>
                                  <button onClick={() => setEditingPlan(prev => prev ? { ...prev, groups: prev.groups.map(g => g.id === group.id ? { ...g, items: g.items.filter(i => i.id !== item.id) } : g) } : prev)}
                                    className="ml-1 text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                                </div>
                              </div>
                            ))}
                            {group.items.length > 0 && (
                              <div className={`text-xs px-1 ${Math.abs(groupItemSum - 100) < 0.1 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                그룹 내 합계 {groupItemSum.toFixed(1)}%
                              </div>
                            )}
                            <div className="flex gap-2 pt-1">
                              <button onClick={() => { setShowInvPicker({ mode: 'group', groupId: group.id }); setPickerCustomName('') }}
                                className="text-xs text-indigo-500 hover:text-indigo-700">+ 종목 추가</button>
                              {group.items.length > 1 && (
                                <button onClick={() => equalizeGroup(group.id)}
                                  className="text-xs text-gray-400 hover:text-gray-600">균등분배</button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {/* 미그룹 종목 */}
                    <div
                      className={`space-y-2 rounded-xl transition-colors ${dragOverId === 'ungrouped' ? 'bg-blue-50/60 ring-1 ring-blue-300 p-2' : editingPlan.items.length === 0 && editingPlan.groups.length > 0 ? '' : ''}`}
                      onDragOver={e => { e.preventDefault(); setDragOverId('ungrouped') }}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null) }}
                      onDrop={e => {
                        e.preventDefault()
                        const itemId = e.dataTransfer.getData('itemId')
                        const srcGroupId = e.dataTransfer.getData('sourceGroupId')
                        if (itemId && srcGroupId !== 'null') handleItemDrop(itemId, srcGroupId === 'null' ? null : srcGroupId, null)
                      }}
                    >
                      {editingPlan.items.length === 0 && dragOverId === 'ungrouped' && (
                        <div className="text-xs text-blue-400 text-center py-1">여기에 놓으면 그룹 해제됩니다</div>
                      )}
                      {editingPlan.items.map(item => (
                        <div key={item.id}
                          draggable
                          onDragStart={e => {
                            e.dataTransfer.setData('itemId', item.id)
                            e.dataTransfer.setData('sourceGroupId', 'null')
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          className="flex items-center gap-2 cursor-grab active:cursor-grabbing"
                        >
                          <span className="text-gray-300 text-sm select-none">⠿</span>
                          <div className="flex-1 text-sm text-gray-700 truncate">{getItemName(item)}</div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <input
                              type="number" min={0} max={100} step={0.1}
                              value={item.targetPct || ''}
                              onChange={e => setEditingPlan(prev => prev ? { ...prev, items: prev.items.map(i => i.id === item.id ? { ...i, targetPct: parseFloat(e.target.value) || 0 } : i) } : prev)}
                              className="w-16 text-right border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                              onClick={e => e.stopPropagation()}
                            />
                            <span className="text-xs text-gray-400">%</span>
                            <button onClick={() => setEditingPlan(prev => prev ? { ...prev, items: prev.items.filter(i => i.id !== item.id) } : prev)}
                              className="ml-1 text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => { setShowInvPicker({ mode: 'ungrouped' }); setPickerCustomName('') }}
                      className="flex-1 py-2 border border-dashed border-gray-300 rounded-xl text-xs text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors">
                      + 종목 추가
                    </button>
                    {showAddGroup ? (
                      <div className="flex gap-1 flex-1">
                        <input type="text" placeholder="그룹명" value={newGroupName}
                          onChange={e => setNewGroupName(e.target.value)}
                          className="flex-1 border border-indigo-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          onKeyDown={e => {
                            if (e.key === 'Enter' && newGroupName.trim()) {
                              setEditingPlan(prev => prev ? { ...prev, groups: [...prev.groups, { id: `g_${Date.now()}`, name: newGroupName.trim(), targetPct: 0, items: [] }] } : prev)
                              setNewGroupName(''); setShowAddGroup(false)
                            }
                            if (e.key === 'Escape') { setNewGroupName(''); setShowAddGroup(false) }
                          }}
                          autoFocus
                        />
                        <button onClick={() => {
                          if (newGroupName.trim()) {
                            setEditingPlan(prev => prev ? { ...prev, groups: [...prev.groups, { id: `g_${Date.now()}`, name: newGroupName.trim(), targetPct: 0, items: [] }] } : prev)
                            setNewGroupName('')
                          }
                          setShowAddGroup(false)
                        }} className="px-3 py-2 bg-indigo-600 text-white text-xs rounded-xl">추가</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowAddGroup(true)}
                        className="flex-1 py-2 border border-dashed border-indigo-300 rounded-xl text-xs text-indigo-500 hover:border-indigo-500 transition-colors">
                        + 그룹 추가
                      </button>
                    )}
                  </div>

                  <button
                    onClick={savePlan}
                    disabled={Math.abs(accountTotalPct - 100) >= 0.1}
                    className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    저장하기
                  </button>
                </div>
              )}

              {/* 현재 vs 목표 비율 비교 */}
              {savedPlan && (() => {
                // 플랜 내 모든 항목 (effectivePct 포함)
                const allItems: { name: string; effectivePct: number; invId?: string }[] = []
                savedPlan.items.forEach(item => allItems.push({ name: getItemName(item), effectivePct: item.targetPct, invId: item.investmentId }))
                savedPlan.groups.forEach(g => {
                  allItems.push({ name: `📦 ${g.name}`, effectivePct: g.targetPct })
                  g.items.forEach(item => allItems.push({ name: `  └ ${getItemName(item)}`, effectivePct: g.targetPct * item.targetPct / 100, invId: item.investmentId }))
                })
                const accEval = evalByAccount[portfolioAccId!] ?? 0
                return (
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="text-sm font-semibold text-gray-800 mb-3">현재 vs 목표 비율</div>
                    <div className="grid grid-cols-4 text-xs font-semibold text-gray-400 mb-2 px-1">
                      <span className="col-span-2">종목</span>
                      <span className="text-right">목표</span>
                      <span className="text-right">현재</span>
                    </div>
                    <div className="space-y-1.5">
                      {allItems.map((item, idx) => {
                        const inv = item.invId ? investments.find(i => i.id === item.invId) : undefined
                        const h = inv ? holdingsMap.get(inv.id) : undefined
                        const isForeign = inv?.assetType === 'foreign_stock'
                        const fxRate = isForeign ? (exchangeRates['USD'] ?? 0) : 1
                        const evalAmt = h && inv ? (isForeign && fxRate > 0 ? Math.round(h.holdingQty * (inv.currentPrice ?? 0) * fxRate) : h.holdingQty * (inv.currentPrice ?? 0)) : 0
                        const curPct = accEval > 0 ? (evalAmt / accEval) * 100 : 0
                        const isGroup = item.name.startsWith('📦')
                        return (
                          <div key={idx} className={`grid grid-cols-4 items-center py-1.5 border-b border-gray-50 last:border-0 ${isGroup ? 'font-semibold text-indigo-700' : ''}`}>
                            <div className="col-span-2 text-sm truncate">{item.name}</div>
                            <div className="text-right text-sm text-gray-600">{item.effectivePct.toFixed(1)}%</div>
                            <div className={`text-right text-sm font-medium ${!isGroup ? (curPct > item.effectivePct + 1 ? 'text-emerald-600' : curPct < item.effectivePct - 1 ? 'text-red-500' : 'text-gray-600') : 'text-gray-400'}`}>
                              {isGroup ? '-' : `${curPct.toFixed(1)}%`}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* 리밸런싱 추천 */}
              {savedPlan && (
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-800 mb-3">리밸런싱 추천</div>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text" inputMode="numeric" placeholder="추가 투자 가능 금액 (원)"
                      value={additionalInvestment}
                      onChange={e => setAdditionalInvestment(fmtInput(e.target.value))}
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={handleCalcRebalance}
                      className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
                      계산
                    </button>
                  </div>
                  {rebalanceResult && (
                    <div>
                      <div className="grid grid-cols-3 text-xs font-semibold text-gray-400 mb-2 px-1">
                        <span className="col-span-1">종목</span>
                        <span className="text-right">금액</span>
                        <span className="text-right">예상 비율</span>
                      </div>
                      <div className="space-y-1.5">
                        {rebalanceResult.map(r => (
                          <div key={r.id} className="grid grid-cols-3 items-center py-1.5 border-b border-gray-50 last:border-0">
                            <div className="text-sm text-gray-700 truncate">{r.name}</div>
                            <div className={`text-right text-sm font-semibold ${r.action === 'sell' ? 'text-red-500' : 'text-blue-600'}`}>
                              {r.action === 'sell' ? '매도 ' : '매수 '}{r.addAmt > 0 ? fmtKRW(Math.round(r.addAmt)) : '-'}
                            </div>
                            <div className="text-right text-sm text-gray-600">{r.expectedPct.toFixed(1)}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 포트폴리오 종목 피커 모달 ─────────────────────────────────────────── */}
      {showInvPicker && editingPlan && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">종목 추가</h2>
              <button onClick={() => { setShowInvPicker(null); setPickerCustomName('') }} className="text-gray-400 text-xl">×</button>
            </div>
            {/* 현재 계좌 보유 종목 중 아직 플랜에 없는 것 */}
            {(() => {
              const planInvIds = new Set([
                ...editingPlan.items.map(i => i.investmentId).filter(Boolean),
                ...editingPlan.groups.flatMap(g => g.items.map(i => i.investmentId).filter(Boolean)),
              ])
              const available = holdingInvestments.filter(inv =>
                (inv.accountId ?? '__none__') === portfolioAccId && !planInvIds.has(inv.id)
              )
              return (
                <>
                  {available.length > 0 && (
                    <div className="space-y-2 mb-4">
                      <div className="text-xs font-semibold text-gray-400 mb-1">보유 종목</div>
                      {available.map(inv => (
                        <button key={inv.id}
                          onClick={() => addItemFromPicker(inv.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 hover:bg-gray-50 text-left">
                          <span>{ASSET_TYPE_META[inv.assetType].icon}</span>
                          <span className="text-sm text-gray-800">{inv.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-semibold text-gray-400 mb-1">직접 입력</div>
                    <div className="flex gap-2">
                      <input type="text" placeholder="종목명 직접 입력"
                        value={pickerCustomName}
                        onChange={e => setPickerCustomName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && pickerCustomName.trim() && addItemFromPicker(undefined, pickerCustomName.trim())}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button onClick={() => pickerCustomName.trim() && addItemFromPicker(undefined, pickerCustomName.trim())}
                        disabled={!pickerCustomName.trim()}
                        className="px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40">
                        추가
                      </button>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── F-03: 계좌 유형 관리 모달 ─────────────────────────────────────────── */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">계좌유형 관리</h2>
              <button onClick={() => { setShowTypeModal(false); setEditTypeId(null); setNewTypeName('') }} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-2 mb-4">
              {investmentAccountTypes.map(t => (
                <div key={t.id} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                  {editTypeId === t.id ? (
                    <>
                      <input
                        type="text" value={editTypeName}
                        onChange={e => setEditTypeName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveTypeName(); if (e.key === 'Escape') setEditTypeId(null) }}
                        className="flex-1 border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <button onClick={handleSaveTypeName} className="text-xs text-blue-600 font-semibold px-2 py-1.5 rounded-lg hover:bg-blue-50">저장</button>
                      <button onClick={() => setEditTypeId(null)} className="text-xs text-gray-400 px-2 py-1.5 rounded-lg hover:bg-gray-100">취소</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-800">{t.name}</span>
                      {t.isDefault && (
                        <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-medium">기본</span>
                      )}
                      <button onClick={() => { setEditTypeId(t.id); setEditTypeName(t.name) }}
                        className="text-xs text-gray-400 hover:text-blue-500 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                        수정
                      </button>
                      {!t.isDefault && (
                        <button onClick={() => handleDeleteType(t.id)}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                          삭제
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text" placeholder="새 유형 이름"
                value={newTypeName}
                onChange={e => setNewTypeName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddType() }}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button onClick={handleAddType} disabled={!newTypeName.trim()}
                className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40">
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 계좌 추가/수정 모달 ────────────────────────────────────────────── */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editAccountId ? '계좌 수정' : '투자 계좌 추가'}</h2>
              <button onClick={() => setShowAccountModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <input type="text" placeholder="계좌명 * (예: 미래에셋 연금저축)" value={accountForm.name}
                onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <input type="text" placeholder="증권사 / 금융기관 (예: 미래에셋증권)" value={accountForm.bank}
                onChange={e => setAccountForm(f => ({ ...f, bank: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <input type="text" placeholder="계좌번호 (선택)" value={accountForm.accountNumber ?? ''}
                onChange={e => setAccountForm(f => ({ ...f, accountNumber: e.target.value || undefined }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">계좌 유형</label>
                <div className="flex gap-2 flex-wrap">
                  {investmentAccountTypes.map(t => (
                    <button key={t.id} onClick={() => setAccountForm(f => ({ ...f, typeId: t.id }))}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${accountForm.typeId === t.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">색상</label>
                <div className="flex gap-2 flex-wrap">
                  {ACCOUNT_COLORS.map(c => (
                    <button key={c} onClick={() => setAccountForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${accountForm.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                {editAccountId && (
                  <button onClick={() => setDeleteAccountId(editAccountId)}
                    className="px-4 py-3 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
                    삭제
                  </button>
                )}
                <button onClick={handleSaveAccount}
                  className="flex-1 bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-colors">
                  {editAccountId ? '수정 완료' : '계좌 추가'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 종목 등록/수정 모달 (F-04 자동완성 포함) ──────────────────────────── */}
      {showInvestmentModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editInvestmentId ? '종목 수정' : '종목 추가'}</h2>
              <button onClick={() => setShowInvestmentModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              {investmentAccounts.length > 0 && (
                <div>
                  <label className="text-xs text-gray-400 block mb-1.5">소속 계좌</label>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setInvestmentForm(f => ({ ...f, accountId: undefined }))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${!investmentForm.accountId ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200'}`}>
                      미분류
                    </button>
                    {investmentAccounts.map(acc => (
                      <button key={acc.id} onClick={() => setInvestmentForm(f => ({ ...f, accountId: acc.id }))}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${investmentForm.accountId === acc.id ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200'}`}
                        style={investmentForm.accountId === acc.id ? { backgroundColor: acc.color } : {}}>
                        {getTypeLabel(acc.typeId).slice(0, 1)} {acc.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-1.5 flex-wrap">
                {(Object.entries(ASSET_TYPE_META) as [InvestmentAssetType, typeof ASSET_TYPE_META[InvestmentAssetType]][]).map(([type, meta]) => (
                  <button key={type} onClick={() => setInvestmentForm(f => ({ ...f, assetType: type }))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${investmentForm.assetType === type ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                    {meta.icon} {meta.label}
                  </button>
                ))}
              </div>
              {/* F-01: 국내·해외 통합 종목 자동완성 검색 */}
              <div className="relative">
                <div className="relative">
                  <input
                    ref={nameInputRef}
                    type="text"
                    placeholder="종목명 또는 티커 검색 *"
                    value={investmentForm.name}
                    onChange={e => {
                      const v = e.target.value
                      setInvestmentForm(f => ({ ...f, name: v }))
                      if (!v.trim()) {
                        setNameDropdownOpen(false)
                        setNaverResults([])
                      } else {
                        setNameDropdownOpen(true)
                        triggerNaverSearch(v)
                      }
                    }}
                    onFocus={() => setNameDropdownOpen(true)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                  />
                  {naverLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                {nameDropdownOpen && (naverResults.length > 0 || localSuggestions.length > 0) && (
                  <div ref={nameDropdownRef} className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                    {/* F-01: 네이버 금융 통합 검색 결과 (국내·해외) */}
                    {naverResults.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 bg-gray-50 border-b border-gray-100">
                          🔍 네이버 금융 검색 (국내·해외)
                        </div>
                        {naverResults.map((item, idx) => (
                          <button
                            key={`naver-${idx}`}
                            onMouseDown={e => {
                              e.preventDefault()
                              setInvestmentForm(f => ({
                                ...f,
                                name: item.name,
                                ticker: item.ticker,
                                ...(item.isForeign ? { currency: 'USD' } : {})
                              }))
                              setNaverResults([])
                              setNameDropdownOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 flex items-center justify-between gap-2">
                            <span className="text-gray-800 font-medium">{item.name}</span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-xs text-gray-400 tabular-nums">{item.ticker}</span>
                              <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">{item.market}</span>
                              {item.isForeign && (
                                <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">해외</span>
                              )}
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                    {/* 로컬 기존 종목 */}
                    {localSuggestions.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 bg-gray-50 border-b border-gray-100">
                          📁 등록된 종목
                        </div>
                        {localSuggestions.map((inv, idx) => (
                          <button
                            key={`local-${idx}`}
                            onMouseDown={e => {
                              e.preventDefault()
                              setInvestmentForm(f => ({
                                ...f,
                                name: inv.name,
                                ticker: inv.ticker,
                                currency: inv.currency,
                                assetType: inv.assetType,
                                exchange: inv.exchange,
                              }))
                              setNaverResults([])
                              setNameDropdownOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors border-b border-gray-50 last:border-0 flex items-center justify-between gap-2">
                            <span>{inv.name}</span>
                            {inv.ticker && <span className="text-xs text-gray-400 tabular-nums">{inv.ticker}</span>}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="티커 / 종목코드" value={investmentForm.ticker ?? ''}
                  onChange={e => setInvestmentForm(f => ({ ...f, ticker: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" placeholder="거래소 / 운용사" value={investmentForm.exchange ?? ''}
                  onChange={e => setInvestmentForm(f => ({ ...f, exchange: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">거래 통화</label>
                <div className="flex gap-1.5">
                  {CURRENCIES.map(c => (
                    <button key={c} onClick={() => setInvestmentForm(f => ({ ...f, currency: c }))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${investmentForm.currency === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {!editInvestmentId && initialBuy && (
                <div className="border border-blue-100 bg-blue-50/50 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-semibold text-blue-600">첫 매수 정보 입력</div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">매수일 <span className="text-gray-300">(선택)</span></span>
                      {initialBuy.date && (
                        <button
                          type="button"
                          onClick={() => setInitialBuy(b => b && ({ ...b, date: '' }))}
                          className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                        >
                          날짜 지우기 ×
                        </button>
                      )}
                    </div>
                    <input type="date" min="1900-01-01" max="2099-12-31" value={initialBuy.date}
                      onChange={e => setInitialBuy(b => b && ({ ...b, date: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">매수 수량 (주)</label>
                      <input type="text" inputMode="decimal" placeholder="0"
                        value={initialBuy.quantity}
                        onChange={e => setInitialBuy(b => b && ({ ...b, quantity: fmtDecimalInput(e.target.value) }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">매수 단가</label>
                      <input type="text" inputMode="decimal" placeholder="0"
                        value={initialBuy.price}
                        onChange={e => setInitialBuy(b => b && ({ ...b, price: fmtDecimalInput(e.target.value) }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">수수료 (선택)</label>
                    <input type="text" inputMode="decimal" placeholder="0"
                      value={initialBuy.fee}
                      onChange={e => setInitialBuy(b => b && ({ ...b, fee: fmtDecimalInput(e.target.value) }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setInitialBuyUsesCash(v => !v)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-sm transition-colors ${
                      initialBuyUsesCash
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-gray-50 border-gray-200 text-gray-500'
                    }`}>
                    <span className="text-xs font-medium">예수금 연동{!investmentForm.accountId && <span className="text-gray-400 font-normal ml-1">(계좌 선택 시 반영)</span>}</span>
                    <span className={`w-10 h-5 rounded-full flex items-center transition-colors px-0.5 ${initialBuyUsesCash ? 'bg-blue-500' : 'bg-gray-300'}`}>
                      <span className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${initialBuyUsesCash ? 'translate-x-5' : 'translate-x-0'}`} />
                    </span>
                  </button>
                  {initialBuy.quantity && initialBuy.price && (
                    <div className="text-xs text-blue-600 font-medium">
                      총 원금: {fmtKRW(Math.round(parseAmt(initialBuy.quantity) * parseAmt(initialBuy.price) + parseAmt(initialBuy.fee)))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                {editInvestmentId && (
                  <button onClick={() => setDeleteInvestmentId(editInvestmentId)}
                    className="px-4 py-3 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
                    삭제
                  </button>
                )}
                <button onClick={handleSaveInvestment}
                  disabled={isSaving || !investmentForm.name}
                  className="flex-1 bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSaving ? '저장 중...' : editInvestmentId ? '수정 완료' : '추가하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 거래 등록 모달 ────────────────────────────────────────────────── */}
      {showTradeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editTradeId ? '거래 수정' : '거래 등록'}</h2>
              <button onClick={() => { setShowTradeModal(false); setEditTradeId(null) }} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              {investmentAccounts.length > 0 && (
                <div>
                  <label className="text-xs text-gray-400 block mb-1">소속 계좌 (예수금 연동)</label>
                  <select
                    value={tradeModalAccountId ?? ''}
                    onChange={e => setTradeModalAccountId(e.target.value || undefined)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">계좌 미지정 (예수금 미연동)</option>
                    {investmentAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* 예수금 연동 토글 — 소속 계좌가 있을 때만 표시 */}
              {tradeModalAccountId && (
                <button
                  type="button"
                  onClick={() => setTradeUsesCash(v => !v)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                    tradeUsesCash
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}>
                  <span className="font-medium">{tradeForm.type === 'buy' ? '예수금 차감 연동' : '예수금 입금 연동'}</span>
                  <span className={`w-10 h-5 rounded-full flex items-center transition-colors px-0.5 ${tradeUsesCash ? 'bg-blue-500' : 'bg-gray-300'}`}>
                    <span className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${tradeUsesCash ? 'translate-x-5' : 'translate-x-0'}`} />
                  </span>
                </button>
              )}
              <div className="flex bg-gray-100 rounded-xl p-1">
                {(['buy','sell'] as const).map(type => (
                  <button key={type} onClick={() => setTradeForm(f => ({ ...f, type }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tradeForm.type === type ? (type === 'buy' ? 'bg-blue-600 text-white' : 'bg-red-500 text-white') : 'text-gray-500'}`}>
                    {type === 'buy' ? '매수' : '매도'}
                  </button>
                ))}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400">{tradeForm.type === 'buy' ? '매수일' : '매도일'} <span className="text-gray-300">(선택)</span></label>
                  {tradeForm.date && (
                    <button
                      type="button"
                      onClick={() => setTradeForm(f => ({ ...f, date: undefined }))}
                      className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                    >
                      {tradeForm.type === 'buy' ? '매수일' : '매도일'} 지우기 ×
                    </button>
                  )}
                </div>
                <input type="date" min="1900-01-01" max="2099-12-31" value={tradeForm.date ?? ''}
                  onChange={e => setTradeForm(f => ({ ...f, date: e.target.value || undefined }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">거래 수량 *</label>
                  <input type="text" inputMode="decimal" placeholder="0" value={tradeStr.quantity}
                    onChange={e => updateTradeInput('quantity', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">거래 단가 *</label>
                  <input type="text" inputMode="decimal" placeholder="0" value={tradeStr.price}
                    onChange={e => updateTradeInput('price', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {tradeForm.quantity > 0 && tradeForm.price > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 text-xs">
                  <span className="text-gray-500">거래금액: </span>
                  <span className="font-bold text-gray-900">{fmtKRW(Math.round(tradeForm.quantity * tradeForm.price))}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">수수료 (선택)</label>
                  <input type="text" inputMode="decimal" placeholder="0" value={tradeStr.fee}
                    onChange={e => updateTradeInput('fee', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">환율 (외화 시)</label>
                  <input type="text" inputMode="decimal" placeholder="예: 1,380" value={tradeStr.exchangeRate}
                    onChange={e => updateTradeInput('exchangeRate', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <input type="text" placeholder="메모 (선택)" value={tradeForm.note ?? ''}
                onChange={e => setTradeForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {/* 예수금 자동 반영 안내 */}
              {(() => {
                if (!tradeModalAccountId || !tradeForm.quantity || !tradeForm.price) return null
                const cashBal = cashBalanceMap.get(tradeModalAccountId) ?? 0
                const baseAmt = tradeForm.quantity * tradeForm.price
                const feeAmt = tradeForm.fee ?? 0
                const rate = tradeForm.currency !== 'KRW' ? (tradeForm.exchangeRate ?? 1) : 1
                const krwAmt = Math.round(baseAmt * rate)
                const depositAmt = tradeForm.type === 'buy' ? -(krwAmt + feeAmt) : (krwAmt - feeAmt)
                const afterBal = cashBal + depositAmt
                return (
                  <div className="rounded-xl p-3 bg-indigo-50 border border-indigo-100 text-xs text-gray-600 space-y-0.5">
                    <div className="font-medium text-indigo-700 mb-1">예수금 자동 반영</div>
                    <div>현재: <span className="font-semibold text-gray-700">{cashBal.toLocaleString('ko-KR')}원</span></div>
                    <div>
                      변동: <span className={`font-semibold ${depositAmt < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {depositAmt > 0 ? '+' : ''}{depositAmt.toLocaleString('ko-KR')}원
                      </span>
                      {' → '}등록 후: <span className={`font-semibold ${afterBal < 0 ? 'text-red-500' : 'text-gray-700'}`}>
                        {afterBal.toLocaleString('ko-KR')}원
                      </span>
                    </div>
                  </div>
                )
              })()}
              <button onClick={handleSaveTrade}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors">
                {editTradeId ? '수정 완료' : '거래 등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 배당금 입력 모달 ──────────────────────────────────────────────── */}
      {showDividendModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editDividendId ? '배당금 수정' : '배당금 입력'}</h2>
              <button onClick={() => { setShowDividendModal(false); setEditDividendId(null) }} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">계좌 *</label>
                <select
                  value={dividendAccountId ?? ''}
                  onChange={e => {
                    setDividendAccountId(e.target.value || null)
                    setDividendForm(f => ({ ...f, accountId: e.target.value, investmentId: undefined }))
                  }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                  <option value="">계좌 선택</option>
                  {investmentAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">배당 종목 (선택)</label>
                <select
                  value={dividendForm.investmentId ?? ''}
                  onChange={e => setDividendForm(f => ({ ...f, investmentId: e.target.value || undefined }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                  <option value="">선택 안함 (계좌 전체)</option>
                  {investments.filter(inv => inv.accountId === dividendAccountId).map(inv => (
                    <option key={inv.id} value={inv.id}>{inv.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">입금일 *</label>
                <input type="date" min="1900-01-01" max="2099-12-31" value={dividendForm.date}
                  onChange={e => setDividendForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">세전 배당금</label>
                  <input type="text" inputMode="numeric" placeholder="0" value={dividendStr.grossAmount}
                    onChange={e => {
                      const gross = parseAmt(e.target.value)
                      const tax = dividendForm.tax
                      const net = Math.max(0, gross - tax)
                      setDividendStr(s => ({ ...s, grossAmount: fmtInput(e.target.value), netAmount: fmtInput(String(net)) }))
                      setDividendForm(f => ({ ...f, grossAmount: gross, netAmount: net }))
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">원천징수세액</label>
                  <input type="text" inputMode="numeric" placeholder="0" value={dividendStr.tax}
                    onChange={e => {
                      const tax = parseAmt(e.target.value)
                      const net = Math.max(0, dividendForm.grossAmount - tax)
                      setDividendStr(s => ({ ...s, tax: fmtInput(e.target.value), netAmount: fmtInput(String(net)) }))
                      setDividendForm(f => ({ ...f, tax, netAmount: net }))
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">실수령액 (세후) *</label>
                <input type="text" inputMode="numeric" placeholder="0" value={dividendStr.netAmount}
                  onChange={e => {
                    setDividendStr(s => ({ ...s, netAmount: fmtInput(e.target.value) }))
                    setDividendForm(f => ({ ...f, netAmount: parseAmt(e.target.value) }))
                  }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <input type="text" placeholder="메모 (선택)" value={dividendForm.note ?? ''}
                onChange={e => setDividendForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              {dividendForm.netAmount > 0 && (
                <div className="bg-emerald-50 rounded-xl p-3 text-xs">
                  <span className="text-gray-500">실수령액: </span>
                  <span className="font-bold text-emerald-700">{fmtKRW(dividendForm.netAmount)}</span>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                {editDividendId && (
                  <button onClick={() => { setDeleteDividendId(editDividendId); setShowDividendModal(false) }}
                    className="px-4 py-3 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
                    삭제
                  </button>
                )}
                <button onClick={handleSaveDividend}
                  disabled={!dividendAccountId || !dividendForm.accountId || dividendForm.netAmount <= 0}
                  className="flex-1 bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {editDividendId ? '수정 완료' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 예수금 입금 모달 ─────────────────────────────────────────────────── */}
      {showDepositModal && depositAccountId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editDepositId ? '입금 내역 수정' : '예수금 입금'}</h2>
              <button onClick={() => { setShowDepositModal(false); setEditDepositId(null) }} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="bg-amber-50 rounded-xl px-3 py-2 text-xs text-amber-700 font-medium mb-3">
              {investmentAccounts.find(a => a.id === depositAccountId)?.name}
              <span className="ml-2 text-amber-500">현재 예수금 {fmtKRW(Math.round(cashBalanceMap.get(depositAccountId) ?? 0))}</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">입금일 *</label>
                <input type="date" min="1900-01-01" max="2099-12-31" value={depositDate} onChange={e => setDepositDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">금액 *</label>
                <input
                  type="text" inputMode="numeric"
                  placeholder="0"
                  value={depositAmount}
                  onChange={e => setDepositAmount(e.target.value.replace(/[^0-9]/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ','))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">메모</label>
                <input type="text" placeholder="메모 (선택)" value={depositNote}
                  onChange={e => setDepositNote(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <button
                onClick={handleSaveDeposit}
                disabled={!depositAmount || parseAmt(depositAmount) <= 0}
                className="w-full bg-amber-500 text-white font-semibold py-3 rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-40">
                {editDepositId ? '수정하기' : '입금 등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteAccountId && (
        <DeleteConfirmModal
          message="계좌를 삭제해도 종목은 삭제되지 않으며 미분류로 이동됩니다."
          onConfirm={() => handleDeleteAccount(deleteAccountId)}
          onCancel={() => setDeleteAccountId(null)}
        />
      )}
      {deleteInvestmentId && (
        <DeleteConfirmModal
          message="종목을 삭제하면 해당 종목의 모든 거래 이력도 함께 삭제됩니다."
          onConfirm={() => handleDeleteInvestment(deleteInvestmentId)}
          onCancel={() => setDeleteInvestmentId(null)}
        />
      )}
      {deleteTradeId && (
        <DeleteConfirmModal
          onConfirm={() => handleDeleteTrade(deleteTradeId)}
          onCancel={() => setDeleteTradeId(null)}
        />
      )}
      {deleteDividendId && (
        <DeleteConfirmModal
          message="배당금 기록을 삭제합니다."
          onConfirm={() => handleDeleteDividend(deleteDividendId)}
          onCancel={() => setDeleteDividendId(null)}
        />
      )}
      {deleteDepositId && (
        <DeleteConfirmModal
          message="예수금 입금 내역을 삭제합니다."
          onConfirm={() => handleDeleteDeposit(deleteDepositId)}
          onCancel={() => setDeleteDepositId(null)}
        />
      )}

      {/* ── ETF 구성 팝업 ─────────────────────────────────────────────────── */}
      {activeCompositionKey && (() => {
        const { ticker, name } = activeCompositionKey
        const rawItems = ticker ? compositionCache[ticker] : undefined
        // 비중 내림차순 정렬 (noRealPct는 순서 유지)
        const items = rawItems
          ? (rawItems[0]?.noRealPct ? rawItems : [...rawItems].sort((a, b) => b.pct - a.pct))
          : undefined
        const isLoading = ticker ? compositionLoading.has(ticker) : false
        const maxPct = items ? Math.max(...items.map(d => d.pct)) : 1
        return (
          <>
            {/* 팝업 카드 */}
            <div
              ref={compositionPopupRef}
              className="fixed z-[200] bg-white rounded-2xl shadow-xl p-3.5"
              style={{ top: compositionPopupPos.top, left: compositionPopupPos.left, width: 260, maxHeight: '80vh', overflowY: 'auto' }}
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="text-xs font-bold text-gray-800 truncate pr-2">{name} 구성</div>
                <button onClick={() => setActiveCompositionKey(null)} className="text-gray-300 hover:text-gray-500 text-sm shrink-0">✕</button>
              </div>
              {isLoading ? (
                <div className="text-xs text-gray-400 text-center py-4">불러오는 중…</div>
              ) : items && items.length > 0 ? (
                <div className="space-y-2">
                  {(() => {
                    // noRealPct: 비중 미공개 ETF (균등 배분 표시)
                    const noReal = (items[0] as { noRealPct?: boolean }).noRealPct
                    return (
                      <>
                        {noReal && (
                          <div className="text-[10px] text-amber-500 bg-amber-50 rounded-lg px-2 py-1 mb-1">
                            ⚠ 비중 미공개 — 종목 목록만 표시
                          </div>
                        )}
                        {items.map((item, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 whitespace-nowrap" style={{ minWidth: 'fit-content', maxWidth: 120 }}>{item.name}</span>
                            {!noReal && (
                              <>
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden" style={{ minWidth: 40 }}>
                                  <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(item.pct / maxPct * 100).toFixed(0)}%` }} />
                                </div>
                                <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{item.pct}%</span>
                              </>
                            )}
                          </div>
                        ))}
                        <div className="text-[10px] text-gray-400 text-right mt-1">네이버 금융 기준</div>
                      </>
                    )
                  })()}
                </div>
              ) : (
                <div className="text-xs text-gray-400 text-center py-4">구성 데이터를 불러올 수 없습니다</div>
              )}
            </div>
          </>
        )
      })()}
    </div>
  )
}
