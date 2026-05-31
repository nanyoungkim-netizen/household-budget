'use client'

import { useState, useMemo, useCallback } from 'react'
import { useApp, getConsumptionType } from '@/lib/AppContext'
import { Transaction } from '@/types'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  ComposedChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function fmtShort(n: number) {
  const abs = Math.abs(n)
  if (abs >= 100000000) return (n / 100000000).toFixed(1) + '억'
  if (abs >= 10000) return (n / 10000).toFixed(0) + '만'
  return n.toLocaleString()
}

const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

function addMonths(m: string, n: number) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type Tab = 'trend' | 'category' | 'spending' | 'annual'
type PeriodMode = 'single' | 'range'

// ── 커스텀 툴팁 ──────────────────────────────────────────────────────────────
function KRWTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-700 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500">{p.name}</span>
          <span className="font-bold text-gray-900 ml-auto pl-3">{fmtKRW(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function PctTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-gray-700 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500">{p.name}</span>
          <span className="font-bold text-gray-900 ml-auto pl-3">{p.value}%</span>
        </div>
      ))}
    </div>
  )
}

export default function StatisticsPage() {
  const { data, categories } = useApp()
  const { transactions, categoryExcludeMonths } = data

  const [tab, setTab]           = useState<Tab>('trend')
  const [catTab, setCatTab]     = useState<'expense' | 'income'>('expense')
  const [yearOffset, setYearOffset] = useState(0)

  // ── 분석기간 필터 상태 ────────────────────────────────────────────────────
  const [statMonth, setStatMonth]       = useState(currentMonth)
  const [periodMode, setPeriodMode]     = useState<PeriodMode>('single')
  const [rangeStart, setRangeStart]     = useState(addMonths(currentMonth, -5))
  const [rangeEnd, setRangeEnd]         = useState(currentMonth)
  const [showCustomRange, setShowCustomRange] = useState(false)

  // ── 카테고리 맵 ──────────────────────────────────────────────────────────
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  // ── 헬퍼: 카드대금 / 저축 판별 ───────────────────────────────────────────
  // 소비 판별은 getConsumptionType 한 곳에서 (역할 우선순위 일관·중복집계 방지)
  const isCardPayment = useCallback((t: Transaction) =>
    getConsumptionType(t, categories) === 'card_payment'
  , [categories])

  const isSaving = useCallback((t: Transaction) =>
    getConsumptionType(t, categories) === 'savings_transfer'
  , [categories])

  const isInvest = useCallback((t: Transaction) =>
    getConsumptionType(t, categories) === 'investment'
  , [categories])

  // ── 월별 핵심 지표 ───────────────────────────────────────────────────────
  const getMonthStats = useCallback((m: string) => {
    const txs    = transactions.filter(t => t.date.startsWith(m))
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const refund = txs.filter(t => t.type === 'refund').reduce((s, t) => s + t.amount, 0)
    // 카드대금 자동 제외 없음 — 수동 제외(categoryExcludeMonths)만 적용
    const expense   = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const savingAmt = txs.filter(t => t.type === 'expense' && isSaving(t)).reduce((s, t) => s + t.amount, 0)
    const investAmt = txs.filter(t => t.type === 'expense' && isInvest(t)).reduce((s, t) => s + t.amount, 0)
    const cardPayAmt = txs.filter(t => t.type === 'expense' && isCardPayment(t)).reduce((s, t) => s + t.amount, 0)
    // 수동 제외 금액 (저축·투자·카드대금 제외 후, categoryExcludeMonths 기준)
    const excludedAmt = txs.filter(t => {
      if (t.type !== 'expense') return false
      if (isSaving(t) || isInvest(t) || isCardPayment(t)) return false
      const cat = catMap.get(t.categoryId)
      if (!cat) return false
      if ((categoryExcludeMonths[cat.id] ?? []).includes(m)) return true
      const parent = cat.parentId ? catMap.get(cat.parentId) : undefined
      return !!parent && (categoryExcludeMonths[parent.id] ?? []).includes(m)
    }).reduce((s, t) => s + t.amount, 0)
    // 실소비 = 전체 지출에서 저축·투자·카드대금·제외 모두 뺀 '실제 소비'
    const realConsumption = Math.max(0, expense - savingAmt - investAmt - cardPayAmt - excludedAmt - refund)
    const savingRate      = income > 0 ? (savingAmt / income) * 100 : 0
    const netIncome       = income - realConsumption - savingAmt - investAmt
    return { income, expense, savingAmt, investAmt, cardPayAmt, excludedAmt, realConsumption, savingRate, netIncome, refund }
  }, [transactions, isSaving, isInvest, isCardPayment, catMap, categoryExcludeMonths])

  // ── KPI (이번달·전월) ───────────────────────────────────────────────────
  const thisStats = useMemo(() => getMonthStats(currentMonth), [getMonthStats])
  // 요약 섹션: 기간 네비(statMonth) 기준 이번 달 vs 지난달
  const selStats     = useMemo(() => getMonthStats(statMonth), [getMonthStats, statMonth])
  const prevSelStats = useMemo(() => getMonthStats(addMonths(statMonth, -1)), [getMonthStats, statMonth])

  // 이달 지출 구성 비율 (실소비 / 카드대금 / 저축 / 투자 / 제외)
  const totalOutflow   = thisStats.realConsumption + thisStats.cardPayAmt + thisStats.savingAmt + thisStats.investAmt + thisStats.excludedAmt
  const consumptionPct = totalOutflow > 0 ? (thisStats.realConsumption / totalOutflow) * 100 : 0
  const cardPct        = totalOutflow > 0 ? (thisStats.cardPayAmt / totalOutflow) * 100 : 0
  const savingPct      = totalOutflow > 0 ? (thisStats.savingAmt / totalOutflow) * 100 : 0
  const investPct      = totalOutflow > 0 ? (thisStats.investAmt / totalOutflow) * 100 : 0
  const excludedPct    = totalOutflow > 0 ? (thisStats.excludedAmt / totalOutflow) * 100 : 0

  // ── 추이 탭: 최근 6개월 ─────────────────────────────────────────────────
  const trendData = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const m = addMonths(currentMonth, i - 5)
    const s = getMonthStats(m)
    const mo = parseInt(m.split('-')[1])
    return {
      label: `${mo}월`, 수입: s.income, 실소비: s.realConsumption,
      카드대금: s.cardPayAmt, 저축: s.savingAmt, 투자: s.investAmt,
      제외: s.excludedAmt, 제외항목: s.excludedAmt, 순수입: s.netIncome,
      저축률: Math.round(s.savingRate),
    }
  }), [getMonthStats])

  // ── 분석 기간 계산 ──────────────────────────────────────────────────────
  const analysisMonths = useMemo(() => {
    if (periodMode === 'single') return [statMonth]
    const months: string[] = []
    let m = rangeStart
    while (m <= rangeEnd) { months.push(m); m = addMonths(m, 1) }
    return months
  }, [periodMode, statMonth, rangeStart, rangeEnd])

  const inAnalysis = useCallback((dateStr: string) =>
    analysisMonths.some(m => dateStr.startsWith(m))
  , [analysisMonths])

  const periodLabel = useMemo(() => {
    if (periodMode === 'single') {
      const [y, mo] = statMonth.split('-')
      return `${y}년 ${parseInt(mo)}월`
    }
    const [sy, smo] = rangeStart.split('-')
    const [ey, emo] = rangeEnd.split('-')
    return `${sy}년 ${parseInt(smo)}월 ~ ${ey}년 ${parseInt(emo)}월`
  }, [periodMode, statMonth, rangeStart, rangeEnd])

  // ── 카테고리 탭 ─────────────────────────────────────────────────────────
  const prevCatMonth = addMonths(analysisMonths[0], -1)

  const catItems = useMemo(() =>
    categories
      .filter(c => c.type === catTab && c.parentId !== null)
      .filter(c => catTab === 'expense' ? c.role !== 'card_payment' : true)
      .map(c => ({
        id: c.id, name: c.name, icon: c.icon, color: c.color,
        value: Math.max(0, transactions
          .filter(t => inAnalysis(t.date) && t.categoryId === c.id)
          .reduce((s, t) => {
            if (t.type === 'expense' && catTab === 'expense') return s + t.amount
            if (t.type === 'refund'  && catTab === 'expense') return s - t.amount
            if (t.type === 'income'  && catTab === 'income')  return s + t.amount
            return s
          }, 0)),
      }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value)
  , [transactions, categories, catTab, inAnalysis])

  const totalCatAmt = catItems.reduce((s, c) => s + c.value, 0)

  const prevCatMap = useMemo(() => {
    const map = new Map<string, number>()
    categories.filter(c => c.parentId !== null).forEach(c => {
      const v = transactions
        .filter(t => t.date.startsWith(prevCatMonth) && t.categoryId === c.id && t.type === catTab)
        .reduce((s, t) => s + t.amount, 0)
      if (v > 0) map.set(c.id, v)
    })
    return map
  }, [transactions, categories, catTab, prevCatMonth])

  const top5cats = catItems.slice(0, 5)

  const catTrendData = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const base = periodMode === 'single' ? statMonth : rangeEnd
    const m  = addMonths(base, i - 5)
    const mo = parseInt(m.split('-')[1])
    const entry: Record<string, string | number> = { label: `${mo}월` }
    top5cats.forEach(cat => {
      entry[cat.name] = transactions
        .filter(t => t.date.startsWith(m) && t.categoryId === cat.id && t.type === catTab)
        .reduce((s, t) => s + t.amount, 0)
    })
    return entry
  }), [transactions, top5cats, statMonth, rangeEnd, periodMode, catTab])

  // ── 지출분석 탭 ─────────────────────────────────────────────────────────
  // 지출분석(일별/요일별)은 단일 월 기준 — range 선택 시 마지막 달 기준
  const analysisMonth = periodMode === 'single' ? statMonth : rangeEnd

  const dailyData = useMemo(() => {
    const daysInMonth = new Date(
      parseInt(analysisMonth.slice(0, 4)),
      parseInt(analysisMonth.slice(5, 7)), 0
    ).getDate()
    let cumulative = 0
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day     = String(i + 1).padStart(2, '0')
      const dateStr = `${analysisMonth}-${day}`
      const amt     = transactions
        .filter(t => {
          if (t.date !== dateStr || t.type !== 'expense') return false
          if (isSaving(t) || isInvest(t)) return false
          const cat = catMap.get(t.categoryId)
          if (!cat) return true
          if ((categoryExcludeMonths[cat.id] ?? []).includes(analysisMonth)) return false
          const parent = cat.parentId ? catMap.get(cat.parentId) : undefined
          return !(parent && (categoryExcludeMonths[parent.id] ?? []).includes(analysisMonth))
        })
        .reduce((s, t) => s + t.amount, 0)
      cumulative += amt
      return { day: i + 1, 일별: amt, 누적: cumulative }
    })
  }, [transactions, isSaving, isInvest, catMap, categoryExcludeMonths, analysisMonth])

  const dowData = useMemo(() => {
    const DOW = ['일', '월', '화', '수', '목', '금', '토']
    const amounts = Array(7).fill(0)
    const counts  = Array(7).fill(0)
    transactions
      .filter(t => {
        if (!t.date.startsWith(analysisMonth) || t.type !== 'expense') return false
        if (isSaving(t) || isInvest(t)) return false  // 저축·투자 제외
        const cat = catMap.get(t.categoryId)
        if (!cat) return true
        if ((categoryExcludeMonths[cat.id] ?? []).includes(analysisMonth)) return false
        const parent = cat.parentId ? catMap.get(cat.parentId) : undefined
        return !(parent && (categoryExcludeMonths[parent.id] ?? []).includes(analysisMonth))
      })
      .forEach(t => {
        const dow = new Date(t.date + 'T00:00:00').getDay()
        amounts[dow] += t.amount
        counts[dow]++
      })
    return DOW.map((label, i) => ({ label, amount: amounts[i], count: counts[i] }))
  }, [transactions, isSaving, isInvest, catMap, categoryExcludeMonths, analysisMonth])

  const payMethodData = useMemo(() => {
    const card    = transactions.filter(t => t.date.startsWith(analysisMonth) && t.type === 'expense' && t.paymentMethod === 'card'    && !isCardPayment(t)).reduce((s, t) => s + t.amount, 0)
    const account = transactions.filter(t => t.date.startsWith(analysisMonth) && t.type === 'expense' && t.paymentMethod === 'account' && !isCardPayment(t)).reduce((s, t) => s + t.amount, 0)
    return [
      { name: '카드', value: card,    color: '#0064FF' },
      { name: '통장', value: account, color: '#00B493' },
    ].filter(d => d.value > 0)
  }, [transactions, isCardPayment, analysisMonth])

  const cardSpendData = useMemo(() =>
    data.cards.map(card => ({
      name: card.name, color: card.color,
      amount: transactions
        .filter(t => t.date.startsWith(analysisMonth) && t.type === 'expense' && t.paymentMethod === 'card' && t.cardId === card.id)
        .reduce((s, t) => s + t.amount, 0),
    })).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount)
  , [transactions, data.cards, analysisMonth])

  // ── 연간 탭 ──────────────────────────────────────────────────────────────
  const targetYear = today.getFullYear() + yearOffset

  const annualData = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const m = `${targetYear}-${String(i + 1).padStart(2, '0')}`
    const s = getMonthStats(m)
    return {
      label: `${i + 1}월`, 수입: s.income, 실소비: s.realConsumption,
      저축: s.savingAmt, 제외항목: s.excludedAmt, 저축률: Math.round(s.savingRate),
    }
  }), [getMonthStats, targetYear])

  let cumSav = 0
  const cumData = annualData.map(d => { cumSav += d.저축; return { ...d, 누적저축: cumSav } })

  const hasData = transactions.length > 0

  // ── 요약 섹션 ① 이번 달 한눈에 (vs 지난달) ──
  const summaryRows: { label: string; value: number; prev: number; good: 'up' | 'down' }[] = [
    { label: '수입',     value: selStats.income,          prev: prevSelStats.income,          good: 'up' },
    { label: '실소비',   value: selStats.realConsumption,  prev: prevSelStats.realConsumption,  good: 'down' },
    { label: '카드대금', value: selStats.cardPayAmt,       prev: prevSelStats.cardPayAmt,       good: 'down' },
    { label: '저축',     value: selStats.savingAmt,        prev: prevSelStats.savingAmt,        good: 'up' },
    { label: '투자',     value: selStats.investAmt,        prev: prevSelStats.investAmt,        good: 'up' },
    ...((selStats.excludedAmt > 0 || prevSelStats.excludedAmt > 0)
      ? [{ label: '제외', value: selStats.excludedAmt, prev: prevSelStats.excludedAmt, good: 'down' as const }] : []),
  ]

  // ── 요약 섹션 ② 한 줄 인사이트 (실데이터 기반 자동 생성) ──
  const insights = useMemo(() => {
    const out: string[] = []
    const pct = (a: number, b: number) => b === 0 ? null : Math.round(((a - b) / b) * 100)
    const cp = pct(selStats.cardPayAmt, prevSelStats.cardPayAmt)
    if (cp !== null && cp !== 0) out.push(`💳 카드값이 지난달보다 ${Math.abs(cp)}% ${cp < 0 ? '줄었어요 👏' : '늘었어요'}`)
    if (selStats.investAmt > 0) {
      if (prevSelStats.investAmt === 0) out.push('📈 이번 달 새로 투자를 시작했어요')
      else {
        const ratio = selStats.investAmt / prevSelStats.investAmt
        if (ratio >= 2) out.push(`📈 투자를 지난달보다 ${Math.round(ratio)}배 했어요`)
        else if (ratio >= 1.3) out.push(`📈 투자를 지난달보다 ${Math.round((ratio - 1) * 100)}% 더 했어요`)
        else if (ratio < 0.7) out.push('📉 이번 달 투자가 지난달보다 줄었어요')
      }
    }
    if (statMonth === currentMonth) {
      const today = new Date()
      const day = today.getDate()
      const dim = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
      if (day >= 3 && day < dim && selStats.realConsumption > 0) {
        out.push(`🔮 이 페이스면 이번 달 실소비 약 ${fmtShort(Math.round(selStats.realConsumption / day * dim))}원 예상돼요`)
      }
    }
    // 저축은 '금액' 기준 (저축률은 수입 변동에 휘둘려서 오해를 줌)
    const sv = pct(selStats.savingAmt, prevSelStats.savingAmt)
    if (sv !== null && Math.abs(sv) >= 5) out.push(`${sv > 0 ? `🌱 저축을 지난달보다 ${sv}% 더 했어요` : `💡 저축이 지난달보다 ${Math.abs(sv)}% 줄었어요`}`)
    return out.slice(0, 3)
  }, [selStats, prevSelStats, statMonth])

  // ── 탭 바 ────────────────────────────────────────────────────────────────
  const TABS: [Tab, string][] = [['trend','📈 추이'], ['category','🗂️ 카테고리'], ['spending','💳 지출분석'], ['annual','📅 연간']]

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">통계 & 분석</h1>
        <div className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg font-medium">
          ✓ 카드대금 이중계산 제외
        </div>
      </div>

      {/* 분석기간 필터 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
        {/* 월 네비게이터 */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => {
              if (periodMode === 'single') { setStatMonth(addMonths(statMonth, -1)); setShowCustomRange(false) }
              else { setRangeStart(addMonths(rangeStart, -1)); setRangeEnd(addMonths(rangeEnd, -1)) }
            }}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 text-lg transition-colors">
            ‹
          </button>
          <span className="text-sm font-bold text-gray-900">{periodLabel}</span>
          <button
            onClick={() => {
              if (periodMode === 'single') { if (statMonth < currentMonth) setStatMonth(addMonths(statMonth, 1)); setShowCustomRange(false) }
              else { if (rangeEnd < currentMonth) { setRangeStart(addMonths(rangeStart, 1)); setRangeEnd(addMonths(rangeEnd, 1)) } }
            }}
            disabled={periodMode === 'single' ? statMonth >= currentMonth : rangeEnd >= currentMonth}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 text-lg transition-colors disabled:opacity-25">
            ›
          </button>
        </div>

        {/* 빠른 선택 칩 */}
        <div className="flex flex-wrap gap-2">
          {([['이번 달', currentMonth], ['지난달', addMonths(currentMonth, -1)]] as [string, string][]).map(([label, m]) => (
            <button
              key={label}
              onClick={() => { setStatMonth(m); setPeriodMode('single'); setShowCustomRange(false) }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                periodMode === 'single' && statMonth === m && !showCustomRange
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {label}
            </button>
          ))}
          <button
            onClick={() => { setPeriodMode('range'); setRangeStart(addMonths(currentMonth, -2)); setRangeEnd(currentMonth); setShowCustomRange(false) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              periodMode === 'range' && !showCustomRange && rangeStart === addMonths(currentMonth, -2) && rangeEnd === currentMonth
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            3개월
          </button>
          <button
            onClick={() => { setPeriodMode('range'); setRangeStart(addMonths(currentMonth, -5)); setRangeEnd(currentMonth); setShowCustomRange(false) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              periodMode === 'range' && !showCustomRange && rangeStart === addMonths(currentMonth, -5) && rangeEnd === currentMonth
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            6개월
          </button>
          <button
            onClick={() => { setShowCustomRange(true); setPeriodMode('range') }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              showCustomRange
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            직접 선택
          </button>
        </div>

        {/* 직접 선택 입력 */}
        {showCustomRange && (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="month" min="1900-01" max="2099-12"
              value={rangeStart}
              onChange={e => setRangeStart(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-400 text-sm">~</span>
            <input
              type="month" min="1900-01"
              value={rangeEnd}
              max={currentMonth}
              onChange={e => setRangeEnd(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* ① 이번 달 한눈에 (vs 지난달) — 모든 줄 같은 서식, 이번달·지난달 둘 다 */}
      {hasData && (
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <div className="text-sm font-bold text-gray-800 mb-3">{periodLabel} 한눈에 <span className="text-xs text-gray-400 font-normal">vs 지난달</span></div>
          <div className="divide-y divide-gray-50">
            {summaryRows.map(r => {
              const isUp = r.value > r.prev
              const same = r.value === r.prev
              const isGood = (r.good === 'up' && isUp) || (r.good === 'down' && !isUp)
              const pct = r.prev === 0 ? null : Math.round(Math.abs((r.value - r.prev) / r.prev) * 100)
              return (
                <div key={r.label} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-gray-700">{r.label}</span>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-sm font-semibold tabular-nums text-gray-900">{fmtKRW(r.value)}</span>
                      {r.prev === 0 && r.value > 0
                        ? <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-600">NEW</span>
                        : same
                        ? <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-400">— 0%</span>
                        : <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${isGood ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>{isUp ? '▲' : '▼'} {pct}%</span>}
                    </div>
                    <div className="text-[11px] text-gray-400 tabular-nums mt-0.5">지난달 {fmtKRW(r.prev)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ② 한 줄 인사이트 */}
      {hasData && insights.length > 0 && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 mb-4">
          <div className="text-xs font-semibold text-blue-600 mb-2">한 줄 인사이트</div>
          <ul className="space-y-1.5">
            {insights.map((t, i) => <li key={i} className="text-sm text-gray-700">{t}</li>)}
          </ul>
        </div>
      )}

      {/* ③ 어디에 많이 썼나 (TOP 5) */}
      {hasData && top5cats.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-5">
          <div className="text-sm font-bold text-gray-800 mb-3">어디에 많이 썼나 <span className="text-xs text-gray-400 font-normal">(TOP 5)</span></div>
          <div className="space-y-3">
            {top5cats.map(c => {
              const prev = prevCatMap.get(c.id) ?? 0
              const isUp = c.value > prev
              const same = c.value === prev
              const pct = prev === 0 ? null : Math.round(Math.abs((c.value - prev) / prev) * 100)
              return (
                <div key={c.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700">{c.icon} {c.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-gray-900">{fmtKRW(c.value)}</span>
                      {prev === 0
                        ? <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-600">NEW</span>
                        : same
                        ? <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-400">—</span>
                        : <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${!isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>{isUp ? '▲' : '▼'} {pct}%</span>}
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full">
                    <div className="h-1.5 rounded-full" style={{ width: `${totalCatAmt > 0 ? (c.value / top5cats[0].value) * 100 : 0}%`, backgroundColor: c.color || '#FF6B6B' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 탭 */}
      <div className="flex bg-white rounded-2xl p-1 shadow-sm mb-5 gap-1 overflow-x-auto">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
              tab === key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {!hasData && (
        <div className="bg-white rounded-2xl p-12 shadow-sm text-center text-gray-400">
          <div className="text-5xl mb-3">📊</div>
          <div className="text-sm">거래 내역을 추가하면 차트가 표시됩니다</div>
        </div>
      )}

      {/* ══ 추이 탭 ════════════════════════════════════════════════════════ */}
      {hasData && tab === 'trend' && (
        <div className="space-y-4">
          {/* 이달 지출 구성 */}
          {totalOutflow > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="font-semibold text-sm text-gray-900 mb-1">이달 지출 구성</div>
              <div className="text-xs text-gray-400 mb-3">총 지출액을 실소비 · 카드대금 · 저축 · 투자 · 제외로 분리</div>
              {/* 스택 바 */}
              <div className="flex h-5 rounded-full overflow-hidden mb-3">
                {consumptionPct > 0 && <div style={{ width: `${consumptionPct}%`, backgroundColor: '#FF6B6B' }} />}
                {cardPct > 0        && <div style={{ width: `${cardPct}%`,        backgroundColor: '#F5A623' }} />}
                {savingPct > 0      && <div style={{ width: `${savingPct}%`,      backgroundColor: '#0064FF' }} />}
                {investPct > 0      && <div style={{ width: `${investPct}%`,      backgroundColor: '#6366F1' }} />}
                {excludedPct > 0    && <div style={{ width: `${excludedPct}%`,    backgroundColor: '#8B5CF6' }} />}
              </div>
              <div className={`grid gap-2 ${(() => {
                const n = 1 + (thisStats.cardPayAmt > 0 ? 1 : 0) + (thisStats.savingAmt > 0 ? 1 : 0) + (thisStats.investAmt > 0 ? 1 : 0) + (thisStats.excludedAmt > 0 ? 1 : 0)
                return n >= 4 ? 'grid-cols-4' : n === 3 ? 'grid-cols-3' : 'grid-cols-2'
              })()}`}>
                {[
                  { label: '실소비',   color: '#FF6B6B', value: thisStats.realConsumption, pct: consumptionPct },
                  ...(thisStats.cardPayAmt > 0  ? [{ label: '카드대금', color: '#F5A623', value: thisStats.cardPayAmt,  pct: cardPct }]     : []),
                  ...(thisStats.savingAmt > 0   ? [{ label: '저축',     color: '#0064FF', value: thisStats.savingAmt,   pct: savingPct }]   : []),
                  ...(thisStats.investAmt > 0   ? [{ label: '투자',     color: '#6366F1', value: thisStats.investAmt,   pct: investPct }]   : []),
                  ...(thisStats.excludedAmt > 0 ? [{ label: '제외',     color: '#8B5CF6', value: thisStats.excludedAmt, pct: excludedPct }] : []),
                ].map(item => (
                  <div key={item.label} className="rounded-xl p-3" style={{ backgroundColor: item.color + '14' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-gray-500">{item.label}</span>
                    </div>
                    <div className="text-sm font-bold text-gray-900 tabular-nums leading-tight">{fmtShort(item.value)}</div>
                    <div className="text-xs mt-0.5" style={{ color: item.color }}>{item.pct.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 나간 돈 구성(스택) + 수입(선) */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-0.5">최근 6개월 나간 돈 구성</div>
            <div className="text-xs text-gray-400 mb-4">막대 = 실소비·카드대금·저축·투자·제외 / 선 = 수입</div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={trendData} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip content={<KRWTooltip />} />
                <Legend />
                <Bar dataKey="실소비"   stackId="out" fill="#FF6B6B" />
                <Bar dataKey="카드대금" stackId="out" fill="#F5A623" />
                <Bar dataKey="저축"     stackId="out" fill="#0064FF" />
                <Bar dataKey="투자"     stackId="out" fill="#6366F1" />
                <Bar dataKey="제외"     stackId="out" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                <Line dataKey="수입" stroke="#00B493" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 저축률 추이 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-4">월별 저축률 (%)</div>
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="savGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0064FF" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#0064FF" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => v + '%'} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip content={<PctTooltip />} />
                <Area type="monotone" dataKey="저축률" stroke="#0064FF" strokeWidth={2.5}
                  fill="url(#savGrad)" dot={{ r: 4, fill: '#0064FF', strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 순수입 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-1">월별 순수입</div>
            <div className="text-xs text-gray-400 mb-4">수입 − 실소비 − 저축</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip content={<KRWTooltip />} />
                <Bar dataKey="순수입" radius={[4, 4, 0, 0]}>
                  {trendData.map((d, i) => <Cell key={i} fill={d.순수입 >= 0 ? '#00B493' : '#FF3B30'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ══ 카테고리 탭 ════════════════════════════════════════════════════ */}
      {hasData && tab === 'category' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                <button onClick={() => setCatTab('expense')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${catTab === 'expense' ? 'bg-red-500 text-white' : 'text-gray-500'}`}>
                  지출
                </button>
                <button onClick={() => setCatTab('income')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${catTab === 'income' ? 'bg-emerald-500 text-white' : 'text-gray-500'}`}>
                  수입
                </button>
              </div>
              <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                {statMonth.split('-')[0]}년 {parseInt(statMonth.split('-')[1])}월
              </span>
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-gray-900">
                카테고리별 {catTab === 'expense' ? '지출' : '수입'}
              </div>
              <div className="text-xs text-gray-400">총 <span className="font-semibold text-gray-700">{fmtKRW(totalCatAmt)}</span></div>
            </div>

            {catItems.length > 0 ? (
              <>
                {/* 도넛 + 리스트 */}
                <div className="flex flex-col md:flex-row items-center gap-6 mb-5">
                  <div className="flex-shrink-0">
                    <ResponsiveContainer width={200} height={200}>
                      <PieChart>
                        <Pie data={catItems} cx="50%" cy="50%" innerRadius={55} outerRadius={88} dataKey="value" paddingAngle={2}>
                          {catItems.map((c, i) => <Cell key={i} fill={c.color} />)}
                        </Pie>
                        <Tooltip formatter={(v) => fmtKRW(Number(v))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2.5 w-full">
                    {catItems.map(c => {
                      const prev = prevCatMap.get(c.id) ?? 0
                      const diff = c.value - prev
                      return (
                        <div key={c.id} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                          <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{c.icon} {c.name}</span>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-semibold text-gray-900 tabular-nums">{fmtKRW(c.value)}</div>
                            <div className="text-xs text-gray-400 flex items-center justify-end gap-1">
                              <span>{totalCatAmt > 0 ? (c.value / totalCatAmt * 100).toFixed(1) : 0}%</span>
                              {prev > 0 && (
                                <span className={`font-medium ${diff > 0 ? 'text-red-400' : diff < 0 ? 'text-emerald-500' : 'text-gray-400'}`}>
                                  {diff > 0 ? '▲' : diff < 0 ? '▼' : '–'}{fmtShort(Math.abs(diff))}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 순위 바 */}
                <div className="pt-4 border-t border-gray-50 space-y-2.5">
                  {catItems.slice(0, 8).map((c, i) => (
                    <div key={c.id} className="flex items-center gap-3">
                      <span className="text-xs text-gray-300 w-4 text-right font-mono">{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium text-gray-700">{c.icon} {c.name}</span>
                          <span className="text-xs font-bold text-gray-900 tabular-nums">{fmtKRW(c.value)}</span>
                        </div>
                        <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full transition-all"
                            style={{ width: `${totalCatAmt > 0 ? (c.value / catItems[0].value) * 100 : 0}%`, backgroundColor: c.color }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-10 text-gray-400 text-sm">
                {periodLabel} {catTab === 'expense' ? '지출' : '수입'} 내역이 없습니다
              </div>
            )}
          </div>

          {/* 카테고리별 월별 추이 */}
          {top5cats.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="font-semibold text-sm text-gray-900 mb-4">
                카테고리별 월별 추이 <span className="text-gray-400 font-normal text-xs">(최근 6개월)</span>
              </div>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={catTrendData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<KRWTooltip />} />
                  <Legend />
                  {top5cats.map((cat, i) => (
                    <Bar key={cat.id} dataKey={cat.name} stackId="a" fill={cat.color}
                      radius={i === top5cats.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ══ 지출분석 탭 ════════════════════════════════════════════════════ */}
      {hasData && tab === 'spending' && (
        <div className="space-y-4">
          {/* 기간 선택 */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 font-medium">분석 기간</span>
            <span className="text-sm font-medium text-gray-700">{analysisMonth.split('-')[0]}년 {parseInt(analysisMonth.split('-')[1])}월</span>
            {periodMode === 'range' && <span className="text-xs text-gray-400">(범위 선택 시 마지막 달 기준)</span>}
          </div>

          {/* 일별 소비 + 누적 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-1">일별 소비 & 누적</div>
            <div className="text-xs text-gray-400 mb-4">카드대금 납부 제외 · 막대=일별, 선=누적</div>
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                  tickFormatter={v => (v % 5 === 0 || v === 1) ? String(v) + '일' : ''} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v, name) => [fmtKRW(Number(v)), name]} labelFormatter={v => `${v}일`} />
                <Legend />
                <Bar    dataKey="일별" fill="#FF6B6B"  radius={[3, 3, 0, 0]} />
                <Line  type="monotone" dataKey="누적" stroke="#0064FF" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 요일별 패턴 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-4">요일별 소비 패턴</div>
            <ResponsiveContainer width="100%" height={210}>
              <ComposedChart data={dowData} barCategoryGap="40%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 13, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} unit="건" />
                <Tooltip formatter={(v, name) => [name === '소비금액' ? fmtKRW(Number(v)) : v + '건', name]} />
                <Bar yAxisId="left" dataKey="amount" name="소비금액" radius={[5, 5, 0, 0]}>
                  {dowData.map((_, i) => <Cell key={i} fill={i === 0 || i === 6 ? '#FF6B6B' : '#8B5CF6'} />)}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="count" name="건수" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3, fill: '#F59E0B' }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-400" /><span className="text-xs text-gray-400">주말</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-violet-500" /><span className="text-xs text-gray-400">평일</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-400" /><span className="text-xs text-gray-400">건수</span></div>
            </div>
          </div>

          {/* 결제수단 + 카드별 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {payMethodData.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="font-semibold text-sm text-gray-900 mb-4">결제수단별 소비</div>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={payMethodData} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                        dataKey="value" paddingAngle={3}>
                        {payMethodData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmtKRW(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-3">
                    {payMethodData.map(d => {
                      const total = payMethodData.reduce((s, x) => s + x.value, 0)
                      return (
                        <div key={d.name}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700 flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />{d.name}
                            </span>
                            <span className="text-gray-500">{total > 0 ? (d.value / total * 100).toFixed(0) : 0}%</span>
                          </div>
                          <div className="text-sm font-bold text-gray-900 tabular-nums">{fmtKRW(d.value)}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {cardSpendData.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="font-semibold text-sm text-gray-900 mb-4">카드별 이용금액</div>
                <div className="space-y-3">
                  {cardSpendData.map(c => {
                    const maxAmt = cardSpendData[0].amount
                    return (
                      <div key={c.name}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm text-gray-700 flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                            {c.name}
                          </span>
                          <span className="text-sm font-bold text-gray-900 tabular-nums">{fmtKRW(c.amount)}</span>
                        </div>
                        <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full transition-all"
                            style={{ width: `${maxAmt > 0 ? (c.amount / maxAmt) * 100 : 0}%`, backgroundColor: c.color }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ 연간 탭 ════════════════════════════════════════════════════════ */}
      {hasData && tab === 'annual' && (
        <div className="space-y-4">
          {/* 연도 선택 */}
          <div className="flex items-center gap-2">
            <button onClick={() => setYearOffset(y => y - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 text-lg transition-colors">‹</button>
            <span className="text-base font-bold text-gray-900 min-w-[56px] text-center">{targetYear}년</span>
            <button onClick={() => setYearOffset(y => Math.min(0, y + 1))} disabled={yearOffset >= 0}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 text-lg transition-colors disabled:opacity-25">›</button>
          </div>

          {/* 연간 수입/실소비/저축 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-4">{targetYear}년 월별 수입 · 실소비 · 저축</div>
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={annualData} barGap={2} barCategoryGap="22%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip content={<KRWTooltip />} />
                <Legend />
                <Bar dataKey="수입"    fill="#00B493" radius={[4, 4, 0, 0]} />
                <Bar dataKey="실소비"  fill="#FF6B6B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="저축"    fill="#0064FF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="제외항목" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 누적 저축 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-4">{targetYear}년 누적 저축액</div>
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={cumData}>
                <defs>
                  <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0064FF" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#0064FF" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip content={<KRWTooltip />} />
                <Area type="monotone" dataKey="누적저축" name="누적저축" stroke="#0064FF" strokeWidth={2.5}
                  fill="url(#cumGrad)" dot={{ r: 4, fill: '#0064FF', strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* 월별 저축률 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-4">{targetYear}년 월별 저축률</div>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={annualData} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => v + '%'} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip content={<PctTooltip />} />
                <Bar dataKey="저축률" radius={[4, 4, 0, 0]}>
                  {annualData.map((d, i) => (
                    <Cell key={i} fill={d.저축률 >= 20 ? '#00B493' : d.저축률 >= 10 ? '#FFB800' : '#FF6B6B'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-5 mt-3">
              {[{ c: '#00B493', t: '20%↑ 우수' }, { c: '#FFB800', t: '10~20% 양호' }, { c: '#FF6B6B', t: '10%↓ 개선필요' }]
                .map(l => (
                  <div key={l.t} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.c }} />
                    <span className="text-xs text-gray-400">{l.t}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
