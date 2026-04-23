'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useApp, getCategoryExpenses, computeAccountBalance } from '@/lib/AppContext'
import { Transaction, AssetType } from '@/types'

// FR-01: 자산 유형 메타
const ASSET_SECTIONS: { value: AssetType; label: string; icon: string; color: string }[] = [
  { value: 'cash',       label: '현금성 자산', icon: '💵', color: '#3B82F6' },
  { value: 'savings',    label: '예·적금',     icon: '🏦', color: '#10B981' },
  { value: 'investment', label: '투자 자산',   icon: '📈', color: '#8B5CF6' },
]

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
  const { data, categories } = useApp()
  const router = useRouter()
  const { accounts, transactions, goals, budgets, savings, cards, lastModified, isSetupComplete } = data

  type ViewMode = 'day' | 'month'
  const [viewMode, setViewMode]       = useState<ViewMode>('day')
  const [selectedDay, setSelectedDay] = useState(todayStr)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)

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
  // 카드대금 납부 거래는 이중계산이므로 요약에서 제외
  const isCardPayment = (t: Transaction) => categories.find(c => c.id === t.categoryId)?.role === 'card_payment'
  const isSavingTx = (t: Transaction) => {
    const cat = categories.find(c => c.id === t.categoryId)
    if (!cat) return false
    if (cat.role === 'savings') return true
    if ((cat as { savingId?: string }).savingId) return true
    const parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
    return parent?.role === 'savings' === true
  }
  const periodTxsForStats = periodTxs.filter(t => !isCardPayment(t))
  const stats       = calcStats(periodTxsForStats)
  // 지출 구성 분리
  const savingAmt   = periodTxsForStats.filter(t => t.type === 'expense' && isSavingTx(t)).reduce((s, t) => s + t.amount, 0)
  const cardPayAmt  = periodTxs.filter(t => t.type === 'expense' && isCardPayment(t)).reduce((s, t) => s + t.amount, 0)
  const realConsumption = Math.max(0, stats.expense - savingAmt)
  const catExpenses = getCategoryExpenses(transactions, viewMode === 'day' ? selectedDay : selectedMonth)

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
  const budgetUsed   = Object.values(getCategoryExpenses(transactions, budgetMonth)).reduce((s, v) => s + v, 0)
  const budgetPct    = totalBudget > 0 ? Math.min((budgetUsed / totalBudget) * 100, 100) : 0
  const budgetLeft   = totalBudget - budgetUsed

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

  // ── 연회비 알림 (60일 이내) ─────────────────────────────────────────────────
  const upcomingAnnualFees = useMemo(() => {
    const now = new Date()
    return cards
      .filter(c => c.annualFeeAmount && c.annualFeeDate)
      .map(c => {
        const [mm, dd] = c.annualFeeDate!.split('-').map(Number)
        const thisYear = new Date(now.getFullYear(), mm - 1, dd)
        const nextYear = new Date(now.getFullYear() + 1, mm - 1, dd)
        const feeDate  = thisYear >= now ? thisYear : nextYear
        const daysUntil = Math.ceil((feeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return { card: c, feeDate, daysUntil }
      })
      .filter(x => x.daysUntil <= 60)
      .sort((a, b) => a.daysUntil - b.daysUntil)
  }, [cards])

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

      {/* 연회비 알림 배너 */}
      {upcomingAnnualFees.length > 0 && (
        <div className="mb-4 space-y-2">
          {upcomingAnnualFees.map(({ card, feeDate, daysUntil }) => {
            const isUrgent  = daysUntil <= 14
            const isWarning = daysUntil <= 30
            const bg   = isUrgent  ? 'bg-red-50 border-red-200'    : isWarning ? 'bg-amber-50 border-amber-200'    : 'bg-blue-50 border-blue-200'
            const txt  = isUrgent  ? 'text-red-700'                 : isWarning ? 'text-amber-700'                  : 'text-blue-700'
            const badge = isUrgent ? 'bg-red-100 text-red-600'      : isWarning ? 'bg-amber-100 text-amber-700'     : 'bg-blue-100 text-blue-600'
            return (
              <div key={card.id} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${bg}`}>
                <div className="w-10 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: card.color }}>
                  {(card.bank || card.name).slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${txt}`}>{card.name} 연회비 납부 예정</div>
                  <div className={`text-xs mt-0.5 ${txt} opacity-80`}>
                    {feeDate.getFullYear()}년 {feeDate.getMonth() + 1}월 {feeDate.getDate()}일 · {fmtKRW(card.annualFeeAmount!)}
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 ${badge}`}>
                  D-{daysUntil}
                </span>
              </div>
            )
          })}
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

        {/* 지출 구성: 실소비 / 저축 / 카드대금 */}
        {(savingAmt > 0 || cardPayAmt > 0) && (
          <div className="mt-3 pt-3 border-t border-white/20">
            <div className="text-[10px] opacity-60 mb-2">지출 구성</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '실소비',  value: realConsumption, color: 'bg-red-300/30' },
                { label: '저축',    value: savingAmt,       color: 'bg-blue-300/30' },
                { label: '카드대금', value: cardPayAmt,     color: 'bg-amber-300/30' },
              ].map(item => (
                <div key={item.label} className={`${item.color} rounded-xl p-2 text-center`}>
                  <div className="text-[10px] opacity-70 mb-0.5">{item.label}</div>
                  <div className="text-xs font-bold tabular-nums leading-tight">{fmtShort(item.value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FR-015: 총 자산 라벨 — 날짜 선택 시 "[선택날짜] 기준 자산" */}
        <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between">
          <div className="text-xs opacity-70">
            {isHistoricalDay
              ? `${selectedDay} 기준 자산`
              : isHistoricalMonth
              ? `${selectedMonth} 기준 자산`
              : '오늘 기준 자산'}
          </div>
          <div className="text-lg font-bold tabular-nums">{fmtKRW(totalBalance)}</div>
        </div>
      </div>

      {/* FR-01: 자산 유형별 섹션으로 계좌 표시 */}
      {ASSET_SECTIONS.map(section => {
        const sectionAccounts = accountBalances.filter(a => (a.assetType ?? 'cash') === section.value)
        if (sectionAccounts.length === 0) return null
        const subtotal = sectionAccounts.reduce((s, a) => s + a.computed, 0)
        return (
          <div key={section.value} className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{section.icon}</span>
                <span className="text-xs font-bold text-gray-500">{section.label}</span>
              </div>
              <span className="text-xs font-semibold" style={{ color: section.color }}>{fmtKRW(subtotal)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {sectionAccounts.map(acc => {
                const prevBal = prevAccountBalances.find(p => p.id === acc.id)?.computed ?? acc.computed
                const diff = acc.computed - prevBal
                return (
                  <div key={acc.id} className="bg-white rounded-2xl p-4 shadow-sm" style={{ borderTop: `3px solid ${acc.color}` }}>
                    {/* FR-03: 은행명 + 계좌명 동시 표시 */}
                    <div className="mb-2">
                      {acc.bank && <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{acc.bank}</div>}
                      <div className="text-xs text-gray-700 font-medium">{acc.name}</div>
                    </div>
                    <div className="text-xl font-bold text-gray-900 tabular-nums">
                      {acc.computed.toLocaleString('ko-KR')}원
                    </div>
                    {diff !== 0 && (
                      <div className={`text-xs mt-1 font-medium ${diff >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                        {viewMode === 'day' ? '전일 대비' : '전월 대비'} {diff >= 0 ? '+' : ''}{diff.toLocaleString('ko-KR')}원
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* 카드 사용 현황 — 월별 */}
      {(() => {
        const isCardPayCat = (catId: string) => categories.find(c => c.id === catId)?.role === 'card_payment'

        // 납부된 청구월 Set
        // billingMonth가 없으면 납부일 기준 전달로 자동 추정 (일반적인 카드 결제 주기)
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

        // 월별 카드 사용액 집계 (전체 카드 합산)
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

        if (monthRows.length === 0) return null

        const totalUnpaid = monthRows.filter(r => !r.isPaid).reduce((s, r) => s + r.total, 0)

        return (
          <div className="mb-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">💳</span>
                  <span className="text-sm font-bold text-gray-700">카드 사용 현황</span>
                </div>
                <Link href="/budget" className="text-xs text-blue-600">자세히 →</Link>
              </div>

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
            </div>
          </div>
        )
      })()}

      {/* 적금·예금 요약 */}
      {savingsSummary.count > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🏦</span>
              <span className="font-semibold text-gray-900 text-sm">적금·예금</span>
              <span className="text-xs text-gray-400">{savingsSummary.count}건</span>
            </div>
            <Link href="/savings" className="text-xs text-blue-600">자세히 →</Link>
          </div>
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
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* 예산 현황 (항상 월 기준) */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-gray-900 text-sm">
              {monthLabel(budgetMonth)} 예산
            </div>
            <Link href="/budget" className="text-xs text-blue-600">자세히 →</Link>
          </div>
          {totalBudget > 0 ? (
            <>
              <div className="flex justify-between text-xs text-gray-500 mb-2">
                <span>사용 {fmtShort(budgetUsed)}</span>
                <span>예산 {fmtShort(totalBudget)}</span>
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

        {/* 재무 목표 */}
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
      </div>

      {/* 거래 목록 */}
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
    </div>
  )
}
