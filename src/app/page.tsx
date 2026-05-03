'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useApp, getRealCategoryExpenses, computeAccountBalance } from '@/lib/AppContext'
import { Transaction } from '@/types'

// PRD: 위젯 순서 커스터마이징
type WidgetId = 'cash_accounts' | 'investment_accounts' | 'card_payment' | 'savings_summary' | 'budget' | 'goals' | 'transactions'
const DEFAULT_WIDGET_ORDER: WidgetId[] = ['cash_accounts', 'investment_accounts', 'card_payment', 'savings_summary', 'budget', 'goals', 'transactions']
const WIDGET_LABELS: Record<WidgetId, string> = {
  cash_accounts:       '현금성 자산',
  investment_accounts: '투자 자산',
  card_payment:        '카드 사용 현황',
  savings_summary:     '적금·예금 요약',
  budget:              '예산 현황',
  goals:               '재무 목표',
  transactions:        '거래 목록',
}

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function fmtShort(n: number) {
  if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(1) + '억원'
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(0) + '만원'
  return n.toLocaleString('ko-KR') + '원'
}
function fmtDate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

const today      = new Date()
const todayStr   = today.toISOString().slice(0, 10)                           // YYYY-MM-DD
const currentMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

// ── 날짜 헬퍼 ─────────────────────────────────────────────────────────────────
function addDays(d: string, n: number) {
  const dt = new Date(d); dt.setDate(dt.getDate() + n)
  return dt.toISOString().slice(0, 10)
}
function addMonths(m: string, n: number) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
function dayLabel(d: string) {
  const dt = new Date(d + 'T00:00:00')
  const dow = ['일','월','화','수','목','금','토'][dt.getDay()]
  return `${dt.getFullYear()}년 ${dt.getMonth()+1}월 ${dt.getDate()}일 (${dow})`
}
function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return `${y}년 ${mo}월`
}

// ── 통계 계산 (일/월 공통) ────────────────────────────────────────────────────
function calcStats(txs: Transaction[]) {
  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const refund  = txs.filter(t => t.type === 'refund').reduce((s, t) => s + t.amount, 0)
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const netExpense = Math.max(0, expense - refund)
  return { income, expense: netExpense, refund, balance: income - netExpense }
}

