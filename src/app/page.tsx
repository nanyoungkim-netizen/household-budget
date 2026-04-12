'use client'

import { accounts, transactions, goals, budgets, categories, getMonthlyStats, getCategoryExpenses } from '@/lib/mockData'
import Link from 'next/link'

function formatKRW(amount: number) {
  return amount.toLocaleString('ko-KR') + '원'
}

function formatKRWShort(amount: number) {
  if (Math.abs(amount) >= 100000000) return (amount / 100000000).toFixed(1) + '억원'
  if (Math.abs(amount) >= 10000) return (amount / 10000).toFixed(0) + '만원'
  return amount.toLocaleString('ko-KR') + '원'
}

const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

export default function Dashboard() {
  const stats = getMonthlyStats(currentMonth)
  const catExpenses = getCategoryExpenses(currentMonth)
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)

  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  const totalBudget = budgets
    .filter(b => b.month === currentMonth)
    .reduce((s, b) => s + b.amount, 0)

  const budgetUsed = Object.values(catExpenses).reduce((s, v) => s + v, 0)
  const budgetPct = totalBudget > 0 ? Math.min((budgetUsed / totalBudget) * 100, 100) : 0

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">안녕하세요 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {today.getFullYear()}년 {today.getMonth() + 1}월 현황
          </p>
        </div>
        <Link
          href="/transactions"
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
        >
          <span>+</span> 거래 추가
        </Link>
      </div>

      {/* 총 자산 */}
      <div className="bg-blue-600 rounded-2xl p-5 mb-4 text-white">
        <div className="text-sm font-medium opacity-80 mb-1">총 자산</div>
        <div className="text-3xl font-bold mb-4">{formatKRW(totalBalance)}</div>
        <div className="flex gap-4">
          <div>
            <div className="text-xs opacity-70">이달 수입</div>
            <div className="text-base font-semibold mt-0.5">+{formatKRWShort(stats.income)}</div>
          </div>
          <div className="w-px bg-white/20"></div>
          <div>
            <div className="text-xs opacity-70">이달 지출</div>
            <div className="text-base font-semibold mt-0.5">-{formatKRWShort(stats.expense)}</div>
          </div>
          <div className="w-px bg-white/20"></div>
          <div>
            <div className="text-xs opacity-70">순수입</div>
            <div className="text-base font-semibold mt-0.5">{stats.balance >= 0 ? '+' : ''}{formatKRWShort(stats.balance)}</div>
          </div>
        </div>
      </div>

      {/* 계좌별 잔액 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {accounts.map(acc => (
          <div key={acc.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: acc.color }}></div>
              <span className="text-xs text-gray-500 font-medium">{acc.name}</span>
            </div>
            <div className="text-base font-bold text-gray-900">{formatKRWShort(acc.balance)}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* 예산 현황 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-gray-900 text-sm">이달 예산 현황</div>
            <Link href="/budget" className="text-xs text-blue-600">자세히 →</Link>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>사용 {formatKRWShort(budgetUsed)}</span>
            <span>예산 {formatKRWShort(totalBudget)}</span>
          </div>
          <div className="bg-gray-100 rounded-full h-2 mb-2">
            <div
              className={`h-2 rounded-full transition-all ${budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-amber-400' : 'bg-blue-500'}`}
              style={{ width: `${budgetPct}%` }}
            ></div>
          </div>
          <div className="text-xs text-gray-500">{budgetPct.toFixed(0)}% 사용 · 남은 예산 {formatKRWShort(totalBudget - budgetUsed)}</div>
        </div>

        {/* 재무 목표 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-gray-900 text-sm">재무 목표</div>
            <Link href="/goals" className="text-xs text-blue-600">자세히 →</Link>
          </div>
          {goals.slice(0, 2).map(goal => {
            const pct = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
            const dday = Math.ceil((new Date(goal.deadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            return (
              <div key={goal.id} className="mb-3 last:mb-0">
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-gray-700">{goal.name}</span>
                  <span className="text-gray-400">D-{dday}</span>
                </div>
                <div className="bg-gray-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: goal.color }}
                  ></div>
                </div>
                <div className="text-right text-xs text-gray-400 mt-0.5">{pct.toFixed(1)}%</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 최근 거래 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-gray-900 text-sm">최근 거래</div>
          <Link href="/transactions" className="text-xs text-blue-600">전체보기 →</Link>
        </div>
        <div className="space-y-3">
          {recentTransactions.map(t => {
            const cat = categories.find(c => c.id === t.categoryId)
            const acc = accounts.find(a => a.id === t.accountId)
            return (
              <div key={t.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-base">
                    {cat?.icon}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{t.description}</div>
                    <div className="text-xs text-gray-400">{t.date} · {acc?.name}</div>
                  </div>
                </div>
                <div className={`text-sm font-semibold ${t.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                  {t.type === 'income' ? '+' : '-'}{formatKRW(t.amount)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
