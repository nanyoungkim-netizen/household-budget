'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useApp, getMonthlyStats, getCategoryExpenses, computeAccountBalance } from '@/lib/AppContext'

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

const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

function prevMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
function nextMonth(m: string) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo, 1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return `${y}년 ${mo}월`
}

export default function Dashboard() {
  const { data, categories } = useApp()
  const router = useRouter()
  const { accounts, transactions, goals, budgets, lastModified, isSetupComplete } = data

  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const isCurrentMonth = selectedMonth === currentMonth

  // 초기 설정 미완료 시 온보딩으로
  if (!isSetupComplete) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mb-4">가</div>
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

  const stats = getMonthlyStats(transactions, selectedMonth)
  const catExpenses = getCategoryExpenses(transactions, selectedMonth)

  // 실시간 잔액 (전체 거래 기준 — 월 필터 없음)
  const accountBalances = accounts.map(a => ({
    ...a,
    computed: computeAccountBalance(a.id, a.balance, transactions),
  }))
  const totalBalance = accountBalances.reduce((s, a) => s + a.computed, 0)

  // 선택 월 거래
  const monthTx = transactions
    .filter(t => t.date.startsWith(selectedMonth))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 5)

  // 예산 (선택 월)
  const totalBudget = budgets.filter(b => b.month === selectedMonth).reduce((s, b) => s + b.amount, 0)
  const budgetUsed  = Object.values(catExpenses).reduce((s, v) => s + v, 0)
  const budgetPct   = totalBudget > 0 ? Math.min((budgetUsed / totalBudget) * 100, 100) : 0
  const budgetLeft  = totalBudget - budgetUsed

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">

      {/* 헤더 + 월 선택 */}
      <div className="flex items-center justify-between mb-5">
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

      {/* 월 네비게이터 */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <button onClick={() => setSelectedMonth(prevMonth(selectedMonth))}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition-colors text-lg">
          ‹
        </button>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            max={currentMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="text-sm font-semibold text-gray-800 border-none outline-none bg-transparent text-center cursor-pointer"
          />
          {!isCurrentMonth && (
            <button onClick={() => setSelectedMonth(currentMonth)}
              className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap">
              오늘로
            </button>
          )}
        </div>
        <button
          onClick={() => setSelectedMonth(nextMonth(selectedMonth))}
          disabled={selectedMonth >= currentMonth}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition-colors text-lg disabled:opacity-30 disabled:cursor-not-allowed">
          ›
        </button>
      </div>

      {/* 이달 요약 카드 */}
      <div className="bg-blue-600 rounded-2xl p-5 mb-4 text-white">
        <div className="text-sm font-medium opacity-80 mb-3">{monthLabel(selectedMonth)} 현황</div>

        <div className="grid grid-cols-3 gap-3">
          {/* 수입 */}
          <div className="bg-white/10 rounded-xl p-3">
            <div className="text-xs opacity-70 mb-1">수입</div>
            <div className="text-lg font-bold tabular-nums">+{fmtShort(stats.income)}</div>
          </div>
          {/* 지출 */}
          <div className="bg-white/10 rounded-xl p-3">
            <div className="text-xs opacity-70 mb-1">
              지출{stats.refund > 0 && <span className="ml-1 opacity-60 text-xs">(환급 차감)</span>}
            </div>
            <div className="text-lg font-bold tabular-nums">-{fmtShort(stats.expense)}</div>
            {stats.refund > 0 && (
              <div className="text-xs opacity-60 mt-0.5">환급 -{fmtShort(stats.refund)}</div>
            )}
          </div>
          {/* 순수입 */}
          <div className={`rounded-xl p-3 ${stats.balance >= 0 ? 'bg-emerald-400/30' : 'bg-red-400/30'}`}>
            <div className="text-xs opacity-70 mb-1">순수입</div>
            <div className="text-lg font-bold tabular-nums">
              {stats.balance >= 0 ? '+' : ''}{fmtShort(stats.balance)}
            </div>
          </div>
        </div>

        {/* 총 자산 (현재 기준) */}
        <div className="mt-4 pt-4 border-t border-white/20 flex items-center justify-between">
          <div className="text-xs opacity-70">현재 총 자산</div>
          <div className="text-xl font-bold tabular-nums">{fmtKRW(totalBalance)}</div>
        </div>
      </div>

      {/* 계좌별 실시간 잔액 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        {accountBalances.map(acc => {
          const diff = acc.computed - acc.balance
          return (
            <div key={acc.id} className="bg-white rounded-2xl p-4 shadow-sm" style={{ borderTop: `3px solid ${acc.color}` }}>
              <div className="text-xs text-gray-500 font-medium mb-2">{acc.name}</div>
              <div className="text-xl font-bold text-gray-900 tabular-nums">
                {acc.computed.toLocaleString('ko-KR')}원
              </div>
              {diff !== 0 && (
                <div className={`text-xs mt-1 font-medium ${diff >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                  기초 대비 {diff >= 0 ? '+' : ''}{diff.toLocaleString('ko-KR')}원
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* 예산 현황 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-gray-900 text-sm">{monthLabel(selectedMonth)} 예산</div>
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

      {/* 이달 거래 (선택 월) */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-gray-900 text-sm">
            {isCurrentMonth ? '최근 거래' : `${monthLabel(selectedMonth)} 거래`}
          </div>
          <Link href="/transactions" className="text-xs text-blue-600">전체보기 →</Link>
        </div>
        {monthTx.length > 0 ? (
          <div className="space-y-3">
            {monthTx.map(t => {
              const cat = categories.find(c => c.id === t.categoryId)
              const acc = accounts.find(a => a.id === t.accountId)
              const toAcc = accounts.find(a => a.id === t.toAccountId)
              const isTransfer = t.type === 'transfer'
              const isRefund   = t.type === 'refund'
              return (
                <div key={t.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${
                      isTransfer ? 'bg-blue-50' : isRefund ? 'bg-purple-50' : 'bg-gray-50'
                    }`}>
                      {isTransfer ? '↔️' : isRefund ? '↩️' : cat?.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-gray-900">{t.description}</span>
                        {isRefund && <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-md font-medium">환급</span>}
                      </div>
                      <div className="text-xs text-gray-400">
                        {t.date}
                        {isTransfer ? ` · ${acc?.name} → ${toAcc?.name}` : ` · ${acc?.name}`}
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-semibold tabular-nums ${
                    isTransfer  ? 'text-blue-500' :
                    isRefund    ? 'text-purple-600' :
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
            <p className="text-sm">{monthLabel(selectedMonth)} 거래 내역이 없어요</p>
            <Link href="/transactions" className="text-xs text-blue-500 underline mt-1 block">거래 추가하기</Link>
          </div>
        )}
      </div>
    </div>
  )
}