export default function Dashboard() {
  const { data, categories, setDashboardWidgetOrder } = useApp()
  const router = useRouter()
  const { accounts, transactions, goals, budgets, savings, cards, lastModified, isSetupComplete, categoryExcludeMonths, investments, investmentTrades } = data

  type ViewMode = 'day' | 'month'
  const [viewMode, setViewMode]       = useState<ViewMode>('day')
  const [selectedDay, setSelectedDay] = useState(todayStr)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)

  // PRD: 위젯 순서 커스터마이징 state
  const rawOrder = data.dashboardWidgetOrder ?? DEFAULT_WIDGET_ORDER
  // widgetOrder = visible widgets in stored order (not auto-appending — hidden means hidden)
  const widgetOrder = rawOrder.filter(id => DEFAULT_WIDGET_ORDER.includes(id as WidgetId)) as WidgetId[]
  const hiddenWidgets = DEFAULT_WIDGET_ORDER.filter(id => !widgetOrder.includes(id))
  const [editMode, setEditMode] = useState(false)
  const [draggingId, setDraggingId] = useState<WidgetId | null>(null)
  const [dragOverId, setDragOverId] = useState<WidgetId | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }

  function moveWidget(fromId: WidgetId, toId: WidgetId) {
    const next = [...widgetOrder]
    const from = next.indexOf(fromId)
    const to   = next.indexOf(toId)
    if (from === -1 || to === -1 || from === to) return
    next.splice(from, 1)
    next.splice(to, 0, fromId)
    setDashboardWidgetOrder(next)
    showToast('순서가 저장되었습니다.')
  }

  function moveWidgetByIndex(id: WidgetId, dir: -1 | 1) {
    const next = [...widgetOrder]
    const idx = next.indexOf(id)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= next.length) return
    ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
    setDashboardWidgetOrder(next)
    showToast('순서가 저장되었습니다.')
  }

  function resetWidgetOrder() {
    setDashboardWidgetOrder([...DEFAULT_WIDGET_ORDER])
    showToast('기본 순서로 되돌렸습니다.')
  }

  function addWidget(id: WidgetId) {
    setDashboardWidgetOrder([...widgetOrder, id])
    showToast(`${WIDGET_LABELS[id]} 위젯을 추가했어요.`)
  }

  function removeWidget(id: WidgetId) {
    setDashboardWidgetOrder(widgetOrder.filter(w => w !== id))
    showToast(`${WIDGET_LABELS[id]} 위젯을 숨겼어요.`)
  }

  // ── 알림 닫기 (localStorage 지속) ──────────────────────────────────────────
  const NOTIF_KEY = 'hb_dismissed_notifications'
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [showNotifHistory, setShowNotifHistory] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(NOTIF_KEY)
      if (stored) setDismissedIds(new Set(JSON.parse(stored) as string[]))
    } catch { /* ignore */ }
  }, [])

  const dismissNotif = useCallback((id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem(NOTIF_KEY, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [])

  const restoreNotif = useCallback((id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      try { localStorage.setItem(NOTIF_KEY, JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [])

  const isToday      = selectedDay === todayStr
  const isThisMonth  = selectedMonth === currentMonth

  // 초기 설정 미완료 시 온보딩으로
  if (!isSetupComplete) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-3xl mb-4">🌰</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">가계부에 오신 걸 환영해요!</h1>
        <p className="text-sm text-gray-500 mb-6">시작 전 현재 보유 금액을 설정해드릴게요.</p>
        <button onClick={() => router.push('/setup')}
          className="bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-2xl hover:bg-blue-700 transition-colors">
          기초값 설정하기
        </button>
        <button onClick={() => router.push('/setup')} className="mt-3 text-xs text-gray-400 underline">건너뛰기</button>
      </div>
    )
  }

  // ── 기간 필터링 ───────────────────────────────────────────────────────────
  const prefix    = viewMode === 'day' ? selectedDay : selectedMonth
  const periodTxs = transactions.filter(t => t.date.startsWith(prefix))
  const isSavingTx = (t: Transaction) => {
    const cat = categories.find(c => c.id === t.categoryId)
    if (!cat) return false
    if (cat.role === 'savings') return true
    if ((cat as { savingId?: string }).savingId) return true
    const parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
    return parent?.role === 'savings' === true
  }
  // 카드대금은 자동 제외 없음 — 수동 categoryExcludeMonths 토글 시에만 제외
  const periodTxsForStats = periodTxs
  const stats       = calcStats(periodTxsForStats)
  // 지출 구성 분리
  const savingAmt   = periodTxsForStats.filter(t => t.type === 'expense' && isSavingTx(t)).reduce((s, t) => s + t.amount, 0)
  const currentPeriodMonth = (viewMode === 'day' ? selectedDay : selectedMonth).slice(0, 7)
  const isExcludedByMonth = (t: Transaction) => {
    if (isSavingTx(t)) return false
    const cat = categories.find(c => c.id === t.categoryId)
    if (!cat) return false
    if ((categoryExcludeMonths[cat.id] ?? []).includes(currentPeriodMonth)) return true
    const parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
    return !!parent && (categoryExcludeMonths[parent.id] ?? []).includes(currentPeriodMonth)
  }
  const excludedAmt = periodTxsForStats.filter(t => t.type === 'expense' && isExcludedByMonth(t)).reduce((s, t) => s + t.amount, 0)
  const realConsumption = Math.max(0, stats.expense - savingAmt - excludedAmt)
  const catExpenses = getRealCategoryExpenses(transactions, categories, viewMode === 'day' ? selectedDay : selectedMonth, categoryExcludeMonths)

  // 거래 목록 (최신순, 최대 8개)
  const listTx = [...periodTxs]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 8)

  // FR-015: 날짜 선택 시 해당 날짜 기준 잔액 계산
  // 오늘(현재월)이면 전체 거래 반영, 과거 날짜면 해당 날짜까지의 거래만 반영
  const isHistoricalDay   = viewMode === 'day'   && !isToday
  const isHistoricalMonth = viewMode === 'month' && !isThisMonth

  // 계좌별 잔액 계산용 거래 필터
  const txsForBalance = (isHistoricalDay || isHistoricalMonth)
    ? transactions.filter(t => {
        if (isHistoricalDay)   return t.date <= selectedDay
        if (isHistoricalMonth) return t.date.slice(0,7) <= selectedMonth
        return true
      })
    : transactions

  const accountBalances = accounts.map(a => ({
    ...a,
    computed: computeAccountBalance(a.id, a.balance, txsForBalance),
  }))
  const totalBalance = accountBalances.reduce((s, a) => s + a.computed, 0)

  // 전일/전월 대비 계산
  const prevPeriodEnd = viewMode === 'day' ? addDays(selectedDay, -1) : addMonths(selectedMonth, -1)
  const txsForPrevBalance = viewMode === 'day'
    ? transactions.filter(t => t.date <= prevPeriodEnd)
    : transactions.filter(t => t.date.slice(0, 7) <= prevPeriodEnd)
  const prevAccountBalances = accounts.map(a => ({
    id: a.id,
    computed: computeAccountBalance(a.id, a.balance, txsForPrevBalance),
  }))

  // 예산 — 월 기준
  const budgetMonth  = viewMode === 'day' ? selectedDay.slice(0, 7) : selectedMonth
  const totalBudget  = budgets.filter(b => b.month === budgetMonth).reduce((s, b) => s + b.amount, 0)
  // 실소비 예산: savings/card_payment/제외 카테고리 제외 (예산탭 totalBudgetReal 기준과 동일)
  const totalBudgetReal = budgets
    .filter(b => b.month === budgetMonth)
    .reduce((s, b) => {
      const cat = categories.find(c => c.id === b.categoryId)
      if (!cat || cat.parentId === null) return s
      if (cat.role === 'savings' || cat.role === 'card_payment') return s
      if ((categoryExcludeMonths[cat.id] ?? []).includes(budgetMonth)) return s
      const parent = categories.find(c => c.id === cat.parentId)
      if (parent?.role === 'savings' || parent?.role === 'card_payment') return s
      if (parent && (categoryExcludeMonths[parent.id] ?? []).includes(budgetMonth)) return s
      return s + b.amount
    }, 0)
  const budgetUsed   = Object.values(getRealCategoryExpenses(transactions, categories, budgetMonth, categoryExcludeMonths)).reduce((s, v) => s + v, 0)
  const budgetPct    = totalBudgetReal > 0 ? Math.min((budgetUsed / totalBudgetReal) * 100, 100) : 0
  const budgetLeft   = totalBudgetReal - budgetUsed

  // ── 적금·예금 요약 ──────────────────────────────────────────────────────────
  const savingsSummary = useMemo(() => {
    let totalPrincipal = 0
    let totalExpected = 0
    let totalInterest = 0
    for (const s of savings) {
      const linkedPaid = transactions
        .filter(t => t.savingLinks?.some(l => l.savingId === s.id))
        .reduce((acc, t) => acc + (t.savingLinks?.find(l => l.savingId === s.id)?.amount ?? 0), 0)
      const principal = (s.currentAmount ?? 0) + linkedPaid
      totalPrincipal += principal
      totalExpected  += s.expectedAmount ?? 0
      totalInterest  += Math.max(0, (s.expectedAmount ?? 0) - principal)
    }
    return { totalPrincipal, totalExpected, totalInterest, count: savings.length }
  }, [savings, transactions])

  // 투자 보유 내역 (종목별 qty·평가금액·손익) — 위젯 + 총평가금액 공유
  const investmentHoldings = useMemo(() => {
    const holdingsMap = new Map<string, { qty: number; buyAmt: number }>()
    investments.forEach(inv => holdingsMap.set(inv.id, { qty: 0, buyAmt: 0 }))
    ;[...investmentTrades]
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(trade => {
        const h = holdingsMap.get(trade.investmentId)
        if (!h) return
        if (trade.type === 'buy') {
          h.qty += trade.quantity
          h.buyAmt += trade.quantity * trade.price
        } else {
          const avgCost = h.qty > 0 ? h.buyAmt / h.qty : 0
          h.qty = Math.max(0, h.qty - trade.quantity)
          h.buyAmt = h.qty * avgCost
        }
      })
    return investments
      .map(inv => {
        const h = holdingsMap.get(inv.id)!
        const holdingQty = h?.qty ?? 0
        const buyAmt     = h?.buyAmt ?? 0
        const evalAmount = holdingQty > 0 && inv.currentPrice ? holdingQty * inv.currentPrice : 0
        const gain       = evalAmount > 0 ? evalAmount - buyAmt : 0
        const gainRate   = buyAmt > 0 && evalAmount > 0 ? (gain / buyAmt) * 100 : 0
        return { ...inv, holdingQty, buyAmt, evalAmount, gain, gainRate }
      })
      .filter(inv => inv.holdingQty > 0)
  }, [investments, investmentTrades])

  // PRD 3-1: 투자 탭 총 평가금액
  const investmentTotalEval = useMemo(
    () => investmentHoldings.reduce((s, inv) => s + inv.evalAmount, 0),
    [investmentHoldings]
  )

  // PRD 3-1: 자산 유형별 요약
  const assetSummary = useMemo(() => {
    const cashBalance       = accountBalances.filter(a => (a.assetType ?? 'cash') === 'cash').reduce((s, a) => s + a.computed, 0)
    const savingsPrincipal  = savingsSummary.totalPrincipal
    const totalAssets       = cashBalance + savingsPrincipal + investmentTotalEval
    const investUpdatedAt   = investments.reduce<string | null>((latest, inv) => {
      if (!inv.currentPriceUpdatedAt) return latest
      if (!latest || inv.currentPriceUpdatedAt > latest) return inv.currentPriceUpdatedAt
      return latest
    }, null)
    return { cashBalance, savingsPrincipal, investmentTotalEval, totalAssets, investUpdatedAt }
  }, [accountBalances, savingsSummary.totalPrincipal, investmentTotalEval, investments])

  // ── 통합 알림: 연회비 (60일 이내) + 적금 만기 (30일 이내) ──────────────────
  type NotifType = 'annual_fee' | 'savings_maturity'
  type NotifItem = {
    id: string
    type: NotifType
    title: string
    subtitle: string
    daysUntil: number
    accentColor: string
    dueDate: Date
  }

  const allNotifications = useMemo<NotifItem[]>(() => {
    const now = new Date()
    const items: NotifItem[] = []

    // 연회비 알림 (60일 이내)
    cards
      .filter(c => c.annualFeeAmount && c.annualFeeDate)
      .forEach(c => {
        const [mm, dd] = c.annualFeeDate!.split('-').map(Number)
        const thisYear = new Date(now.getFullYear(), mm - 1, dd)
        const nextYear = new Date(now.getFullYear() + 1, mm - 1, dd)
        const dueDate  = thisYear >= now ? thisYear : nextYear
        const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (daysUntil > 60) return
        items.push({
          id: `annual-fee-${c.id}-${dueDate.getFullYear()}`,
          type: 'annual_fee',
          title: `${c.name} 연회비 납부 예정`,
          subtitle: `${dueDate.getFullYear()}년 ${dueDate.getMonth()+1}월 ${dueDate.getDate()}일 · ${fmtKRW(c.annualFeeAmount!)}`,
          daysUntil,
          accentColor: c.color,
          dueDate,
        })
      })

    // 적금·예금 만기 알림 (30일 이내)
    savings.forEach(s => {
      if (s.type === 'subscription') return  // 청약은 만기 없음
      const maturity = new Date(s.maturityDate + 'T00:00:00')
      const daysUntil = Math.ceil((maturity.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntil < 0 || daysUntil > 30) return
      const typeLabel = s.type === 'saving' ? '적금' : s.type === 'deposit' ? '예금' : '청약'
      items.push({
        id: `saving-maturity-${s.id}`,
        type: 'savings_maturity',
        title: `${s.name} 만기 도래`,
        subtitle: `${s.maturityDate} · ${typeLabel} · 만기수령 예상 ${fmtKRW(s.expectedAmount)}`,
        daysUntil,
        accentColor: '#10B981',
        dueDate: maturity,
      })
    })

    return items.sort((a, b) => a.daysUntil - b.daysUntil)
  }, [cards, savings])

  const activeNotifs    = allNotifications.filter(n => !dismissedIds.has(n.id))
  const dismissedNotifs = allNotifications.filter(n =>  dismissedIds.has(n.id))

  // ── 라벨 ─────────────────────────────────────────────────────────────────
  const periodLabel = viewMode === 'day' ? dayLabel(selectedDay) : monthLabel(selectedMonth)
  const isNow       = viewMode === 'day' ? isToday : isThisMonth

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">안녕하세요 👋</h1>
          {lastModified && (
            <p className="text-xs text-gray-400 mt-0.5">마지막 수정 {fmtDate(lastModified)}</p>
          )}
        </div>
        <Link href="/transactions"
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">
          + 거래 추가
        </Link>
      </div>

      {/* ── 통합 알림 배너 (연회비 + 적금 만기) ─────────────────────────────── */}
      {(activeNotifs.length > 0 || dismissedNotifs.length > 0) && (
        <div className="mb-4">
          {/* 활성 알림 */}
          {activeNotifs.length > 0 && (
            <div className="space-y-2 mb-2">
              {activeNotifs.map(n => {
                const isUrgent  = n.daysUntil <= 7
                const isWarning = n.daysUntil <= 14
                const bg    = isUrgent ? 'bg-red-50 border-red-200' : isWarning ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'
                const txt   = isUrgent ? 'text-red-700'              : isWarning ? 'text-amber-700'               : 'text-blue-700'
                const badge = isUrgent ? 'bg-red-100 text-red-600'   : isWarning ? 'bg-amber-100 text-amber-700'  : 'bg-blue-100 text-blue-600'
                const icon  = n.type === 'annual_fee' ? '💳' : '🏦'
                return (
                  <div key={n.id} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${bg}`}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ backgroundColor: n.accentColor + '22' }}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-semibold ${txt}`}>{n.title}</div>
                      <div className={`text-xs mt-0.5 ${txt} opacity-75`}>{n.subtitle}</div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 ${badge}`}>
                      D-{n.daysUntil}
                    </span>
                    <button
                      onClick={() => dismissNotif(n.id)}
                      className="text-gray-300 hover:text-gray-500 text-lg leading-none flex-shrink-0 transition-colors"
                      title="알림 닫기">×</button>
                  </div>
                )
              })}
            </div>
          )}

          {/* 알림 내역 버튼 */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowNotifHistory(true)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors py-1 px-2 rounded-lg hover:bg-gray-100">
              🔔 알림 내역
              {activeNotifs.length > 0 && (
                <span className="bg-blue-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {activeNotifs.length}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── 알림 내역 모달 ────────────────────────────────────────────────────── */}
      {showNotifHistory && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4" onClick={() => setShowNotifHistory(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-base">🔔</span>
                <h2 className="text-base font-bold text-gray-900">알림 내역</h2>
              </div>
              <button onClick={() => setShowNotifHistory(false)} className="text-gray-400 text-xl leading-none hover:text-gray-600">×</button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {allNotifications.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <div className="text-3xl mb-2">🔕</div>
                  <p className="text-sm">알림이 없어요</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {allNotifications.map(n => {
                    const isDismissed = dismissedIds.has(n.id)
                    const icon = n.type === 'annual_fee' ? '💳' : '🏦'
                    const urgencyLabel = n.daysUntil <= 7 ? 'text-red-500' : n.daysUntil <= 14 ? 'text-amber-500' : 'text-blue-500'
                    return (
                      <div key={n.id} className={`flex items-start gap-3 px-5 py-4 ${isDismissed ? 'opacity-40' : ''}`}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0 bg-gray-100">
                          {icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-gray-800">{n.title}</span>
                            {isDismissed && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">닫음</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{n.subtitle}</div>
                          <div className={`text-xs font-semibold mt-1 ${urgencyLabel}`}>D-{n.daysUntil}</div>
                        </div>
                        {isDismissed ? (
                          <button
                            onClick={() => restoreNotif(n.id)}
                            className="text-xs text-blue-500 hover:text-blue-700 font-medium flex-shrink-0 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                            복원
                          </button>
                        ) : (
                          <button
                            onClick={() => dismissNotif(n.id)}
                            className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
                            닫기
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 일/월 토글 + 네비게이터 */}
      <div className="bg-white rounded-2xl shadow-sm p-3 mb-4 flex items-center gap-3">
        {/* 토글 */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1 flex-shrink-0">
          {(['day','month'] as ViewMode[]).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'
              }`}>
              {m === 'day' ? '일별' : '월별'}
            </button>
          ))}
        </div>

        {/* 네비게이터 */}
        <div className="flex items-center gap-1 flex-1 justify-center">
          <button
            onClick={() => viewMode === 'day'
              ? setSelectedDay(addDays(selectedDay, -1))
              : setSelectedMonth(addMonths(selectedMonth, -1))
            }
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg transition-colors">
            ‹
          </button>

          <div className="flex items-center gap-1.5">
            {viewMode === 'day' ? (
              <input type="date" value={selectedDay} max={todayStr}
                onChange={e => setSelectedDay(e.target.value)}
                className="text-sm font-semibold text-gray-800 border-none outline-none bg-transparent text-center cursor-pointer" />
            ) : (
              <input type="month" value={selectedMonth} max={currentMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="text-sm font-semibold text-gray-800 border-none outline-none bg-transparent text-center cursor-pointer" />
            )}
          </div>

          <button
            onClick={() => viewMode === 'day'
              ? setSelectedDay(addDays(selectedDay, 1))
              : setSelectedMonth(addMonths(selectedMonth, 1))
            }
            disabled={isNow}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg transition-colors disabled:opacity-25 disabled:cursor-not-allowed">
            ›
          </button>
        </div>

        {/* 오늘/이번달로 */}
        {!isNow && (
          <button
            onClick={() => viewMode === 'day' ? setSelectedDay(todayStr) : setSelectedMonth(currentMonth)}
            className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap flex-shrink-0">
            {viewMode === 'day' ? '오늘' : '이번달'}
          </button>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="bg-blue-600 rounded-2xl p-5 mb-4 text-white">
        <div className="text-xs font-medium opacity-70 mb-3">{periodLabel} 현황</div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/10 rounded-xl p-3">
            <div className="text-xs opacity-70 mb-1">수입</div>
            <div className="text-base font-bold tabular-nums leading-tight">
              +{fmtShort(stats.income)}
            </div>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <div className="text-xs opacity-70 mb-1 flex items-center gap-1">
              지출
              {stats.refund > 0 && <span className="opacity-60 text-xs">-환급</span>}
            </div>
            <div className="text-base font-bold tabular-nums leading-tight">
              -{fmtShort(stats.expense)}
            </div>
            {stats.refund > 0 && (
              <div className="text-xs opacity-60 mt-0.5">↩ {fmtShort(stats.refund)}</div>
            )}
          </div>
          <div className={`rounded-xl p-3 ${stats.balance >= 0 ? 'bg-emerald-400/30' : 'bg-red-400/30'}`}>
            <div className="text-xs opacity-70 mb-1">순수입</div>
            <div className="text-base font-bold tabular-nums leading-tight">
              {stats.balance >= 0 ? '+' : ''}{fmtShort(stats.balance)}
            </div>
          </div>
        </div>

        {/* 지출 구성: 실소비 / 저축 / 제외항목 */}
        {(savingAmt > 0 || excludedAmt > 0) && (
          <div className="mt-3 pt-3 border-t border-white/20">
            <div className="text-[10px] opacity-60 mb-2">지출 구성</div>
            <div className={`grid gap-2 ${excludedAmt > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {[
                { label: '실소비',   value: realConsumption, color: 'bg-red-300/30' },
                { label: '저축',     value: savingAmt,       color: 'bg-blue-300/30' },
                ...(excludedAmt > 0 ? [{ label: '제외항목', value: excludedAmt, color: 'bg-purple-300/30' }] : []),
              ].map(item => (
                <div key={item.label} className={`${item.color} rounded-xl p-2 text-center`}>
                  <div className="text-[10px] opacity-70 mb-0.5">{item.label}</div>
                  <div className="text-xs font-bold tabular-nums leading-tight">{fmtShort(item.value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 오늘 기준 자산 — 계좌잔액/예적금/투자/총잔액 breakdown */}
        <div className="mt-4 pt-3 border-t border-white/20">
          <div className="text-[10px] opacity-60 mb-2 uppercase tracking-wide">
            {isHistoricalDay
              ? `${selectedDay} 기준 자산`
              : isHistoricalMonth
              ? `${selectedMonth} 기준 자산`
              : '오늘 기준 자산'}
          </div>
          <div className="space-y-1.5">
            <Link href="/accounts" className="flex items-center justify-between hover:opacity-75 transition-opacity">
              <span className="text-xs opacity-80">💵 계좌잔액</span>
              <span className="text-sm font-semibold tabular-nums">{fmtShort(assetSummary.cashBalance)}</span>
            </Link>
            <Link href="/savings" className="flex items-center justify-between hover:opacity-75 transition-opacity">
              <span className="text-xs opacity-80">🏦 예적금 총액 <span className="opacity-60 text-[10px]">(납입원금)</span></span>
              <span className="text-sm font-semibold tabular-nums">{fmtShort(assetSummary.savingsPrincipal)}</span>
            </Link>
            <Link href="/investments" className="flex items-center justify-between hover:opacity-75 transition-opacity">
              <span className="text-xs opacity-80">📈 투자잔액 <span className="opacity-60 text-[10px]">(평가금액)</span></span>
              <span className="text-sm font-semibold tabular-nums">{fmtShort(assetSummary.investmentTotalEval)}</span>
            </Link>
            <div className="flex items-center justify-between pt-1.5 border-t border-white/20">
              <span className="text-xs font-bold">총 잔액</span>
              <span className="text-lg font-bold tabular-nums">{fmtKRW(assetSummary.totalAssets)}</span>
            </div>
          </div>
        </div>
      </div>


      {/* PRD 2.1: 이달 비소비 항목 별도 카드 */}
      {viewMode === 'month' && (savingAmt > 0 || excludedAmt > 0) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="text-xs font-semibold text-gray-500 mb-3">이달 비소비 항목 합계</div>
          <div className={`grid gap-3 ${excludedAmt > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div className="bg-teal-50 rounded-xl p-3">
              <div className="text-xs text-teal-600 mb-0.5">적금·예금 이체</div>
              <div className="text-base font-bold text-teal-700">{fmtKRW(savingAmt)}</div>
              <div className="text-xs text-teal-400 mt-0.5">저축성 지출 (실소비 제외)</div>
            </div>
            {excludedAmt > 0 && (
              <div className="bg-purple-50 rounded-xl p-3">
                <div className="text-xs text-purple-600 mb-0.5">제외 항목</div>
                <div className="text-base font-bold text-purple-700">{fmtKRW(excludedAmt)}</div>
                <div className="text-xs text-purple-400 mt-0.5">예산탭에서 제외 설정</div>
              </div>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">이달 실소비</span>
            <span className="text-sm font-bold text-red-600">{fmtKRW(realConsumption)}</span>
          </div>
        </div>
      )}


      {/* 위젯 편집 바 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 font-medium">위젯 영역</span>
        <div className="flex items-center gap-2">
          {editMode && (
            <button onClick={resetWidgetOrder}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
              초기화
            </button>
          )}
          <button
            onClick={() => setEditMode(prev => !prev)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl transition-colors ${
              editMode ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {editMode ? '✓ 완료' : '위젯 편집'}
          </button>
        </div>
      </div>

      {/* PRD 3-2: 위젯 드래그앤드롭 컨테이너 */}
      <div className="space-y-4">
        {widgetOrder.map((widgetId, idx) => {
          const isDragging = draggingId === widgetId
          const isDragOver = dragOverId === widgetId

          const widgetContent = (() => {
            // ── 현금성 자산 위젯 ────────────────────────────────────────
            if (widgetId === 'cash_accounts') {
              const sectionAccounts = accountBalances.filter(a => (a.assetType ?? 'cash') === 'cash')
              if (sectionAccounts.length === 0 && !editMode) return null
              const subtotal = sectionAccounts.reduce((s, a) => s + a.computed, 0)
              return (
                <div className="mb-0">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">💵</span>
                      <span className="text-xs font-bold text-gray-500">현금성 자산</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-blue-600">{fmtKRW(subtotal)}</span>
                      <Link href="/accounts" className="text-xs text-blue-500 hover:text-blue-700">관리 →</Link>
                    </div>
                  </div>
                  {sectionAccounts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {sectionAccounts.map(acc => {
                        const prevBal = prevAccountBalances.find(p => p.id === acc.id)?.computed ?? acc.computed
                        const diff = acc.computed - prevBal
                        return (
                          <div key={acc.id} className="bg-white rounded-2xl p-4 shadow-sm" style={{ borderTop: `3px solid ${acc.color}` }}>
                            <div className="mb-2">
                              {acc.bank && <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{acc.bank}</div>}
                              <div className="text-xs text-gray-700 font-medium">{acc.name}</div>
                              {acc.memo && <div className="text-[10px] text-gray-400 mt-0.5">{acc.memo}</div>}
                            </div>
                            <div className="text-xl font-bold text-gray-900 tabular-nums">{acc.computed.toLocaleString('ko-KR')}원</div>
                            {diff !== 0 && (
                              <div className={`text-xs mt-1 font-medium ${diff >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                {viewMode === 'day' ? '전일 대비' : '전월 대비'} {diff >= 0 ? '+' : ''}{diff.toLocaleString('ko-KR')}원
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl p-4 shadow-sm text-center text-xs text-gray-400 py-6">
                      현금성 계좌가 없어요
                      <Link href="/accounts" className="block text-blue-500 underline mt-1">계좌 추가하기</Link>
                    </div>
                  )}
                </div>
              )
            }

            // ── 투자 자산 위젯 (투자 탭 종목 보유 내역 기반) ────────────
            if (widgetId === 'investment_accounts') {
              if (investmentHoldings.length === 0 && !editMode) return null
              const totalEval = investmentHoldings.reduce((s, inv) => s + inv.evalAmount, 0)
              const totalBuy  = investmentHoldings.reduce((s, inv) => s + inv.buyAmt,     0)
              const totalGain = totalEval - totalBuy
              const totalGainRate = totalBuy > 0 ? (totalGain / totalBuy) * 100 : 0
              const updatedAt = investments.reduce<string | null>((latest, inv) => {
                if (!inv.currentPriceUpdatedAt) return latest
                return !latest || inv.currentPriceUpdatedAt > latest ? inv.currentPriceUpdatedAt : latest
              }, null)
              return (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  {/* 헤더 */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">📈</span>
                      <span className="text-sm font-bold text-gray-700">투자 자산</span>
                    </div>
                    <Link href="/investments" className="text-xs text-blue-600">자세히 →</Link>
                  </div>
                  {investmentHoldings.length > 0 ? (
                    <>
                      {/* 종목 목록 */}
                      <div className="divide-y divide-gray-50">
                        {investmentHoldings.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-gray-800 truncate">{inv.name}</span>
                                {inv.ticker && (
                                  <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">{inv.ticker}</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {inv.holdingQty.toLocaleString('ko-KR')}주
                                {inv.currentPrice
                                  ? ` · ${fmtKRW(inv.currentPrice)}`
                                  : ' · 현재가 미설정'}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <div className="text-sm font-bold text-gray-900 tabular-nums">
                                {inv.evalAmount > 0 ? fmtShort(inv.evalAmount) : '-'}
                              </div>
                              {inv.evalAmount > 0 && (
                                <div className={`text-xs font-medium tabular-nums ${inv.gain >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                  {inv.gain >= 0 ? '+' : ''}{fmtShort(inv.gain)}
                                  <span className="opacity-70 ml-1">({inv.gainRate >= 0 ? '+' : ''}{inv.gainRate.toFixed(1)}%)</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* 합계 */}
                      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs text-gray-500 font-medium">총 평가금액</div>
                            {updatedAt && (
                              <div className="text-[10px] text-gray-400 mt-0.5">{fmtDate(updatedAt)} 기준</div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-base font-bold text-gray-900 tabular-nums">{fmtKRW(totalEval)}</div>
                            {totalBuy > 0 && (
                              <div className={`text-xs font-medium tabular-nums ${totalGain >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                {totalGain >= 0 ? '+' : ''}{fmtShort(totalGain)}
                                <span className="opacity-70 ml-1">({totalGainRate >= 0 ? '+' : ''}{totalGainRate.toFixed(1)}%)</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <div className="text-2xl mb-2">📊</div>
                      <p className="text-xs">보유 종목이 없어요</p>
                      <Link href="/investments" className="text-xs text-blue-500 underline mt-1 block">투자 내역 추가하기</Link>
                    </div>
                  )}
                </div>
              )
            }

            if (widgetId === 'card_payment') {
              const isCardPayCat = (catId: string) => categories.find(c => c.id === catId)?.role === 'card_payment'
              const paidBillingMonths = new Set<string>(
                transactions
                  .filter(t => isCardPayCat(t.categoryId))
                  .map(t => {
                    if (t.billingMonth) return t.billingMonth
                    const [y, m] = t.date.slice(0, 7).split('-').map(Number)
                    const d = new Date(y, m - 2, 1)
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                  })
              )
              const byMonth: Record<string, number> = {}
              transactions
                .filter(t => t.paymentMethod === 'card' && (t.type === 'expense' || t.type === 'refund'))
                .forEach(t => {
                  const m = t.date.slice(0, 7)
                  byMonth[m] = (byMonth[m] || 0) + (t.type === 'refund' ? -t.amount : t.amount)
                })
              const monthRows = Object.entries(byMonth)
                .map(([m, v]) => ({ month: m, total: Math.max(0, v), isPaid: paidBillingMonths.has(m) }))
                .filter(r => r.total > 0)
                .sort((a, b) => b.month.localeCompare(a.month))
                .slice(0, 6)
              if (monthRows.length === 0 && !editMode) return null
              const totalUnpaid = monthRows.filter(r => !r.isPaid).reduce((s, r) => s + r.total, 0)
              return (
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">💳</span>
                      <span className="text-sm font-bold text-gray-700">카드 사용 현황</span>
                    </div>
                    <Link href="/budget" className="text-xs text-blue-600">자세히 →</Link>
                  </div>
                  {monthRows.length > 0 ? (
                    <>
                      <div className="space-y-2">
                        {monthRows.map(row => {
                          const mo = parseInt(row.month.split('-')[1])
                          return (
                            <div key={row.month} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 w-7 font-medium">{mo}월</span>
                                {row.isPaid
                                  ? <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">✓ 납부완료</span>
                                  : <span className="text-[10px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full font-medium">미납</span>
                                }
                              </div>
                              <span className={`text-sm font-semibold tabular-nums ${row.isPaid ? 'text-gray-400 line-through decoration-gray-300' : 'text-red-500'}`}>
                                {fmtKRW(row.total)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-xs text-gray-500 font-medium">미납 합계</span>
                        {totalUnpaid > 0
                          ? <span className="text-base font-bold text-red-500 tabular-nums">-{fmtKRW(totalUnpaid)}</span>
                          : <span className="text-sm font-bold text-emerald-600">✓ 전체 납부완료</span>
                        }
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-4">카드 사용 내역이 없어요</p>
                  )}
                </div>
              )
            }

            if (widgetId === 'savings_summary') {
              if (savingsSummary.count === 0 && !editMode) return null
              return (
                <div className="bg-white rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">🏦</span>
                      <span className="font-semibold text-gray-900 text-sm">적금·예금</span>
                      {savingsSummary.count > 0 && <span className="text-xs text-gray-400">{savingsSummary.count}건</span>}
                    </div>
                    <Link href="/savings" className="text-xs text-blue-600">자세히 →</Link>
                  </div>
                  {savingsSummary.count > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-gray-50 rounded-xl p-3">
                        <div className="text-xs text-gray-400 mb-1">납입원금</div>
                        <div className="text-sm font-bold text-gray-900 tabular-nums">{fmtShort(savingsSummary.totalPrincipal)}</div>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-3">
                        <div className="text-xs text-emerald-600 mb-1">예상이자</div>
                        <div className="text-sm font-bold text-emerald-700 tabular-nums">+{fmtShort(savingsSummary.totalInterest)}</div>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3">
                        <div className="text-xs text-blue-600 mb-1">만기수령액</div>
                        <div className="text-sm font-bold text-blue-700 tabular-nums">{fmtShort(savingsSummary.totalExpected)}</div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-4">등록된 적금·예금이 없어요</p>
                  )}
                </div>
              )
            }

            if (widgetId === 'budget') {
              return (
                <div className="bg-white rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-gray-900 text-sm">{monthLabel(budgetMonth)} 예산</div>
                    <Link href="/budget" className="text-xs text-blue-600">자세히 →</Link>
                  </div>
                  {totalBudgetReal > 0 ? (
                    <>
                      <div className="flex justify-between text-xs text-gray-500 mb-2">
                        <span>사용 {fmtShort(budgetUsed)}</span>
                        <span>예산 {fmtShort(totalBudgetReal)}</span>
                      </div>
                      <div className="bg-gray-100 rounded-full h-2 mb-2">
                        <div className={`h-2 rounded-full transition-all ${budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-amber-400' : 'bg-blue-500'}`}
                          style={{ width: `${budgetPct}%` }} />
                      </div>
                      <div className="text-xs text-gray-500">
                        {budgetPct.toFixed(0)}% 사용
                        <span className={`ml-2 font-medium ${budgetLeft < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                          {budgetLeft >= 0 ? `남은 예산 ${fmtShort(budgetLeft)}` : `초과 ${fmtShort(-budgetLeft)}`}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-xs text-gray-400 mb-2">예산이 설정되지 않았어요</p>
                      <Link href="/budget" className="text-xs text-blue-500 underline">예산 설정하기</Link>
                    </div>
                  )}
                </div>
              )
            }

            if (widgetId === 'goals') {
              return (
                <div className="bg-white rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-semibold text-gray-900 text-sm">재무 목표</div>
                    <Link href="/goals" className="text-xs text-blue-600">자세히 →</Link>
                  </div>
                  {goals.length > 0 ? goals.slice(0, 2).map(goal => {
                    const pct = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
                    const dday = Math.ceil((new Date(goal.deadline).getTime() - today.getTime()) / (1000*60*60*24))
                    return (
                      <div key={goal.id} className="mb-3 last:mb-0">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-gray-700">{goal.name}</span>
                          <span className="text-gray-400">{dday > 0 ? `D-${dday}` : 'D-Day'}</span>
                        </div>
                        <div className="bg-gray-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
                        </div>
                        <div className="text-right text-xs text-gray-400 mt-0.5">{pct.toFixed(1)}%</div>
                      </div>
                    )
                  }) : (
                    <div className="text-center py-4">
                      <p className="text-xs text-gray-400 mb-2">등록된 목표가 없어요</p>
                      <Link href="/goals" className="text-xs text-blue-500 underline">목표 추가하기</Link>
                    </div>
                  )}
                </div>
              )
            }

            if (widgetId === 'transactions') {
              return (
                <div className="bg-white rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="font-semibold text-gray-900 text-sm">
                      {isNow && viewMode === 'day' ? '오늘 거래' : `${periodLabel} 거래`}
                    </div>
                    <Link href="/transactions" className="text-xs text-blue-600">전체보기 →</Link>
                  </div>
                  {listTx.length > 0 ? (
                    <div className="space-y-3">
                      {listTx.map(t => {
                        const cat      = categories.find(c => c.id === t.categoryId)
                        const acc      = accounts.find(a => a.id === t.accountId)
                        const toAcc    = accounts.find(a => a.id === t.toAccountId)
                        const isTransfer = t.type === 'transfer'
                        const isRefund   = t.type === 'refund'
                        return (
                          <div key={t.id} className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${
                                isTransfer ? 'bg-blue-50' : isRefund ? 'bg-purple-50' : 'bg-gray-50'
                              }`}>
                                {isTransfer ? '↔️' : isRefund ? '↩️' : cat?.icon}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-medium text-gray-900 truncate">{t.description}</span>
                                  {isRefund && <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-md font-medium flex-shrink-0">환급</span>}
                                </div>
                                <div className="text-xs text-gray-400 truncate">
                                  {t.date}{isTransfer ? ` · ${acc?.name} → ${toAcc?.name}` : ` · ${acc?.name}`}
                                </div>
                              </div>
                            </div>
                            <div className={`text-sm font-semibold tabular-nums flex-shrink-0 ml-2 ${
                              isTransfer ? 'text-blue-500' :
                              isRefund   ? 'text-purple-600' :
                              t.type === 'income' ? 'text-emerald-600' : 'text-red-500'
                            }`}>
                              {isTransfer ? '' : (t.type === 'income' || isRefund) ? '+' : '-'}{fmtKRW(t.amount)}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <div className="text-3xl mb-2">📭</div>
                      <p className="text-sm">
                        {viewMode === 'day' && isToday ? '오늘 거래 내역이 없어요' : `${periodLabel} 거래 내역이 없어요`}
                      </p>
                      <Link href="/transactions" className="text-xs text-blue-500 underline mt-1 block">거래 추가하기</Link>
                    </div>
                  )}
                </div>
              )
            }

            return null
          })()

          if (!widgetContent && !editMode) return null

          return (
            <div
              key={widgetId}
              draggable={editMode}
              onDragStart={() => setDraggingId(widgetId)}
              onDragOver={e => { e.preventDefault(); setDragOverId(widgetId) }}
              onDrop={e => {
                e.preventDefault()
                if (draggingId && draggingId !== widgetId) moveWidget(draggingId, widgetId)
                setDraggingId(null)
                setDragOverId(null)
              }}
              onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
              className={`transition-all duration-150 ${
                isDragging ? 'opacity-40 scale-[0.98]' : ''
              } ${
                isDragOver && !isDragging ? 'ring-2 ring-blue-400 ring-offset-2 rounded-2xl' : ''
              }`}
            >
              {/* 편집 모드 핸들 바 */}
              {editMode && (
                <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-t-2xl px-3 py-2 cursor-grab select-none">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-lg leading-none">⠿</span>
                    <span className="text-xs font-medium text-gray-500">{WIDGET_LABELS[widgetId]}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* 모바일용 위/아래 버튼 */}
                    <button
                      onClick={() => moveWidgetByIndex(widgetId, -1)}
                      disabled={idx === 0}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-400 disabled:opacity-20 transition-colors text-xs">
                      ▲
                    </button>
                    <button
                      onClick={() => moveWidgetByIndex(widgetId, 1)}
                      disabled={idx === widgetOrder.length - 1}
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-400 disabled:opacity-20 transition-colors text-xs">
                      ▼
                    </button>
                    {/* 숨기기 버튼 */}
                    <button
                      onClick={() => removeWidget(widgetId)}
                      title="위젯 숨기기"
                      className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-100 text-red-400 hover:text-red-500 transition-colors text-xs ml-1">
                      ✕
                    </button>
                  </div>
                </div>
              )}
              {/* 위젯 본체 — 편집 모드에서 상단 라운딩 제거 */}
              <div className={editMode ? '[&>div]:rounded-t-none' : ''}>
                {widgetContent ?? (
                  <div className="bg-white rounded-2xl p-4 shadow-sm border-2 border-dashed border-gray-200">
                    <p className="text-xs text-gray-400 text-center py-2">{WIDGET_LABELS[widgetId]} (내용 없음)</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 편집 모드: 숨긴 위젯 추가 */}
      {editMode && hiddenWidgets.length > 0 && (
        <div className="mt-3 border-2 border-dashed border-gray-200 rounded-2xl p-4">
          <div className="text-xs font-semibold text-gray-400 mb-3">숨긴 위젯 — 탭하여 추가</div>
          <div className="flex flex-wrap gap-2">
            {hiddenWidgets.map(id => (
              <button
                key={id}
                onClick={() => addWidget(id)}
                className="flex items-center gap-1 text-xs font-medium px-3 py-2 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 text-gray-600 hover:text-blue-600 rounded-xl transition-colors shadow-sm">
                + {WIDGET_LABELS[id]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 토스트 알림 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}
