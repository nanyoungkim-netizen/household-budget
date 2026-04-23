'use client'

import { useState, useMemo, useCallback } from 'react'
import { useApp } from '@/lib/AppContext'
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
  const { transactions } = data

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
  const isCardPayment = useCallback((t: Transaction) =>
    catMap.get(t.categoryId)?.role === 'card_payment'
  , [catMap])

  const isSaving = useCallback((t: Transaction) => {
    const cat = catMap.get(t.categoryId)
    if (!cat) return false
    if (cat.role === 'savings') return true
    if (cat.savingId) return true
    const parent = cat.parentId ? catMap.get(cat.parentId) : null
    return parent?.role === 'savings'
  }, [catMap])

  // ── 월별 핵심 지표 ───────────────────────────────────────────────────────
  const getMonthStats = useCallback((m: string) => {
    const txs     = transactions.filter(t => t.date.startsWith(m))
    const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const refund  = txs.filter(t => t.type === 'refund').reduce((s, t) => s + t.amount, 0)
    // 카드대금 납부는 이중계산이므로 지출에서 제외
    const expense = txs.filter(t => t.type === 'expense' && !isCardPayment(t)).reduce((s, t) => s + t.amount, 0)
    const savingAmt  = txs.filter(t => t.type === 'expense' && !isCardPayment(t) && isSaving(t)).reduce((s, t) => s + t.amount, 0)
    const cardPayAmt = txs.filter(t => t.type === 'expense' && isCardPayment(t)).reduce((s, t) => s + t.amount, 0)
    const realConsumption = Math.max(0, expense - savingAmt - refund)
    const savingRate      = income > 0 ? (savingAmt / income) * 100 : 0
    const netIncome       = income - realConsumption - savingAmt
    return { income, expense, savingAmt, cardPayAmt, realConsumption, savingRate, netIncome, refund }
  }, [transactions, isCardPayment, isSaving])

  // ── KPI (이번달·전월) ───────────────────────────────────────────────────
  const thisStats = useMemo(() => getMonthStats(currentMonth), [getMonthStats])
  const lastStats = useMemo(() => getMonthStats(addMonths(currentMonth, -1)), [getMonthStats])

  const consumptionDiff = thisStats.realConsumption - lastStats.realConsumption
  const savingRateDiff  = thisStats.savingRate - lastStats.savingRate

  // 이달 지출 구성 비율
  const totalOutflow = thisStats.realConsumption + thisStats.savingAmt + thisStats.cardPayAmt
  const consumptionPct = totalOutflow > 0 ? (thisStats.realConsumption / totalOutflow) * 100 : 0
  const savingPct      = totalOutflow > 0 ? (thisStats.savingAmt / totalOutflow) * 100 : 0
  const cardPayPct     = totalOutflow > 0 ? (thisStats.cardPayAmt / totalOutflow) * 100 : 0

  // ── 추이 탭: 최근 6개월 ─────────────────────────────────────────────────
  const trendData = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const m = addMonths(currentMonth, i - 5)
    const s = getMonthStats(m)
    const mo = parseInt(m.split('-')[1])
    return {
      label: `${mo}월`, 수입: s.income, 실소비: s.realConsumption,
      저축: s.savingAmt, 카드대금: s.cardPayAmt, 순수입: s.netIncome,
      저축률: Math.round(s.savingRate),
    }
  }), [getMonthStats])

  // ── 카테고리 탭 ─────────────────────────────────────────────────────────
  const prevCatMonth = addMonths(statMonth, -1)

  const catItems = useMemo(() =>
    categories
      .filter(c => c.type === catTab && c.parentId !== null)
      .filter(c => catTab === 'expense' ? c.role !== 'card_payment' : true)
      .map(c => ({
        id: c.id, name: c.name, icon: c.icon, color: c.color,
        value: Math.max(0, transactions
          .filter(t => t.date.startsWith(statMonth) && t.categoryId === c.id)
          .reduce((s, t) => {
            if (t.type === 'expense' && catTab === 'expense') return s + t.amount
            if (t.type === 'refund'  && catTab === 'expense') return s - t.amount
            if (t.type === 'income'  && catTab === 'income')  return s + t.amount
            return s
          }, 0)),
      }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value)
  , [transactions, categories, catTab, statMonth])

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
    const m  = addMonths(statMonth, i - 5)
    const mo = parseInt(m.split('-')[1])
    const entry: Record<string, string | number> = { label: `${mo}월` }
    top5cats.forEach(cat => {
      entry[cat.name] = transactions
        .filter(t => t.date.startsWith(m) && t.categoryId === cat.id && t.type === catTab)
        .reduce((s, t) => s + t.amount, 0)
    })
    return entry
  }), [transactions, top5cats, statMonth, catTab])

  // ── 지출분석 탭 ─────────────────────────────────────────────────────────
  const analysisMonth = statMonth

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
        .filter(t => t.date === dateStr && t.type === 'expense' && !isCardPayment(t))
        .reduce((s, t) => s + t.amount, 0)
      cumulative += amt
      return { day: i + 1, 일별: amt, 누적: cumulative }
    })
  }, [transactions, isCardPayment, analysisMonth])

  const dowData = useMemo(() => {
    const DOW = ['일', '월', '화', '수', '목', '금', '토']
    const amounts = Array(7).fill(0)
    const counts  = Array(7).fill(0)
    transactions
      .filter(t => t.date.startsWith(analysisMonth) && t.type === 'expense' && !isCardPayment(t))
      .forEach(t => {
        const dow = new Date(t.date + 'T00:00:00').getDay()
        amounts[dow] += t.amount
        counts[dow]++
      })
    return DOW.map((label, i) => ({ label, amount: amounts[i], count: counts[i] }))
  }, [transactions, isCardPayment, analysisMonth])

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
      저축: s.savingAmt, 카드대금: s.cardPayAmt, 저축률: Math.round(s.savingRate),
    }
  }), [getMonthStats, targetYear])

  let cumSav = 0
  const cumData = annualData.map(d => { cumSav += d.저축; return { ...d, 누적저축: cumSav } })

  const hasData = transactions.length > 0

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
            onClick={() => { setStatMonth(addMonths(statMonth, -1)); setPeriodMode('single'); setShowCustomRange(false) }}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 text-lg transition-colors">
            ‹
          </button>
          <span className="text-sm font-bold text-gray-900">
            {statMonth.split('-')[0]}년 {parseInt(statMonth.split('-')[1])}월
          </span>
          <button
            onClick={() => { setStatMonth(addMonths(statMonth, 1)); setPeriodMode('single'); setShowCustomRange(false) }}
            disabled={statMonth >= currentMonth}
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
              type="month"
              value={rangeStart}
              onChange={e => setRangeStart(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-400 text-sm">~</span>
            <input
              type="month"
              value={rangeEnd}
              max={currentMonth}
              onChange={e => setRangeEnd(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* KPI 카드 4개 */}
      {hasData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            {
              label: '이달 실소비',
              value: fmtShort(thisStats.realConsumption) + '원',
              sub: consumptionDiff === 0 ? '전월과 동일'
                : `전월 대비 ${consumptionDiff > 0 ? '+' : ''}${fmtShort(consumptionDiff)}원`,
              subOk: consumptionDiff <= 0,
              icon: '💸', bg: 'bg-red-50',
            },
            {
              label: '이달 수입',
              value: fmtShort(thisStats.income) + '원',
              sub: lastStats.income > 0
                ? `전월 대비 ${thisStats.income >= lastStats.income ? '+' : ''}${fmtShort(thisStats.income - lastStats.income)}원`
                : '',
              subOk: thisStats.income >= lastStats.income,
              icon: '💰', bg: 'bg-emerald-50',
            },
            {
              label: '이달 저축',
              value: fmtShort(thisStats.savingAmt) + '원',
              sub: thisStats.income > 0 ? `저축률 ${thisStats.savingRate.toFixed(1)}%` : '',
              subOk: true,
              icon: '🏦', bg: 'bg-blue-50',
            },
            {
              label: '저축률',
              value: `${thisStats.savingRate.toFixed(1)}%`,
              sub: savingRateDiff === 0 ? '전월과 동일'
                : `전월 대비 ${savingRateDiff > 0 ? '+' : ''}${savingRateDiff.toFixed(1)}%p`,
              subOk: savingRateDiff >= 0,
              icon: '📊', bg: 'bg-violet-50',
            },
          ].map(kpi => (
            <div key={kpi.label} className={`${kpi.bg} rounded-2xl p-4`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span>{kpi.icon}</span>
                <span className="text-xs text-gray-500">{kpi.label}</span>
              </div>
              <div className="text-lg font-bold text-gray-900 tabular-nums leading-tight">{kpi.value}</div>
              {kpi.sub && (
                <div className={`text-xs mt-1 ${kpi.subOk ? 'text-emerald-500' : 'text-red-400'}`}>{kpi.sub}</div>
              )}
            </div>
          ))}
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
              <div className="text-xs text-gray-400 mb-3">총 지출액을 실소비 · 저축 · 카드대금으로 분리</div>
              {/* 스택 바 */}
              <div className="flex h-5 rounded-full overflow-hidden mb-3">
                {consumptionPct > 0 && <div style={{ width: `${consumptionPct}%`, backgroundColor: '#FF6B6B' }} />}
                {savingPct > 0      && <div style={{ width: `${savingPct}%`,      backgroundColor: '#0064FF' }} />}
                {cardPayPct > 0     && <div style={{ width: `${cardPayPct}%`,     backgroundColor: '#F59E0B' }} />}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '실소비', color: '#FF6B6B', value: thisStats.realConsumption, pct: consumptionPct },
                  { label: '저축',   color: '#0064FF', value: thisStats.savingAmt,       pct: savingPct },
                  { label: '카드대금', color: '#F59E0B', value: thisStats.cardPayAmt,    pct: cardPayPct },
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

          {/* 수입/실소비/저축/카드대금 */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-0.5">최근 6개월 수입 · 실소비 · 저축 · 카드대금</div>
            <div className="text-xs text-gray-400 mb-4">카드대금은 지출과 별도로 분리해서 표시합니다</div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trendData} barGap={2} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip content={<KRWTooltip />} />
                <Legend />
                <Bar dataKey="수입"    fill="#00B493" radius={[4, 4, 0, 0]} />
                <Bar dataKey="실소비"  fill="#FF6B6B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="저축"    fill="#0064FF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="카드대금" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
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
                {statMonth} {catTab === 'expense' ? '지출' : '수입'} 내역이 없습니다
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
            <input type="month" value={statMonth} onChange={e => setStatMonth(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={dowData} barCategoryGap="40%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 13, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v, name) => [name === 'amount' ? fmtKRW(Number(v)) : v + '건', name === 'amount' ? '소비금액' : '건수']} />
                <Bar dataKey="amount" name="소비금액" radius={[5, 5, 0, 0]}>
                  {dowData.map((_, i) => <Cell key={i} fill={i === 0 || i === 6 ? '#FF6B6B' : '#8B5CF6'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-400" /><span className="text-xs text-gray-400">주말</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-violet-500" /><span className="text-xs text-gray-400">평일</span></div>
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
            <div className="font-semibold text-sm text-gray-900 mb-4">{targetYear}년 월별 수입 · 실소비 · 저축 · 카드대금</div>
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
                <Bar dataKey="카드대금" fill="#F59E0B" radius={[4, 4, 0, 0]} />
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
