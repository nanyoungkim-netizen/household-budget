'use client'

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

export default function Dashboard() {
  const { data, categories } = useApp()
  const router = useRouter()
  const { accounts, transactions, goals, budgets, lastModified, isSetupComplete } = data

  // 초기 설정 미완료 시 온보딩으로
  if (!isSetupComplete) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mb-4">가</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">가계부에 오신 걸 환영해요!</h1>
        <p className="text-sm text-gray-500 mb-6">시작 전 현재 보유 금액을 설정해드릴게요.</p>
        <button
          onClick={() => router.push('/setup')}
          className="bg-blue-600 text-white font-semibold px-8 py-3.5 rounded-2xl hover:bg-blue-700 transition-colors"
        >
          기초값 설정하기
        </button>
        <button onClick={() => router.push('/setup')} className="mt-3 text-xs text-gray-400 underline">
          건너뛰기
        </button>
      </div>
    )
  }

  const stats = getMonthlyStats(transactions, currentMonth)
  const catExpenses = getCategoryExpenses(transactions, currentMonth)

  // 실시간 잔액: 기초잔액 + 전체 거래 반영
  const accountBalances = accounts.map(a => ({
    ...a,
    computed: computeAccountBalance(a.id, a.balance, transactions),
  }))
  const totalBalance = accountBalances.reduce((s, a) => s + a.computed, 0)

  const recentTx = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  const totalBudget = budgets.filter(b => b.month === currentMonth).reduce((s, b) => s + b.amount, 0)
  const budgetUsed = Object.values(catExpenses).reduce((s, v) => s + v, 0)
  const budgetPct = totalBudget > 0 ? Math.min((budgetUsed / totalBudget) * 100, 100) : 0

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">안녕하세요 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {today.getFullYear()}년 {today.getMonth()+1}월 현황
          </p>
        </div>
        <Link
          href="/transactions"
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
        >
          + 거래 추가
        </Link>
      </div>

      {/* 마지막 수정일 */}
      {lastModified && (
        <div className="flex items-center gap-1.5 mb-4 text-xs text-gray-400">
          <span>🕐</span>
          <span>마지막 수정: {fmtDate(lastModified)}</span>
        </div>
      )}

      {/* 총 자산 */}
      <div className="bg-blue-600 rounded-2xl p-5 mb-4 text-white">
        <div className="text-sm font-medium opacity-80 mb-1">총 자산</div>
        <div className="text-3xl font-bold mb-4">{fmtKRW(totalBalance)}</div>
        <div className="flex gap-4 flex-wrap">
          <div>
            <div className="text-xs opacity-70">이달 수입</div>
            <div className="text-base font-semibold mt-0.5">+{fmtShort(stats.income)}</div>
          </div>
          <div className="w-px bg-white/20"></div>
          <div>
            <div className="text-xs opacity-70">이달 지출</div>
            <div className="text-base font-semibold mt-0.5">-{fmtShort(stats.expense)}</div>
          </div>
          <div className="w-px bg-white/20"></div>
          <div>
            <div className="text-xs opacity-70">순수입</div>
            <div className="text-base font-semibold mt-0.5">{stats.balance >= 0 ? '+' : ''}{fmtShort(stats.balance)}</div>
          </div>
        </div>
      </div>

      {/* 계좌별 실시간 잔액 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        {accountBalances.map(acc => {
          const diff = acc.computed - acc.balance  // 기초잔액 대비 변화
          return (
            <div key={acc.id} className="bg-white rounded-2xl p-4 shadow-sm" style={{ borderTop: `3px solid ${acc.color}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 font-medium">{acc.name}</span>
                <span className="text-xs text-gray-300">{acc.bank}</span>
              </div>
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
            <div className="font-semibold text-gray-900 text-sm">이달 예산 현황</div>
            <Link href="/budget" className="text-xs text-blue-600">자세히 →</Link>
          </div>
          {totalBudget > 0 ? (
            <>
              <div className="flex justify-between text-xs text-gray-500 mb-2">
                <span>사용 {fmtShort(budgetUsed)}</span>
                <span>예산 {fmtShort(totalBudget)}</span>
              </div>
              <div className="bg-gray-100 rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full transition-all ${budgetPct > 90 ? 'bg-red-500' : budgetPct > 70 ? 'bg-amber-400' : 'bg-blue-500'}`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
              <div className="text-xs text-gray-500">{budgetPct.toFixed(0)}% 사용 · 남은 예산 {fmtShort(totalBudget - budgetUsed)}</div>
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

      {/* 최근 거래 */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-gray-900 text-sm">최근 거래</div>
          <Link href="/transactions" className="text-xs text-blue-600">전체보기 →</Link>
        </div>
        {recentTx.length > 0 ? (
          <div className="space-y-3">
            {recentTx.map(t => {
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
                    {t.type === 'income' ? '+' : '-'}{fmtKRW(t.amount)}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm">아직 거래 내역이 없어요</p>
            <Link href="/transactions" className="text-xs text-blue-500 underline mt-1 block">첫 거래 추가하기</Link>
          </div>
        )}
      </div>
    </div>
  )
}
