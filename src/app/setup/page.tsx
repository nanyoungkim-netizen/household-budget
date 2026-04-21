'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { flushSync } from 'react-dom'
import { useApp, DEFAULT_ACCOUNTS, DEFAULT_CARDS } from '@/lib/AppContext'
import { Account, Saving, Goal } from '@/types'

// FR-016: 쉼표 포맷 헬퍼
function parseNum(s: string) { return Number(s.replace(/,/g, '')) || 0 }
function fmtComma(n: number) { return n === 0 ? '' : n.toLocaleString('ko-KR') }

const STEPS = ['계좌 잔액', '적금·예금', '재무 목표', '완료']

export default function SetupPage() {
  const { completeSetup } = useApp()
  const router = useRouter()
  const [step, setStep] = useState(0)

  // Step 0 - 계좌 잔액
  const [accounts, setAccounts] = useState<Account[]>(
    DEFAULT_ACCOUNTS.map(a => ({ ...a }))
  )
  // FR-016: 표시용 문자열 상태 (쉼표 포함)
  const [balanceInputs, setBalanceInputs] = useState<Record<string, string>>(
    Object.fromEntries(DEFAULT_ACCOUNTS.map(a => [a.id, '']))
  )
  // FR-014: 계좌명 인라인 수정
  const [editingAccName, setEditingAccName] = useState<string | null>(null)
  const [accNameInput, setAccNameInput] = useState('')

  // Step 1 - 적금·예금
  const [savings, setSavings] = useState<Saving[]>([])
  const [savingForm, setSavingForm] = useState({
    name: '', bank: '', type: 'saving' as 'saving' | 'deposit',
    monthlyAmount: '', interestRate: '', startDate: '', maturityDate: '', currentAmount: '',
  })

  // Step 2 - 재무 목표
  const [goals, setGoals] = useState<Goal[]>([])
  const [goalForm, setGoalForm] = useState({
    name: '', targetAmount: '', currentAmount: '', deadline: '', color: '#0064FF',
  })

  const PRESET_COLORS = ['#0064FF', '#00B493', '#FF6B6B', '#FFB800', '#9B59B6', '#E67E22']

  // FR-014: 계좌명 수정
  function saveAccName(id: string) {
    const name = accNameInput.trim()
    if (name) setAccounts(prev => prev.map(a => a.id === id ? { ...a, name } : a))
    setEditingAccName(null)
  }

  // FR-016: 잔액 입력 — 실시간 쉼표 포맷
  function updateBalance(id: string, rawVal: string) {
    const digits = rawVal.replace(/[^0-9]/g, '')
    const num = Number(digits) || 0
    setBalanceInputs(prev => ({ ...prev, [id]: digits === '' ? '' : num.toLocaleString('ko-KR') }))
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, balance: num } : a))
  }

  function addSaving() {
    if (!savingForm.name || !savingForm.bank) return
    const cur = parseNum(savingForm.currentAmount)
    const rate = Number(savingForm.interestRate) || 0
    setSavings(prev => [...prev, {
      id: `s${Date.now()}`,
      name: savingForm.name,
      bank: savingForm.bank,
      type: savingForm.type,
      monthlyAmount: parseNum(savingForm.monthlyAmount),
      interestRate: rate,
      startDate: savingForm.startDate,
      maturityDate: savingForm.maturityDate,
      currentAmount: cur,
      expectedAmount: cur * (1 + rate / 100),
    }])
    setSavingForm({ name: '', bank: '', type: 'saving', monthlyAmount: '', interestRate: '', startDate: '', maturityDate: '', currentAmount: '' })
  }

  function addGoal() {
    if (!goalForm.name || !goalForm.targetAmount) return
    setGoals(prev => [...prev, {
      id: `g${Date.now()}`,
      name: goalForm.name,
      targetAmount: parseNum(goalForm.targetAmount),
      currentAmount: parseNum(goalForm.currentAmount),
      deadline: goalForm.deadline,
      color: goalForm.color,
    }])
    setGoalForm({ name: '', targetAmount: '', currentAmount: '', deadline: '', color: '#0064FF' })
  }

  // FR-014: flushSync으로 상태를 즉시 커밋한 뒤 라우팅
  function finish() {
    flushSync(() => {
      completeSetup({
        accounts,
        cards: DEFAULT_CARDS,
        savings,
        goals,
        transactions: [],
        budgets: [],
        installments: [],
      })
    })
    router.push('/')
  }

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-8 px-4">
      <div className="w-full max-w-lg">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">가</div>
          <h1 className="text-xl font-bold text-gray-900">가계부 초기 설정</h1>
          <p className="text-sm text-gray-500 mt-1">현재 보유 중인 금액을 입력해주세요</p>
        </div>

        {/* 단계 표시 */}
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((_, i) => (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div className={`flex-1 h-1.5 rounded-full transition-all ${i <= step ? 'bg-blue-600' : 'bg-gray-200'}`} />
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-400 text-center mb-6">
          {step + 1} / {STEPS.length} — {STEPS[step]}
        </div>

        {/* STEP 0: 계좌 잔액 */}
        {step === 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h2 className="font-bold text-gray-900 mb-1">계좌별 현재 잔액</h2>
            <p className="text-xs text-gray-400 mb-4">오늘 기준 각 통장의 실제 잔액을 입력해주세요.</p>
            <div className="space-y-3">
              {accounts.map(acc => (
                <div key={acc.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: acc.color }}>
                    {acc.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    {/* FR-014: 계좌명 인라인 수정 */}
                    {editingAccName === acc.id ? (
                      <input
                        type="text"
                        value={accNameInput}
                        onChange={e => setAccNameInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveAccName(acc.id); if (e.key === 'Escape') setEditingAccName(null) }}
                        onBlur={() => saveAccName(acc.id)}
                        className="w-full text-sm font-medium border-b-2 border-blue-400 bg-transparent outline-none mb-1"
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-sm font-medium text-gray-900">{acc.name}</span>
                        <button onClick={() => { setEditingAccName(acc.id); setAccNameInput(acc.name) }}
                          className="text-xs text-gray-300 hover:text-blue-400 transition-colors">✏️</button>
                      </div>
                    )}
                    {/* FR-016: type="text" + inputMode="numeric" + 쉼표 포맷 */}
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={balanceInputs[acc.id] ?? ''}
                        onChange={e => updateBalance(acc.id, e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {totalBalance > 0 && (
              <div className="mt-4 bg-blue-50 rounded-xl p-3 text-center">
                <span className="text-xs text-gray-500">총 잔액 </span>
                <span className="text-sm font-bold text-blue-600">{fmtComma(totalBalance)}원</span>
              </div>
            )}
          </div>
        )}

        {/* STEP 1: 적금·예금 */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="font-bold text-gray-900 mb-1">적금·예금 추가</h2>
              <p className="text-xs text-gray-400 mb-4">현재 가입 중인 적금·예금을 등록해주세요. (선택사항)</p>
              <div className="space-y-2">
                <div className="flex bg-gray-100 rounded-xl p-1">
                  {(['saving', 'deposit'] as const).map(t => (
                    <button key={t} onClick={() => setSavingForm(f => ({ ...f, type: t }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${savingForm.type === t ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
                      {t === 'saving' ? '적금' : '예금'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="이름 (예: 주택청약)" value={savingForm.name}
                    onChange={e => setSavingForm(f => ({ ...f, name: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="text" placeholder="은행명" value={savingForm.bank}
                    onChange={e => setSavingForm(f => ({ ...f, bank: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" inputMode="numeric" placeholder="현재 금액 (원)" value={savingForm.currentAmount}
                    onChange={e => setSavingForm(f => ({ ...f, currentAmount: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="number" placeholder="연 이율 (%)" value={savingForm.interestRate}
                    onChange={e => setSavingForm(f => ({ ...f, interestRate: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 mb-0.5 block">가입일</label>
                    <input type="date" value={savingForm.startDate}
                      onChange={e => setSavingForm(f => ({ ...f, startDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-0.5 block">만기일</label>
                    <input type="date" value={savingForm.maturityDate}
                      onChange={e => setSavingForm(f => ({ ...f, maturityDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <button onClick={addSaving}
                  className="w-full bg-blue-50 text-blue-600 text-sm font-medium py-2.5 rounded-xl hover:bg-blue-100 transition-colors">
                  + 추가
                </button>
              </div>
            </div>

            {savings.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
                {savings.map(s => (
                  <div key={s.id} className="flex items-center justify-between">
                    <div>
                      <span className={`text-xs px-2 py-0.5 rounded-md font-medium mr-2 ${s.type === 'saving' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                        {s.type === 'saving' ? '적금' : '예금'}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{s.name}</span>
                      <span className="text-xs text-gray-400 ml-1">· {s.bank}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{s.currentAmount.toLocaleString('ko-KR')}원</span>
                      <button onClick={() => setSavings(prev => prev.filter(x => x.id !== s.id))}
                        className="text-gray-300 hover:text-red-400 text-xs">삭제</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: 재무 목표 */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="font-bold text-gray-900 mb-1">재무 목표 추가</h2>
              <p className="text-xs text-gray-400 mb-4">달성하고 싶은 재무 목표를 등록해주세요. (선택사항)</p>
              <div className="space-y-2">
                <input type="text" placeholder="목표 이름 (예: 1억 모으기)" value={goalForm.name}
                  onChange={e => setGoalForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" inputMode="numeric" placeholder="목표 금액" value={goalForm.targetAmount}
                    onChange={e => setGoalForm(f => ({ ...f, targetAmount: fmtComma(parseNum(e.target.value)) }))}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="text" inputMode="numeric" placeholder="현재 금액" value={goalForm.currentAmount}
                    onChange={e => setGoalForm(f => ({ ...f, currentAmount: fmtComma(parseNum(e.target.value)) }))}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-0.5 block">목표 기한</label>
                  <input type="date" value={goalForm.deadline}
                    onChange={e => setGoalForm(f => ({ ...f, deadline: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-2">색상</div>
                  <div className="flex gap-2">
                    {PRESET_COLORS.map(c => (
                      <button key={c} onClick={() => setGoalForm(f => ({ ...f, color: c }))}
                        className={`w-8 h-8 rounded-xl transition-transform ${goalForm.color === c ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : ''}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
                <button onClick={addGoal}
                  className="w-full bg-blue-50 text-blue-600 text-sm font-medium py-2.5 rounded-xl hover:bg-blue-100 transition-colors">
                  + 추가
                </button>
              </div>
            </div>

            {goals.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
                {goals.map(g => {
                  const pct = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount * 100).toFixed(1) : '0'
                  return (
                    <div key={g.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }} />
                        <span className="text-sm font-medium text-gray-900">{g.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{pct}%</span>
                        <span className="text-sm font-bold text-gray-900">{g.currentAmount.toLocaleString('ko-KR')}원</span>
                        <button onClick={() => setGoals(prev => prev.filter(x => x.id !== g.id))}
                          className="text-gray-300 hover:text-red-400 text-xs">삭제</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 버튼 */}
        <div className="flex gap-3 mt-6">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              className="flex-1 bg-gray-100 text-gray-600 text-sm font-medium py-3.5 rounded-xl hover:bg-gray-200 transition-colors">
              이전
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)}
              className="flex-1 bg-blue-600 text-white text-sm font-semibold py-3.5 rounded-xl hover:bg-blue-700 transition-colors">
              다음
            </button>
          ) : (
            <button onClick={finish}
              className="flex-1 bg-blue-600 text-white text-sm font-semibold py-3.5 rounded-xl hover:bg-blue-700 transition-colors">
              🎉 시작하기
            </button>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          나중에 설정하려면{' '}
          <button onClick={finish} className="text-blue-500 underline">건너뛰기</button>
        </p>
      </div>
    </div>
  )
}
