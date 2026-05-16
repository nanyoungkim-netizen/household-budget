'use client'

import { useState, useRef } from 'react'
import { useApp } from '@/lib/AppContext'
import { Goal, GoalCategory, GoalPayment } from '@/types'
import DeleteConfirmModal from '@/components/DeleteConfirmModal'

const TOAST_GOAL_SAVE = [
  '목표에 한 걸음 더 가까워졌어요 🎯',
  '꾸준함이 목표를 이루는 가장 빠른 길이에요 🚀',
  '차곡차곡 쌓이고 있어요! 잘 하고 있어요 💪',
  '밤티가 응원하고 있어요! 파이팅 🐿️',
  '오늘의 저축이 미래의 선물이에요 🎁',
  '목표 달성이 점점 현실이 되고 있어요 ✨',
  '포기하지 않으면 반드시 이뤄져요 🌟',
  '작은 금액도 쌓이면 큰 힘이 돼요 💰',
  '오늘도 미래의 나에게 투자했어요 📈',
  '저금 완료! 목표가 성큼 가까워졌어요 🏆',
  '한 번에 다 못 해도 괜찮아요, 조금씩이 최고예요 🌱',
  '이 돈이 나중에 얼마나 큰 기쁨이 될지 기대돼요 😊',
]
const TOAST_GOAL_WITHDRAW = [
  '출금 기록 완료! 잘 쓰고 오세요 👋',
  '필요할 때 쓰는 게 목표를 만드는 이유예요 😊',
  '잘 활용하셨길 바라요! 다시 채워봐요 💪',
  '밤티가 기록했어요. 잘 쓰고 오세요 🐿️',
]

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function parseAmt(s: string): number { return parseInt(s.replace(/[^0-9]/g, '')) || 0 }
function fmtInput(s: string): string { const n = parseAmt(s); return n === 0 ? '' : n.toLocaleString('ko-KR') }
function fmtShort(n: number) {
  if (n >= 100000000) return (n/100000000).toFixed(1)+'억'
  if (n >= 10000) return (n/10000).toFixed(0)+'만'
  return n.toLocaleString()
}
function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${y}.${m}.${day}`
}

const PRESET_COLORS = ['#0064FF','#00B493','#FF6B6B','#FFB800','#9B59B6','#E67E22','#1ABC9C','#E74C3C']

const GOAL_CATEGORIES: { value: GoalCategory; label: string; icon: string }[] = [
  { value: 'travel',    label: '여행',     icon: '✈️' },
  { value: 'wedding',   label: '결혼',     icon: '💍' },
  { value: 'emergency', label: '비상금',   icon: '🛡️' },
  { value: 'housing',   label: '내집마련', icon: '🏠' },
  { value: 'car',       label: '자동차',   icon: '🚗' },
  { value: 'education', label: '교육',     icon: '📚' },
  { value: 'other',     label: '기타',     icon: '🎯' },
]

const today = new Date()
const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
const currentMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

type FormState = {
  name: string
  targetAmount: string
  currentAmount: string
  deadline: string
  targetDate: string
  startDate: string
  goalCategory: GoalCategory
  color: string
}

const EMPTY_FORM: FormState = {
  name: '',
  targetAmount: '',
  currentAmount: '',
  deadline: '',
  targetDate: '',
  startDate: currentMonth,
  goalCategory: 'other',
  color: '#0064FF',
}

function targetDateToDeadline(targetDate: string): string {
  const [y, m] = targetDate.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

export default function GoalsPage() {
  const { data, setGoals, setGoalPayments } = useApp()
  const { goals, goalPayments = [] } = data

  const [toast, setToast] = useState<{ msg: string; type: 'save' | 'withdraw' } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(type: 'save' | 'withdraw') {
    const list = type === 'save' ? TOAST_GOAL_SAVE : TOAST_GOAL_WITHDRAW
    const msg = list[Math.floor(Math.random() * list.length)]
    setToast({ msg, type })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // 납입 이력 토글 (goalId set)
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())

  // 납입 추가 모달
  const [paymentGoalId, setPaymentGoalId] = useState<string | null>(null)
  const [paymentType, setPaymentType] = useState<'save' | 'withdraw'>('save')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(todayStr)
  const [paymentNote, setPaymentNote] = useState('')

  function getDday(d: string) {
    if (!d) return null
    const diff = Math.ceil((new Date(d).getTime()-today.getTime())/(1000*60*60*24))
    if (diff < 0) return '기한 초과'
    if (diff === 0) return 'D-Day'
    return `D-${diff}`
  }

  function getMonthsLeft(targetDate: string, fromDate?: string): number {
    if (!targetDate) return 0
    const [y, m] = targetDate.split('-').map(Number)
    const from = fromDate && fromDate > currentMonth ? fromDate : currentMonth
    const [fy, fm] = from.split('-').map(Number)
    return Math.max(1, (y - fy) * 12 + (m - fm))
  }

  function getEffectiveCurrent(goal: Goal): number {
    const payments = goalPayments.filter(p => p.goalId === goal.id)
    const paymentSum = payments.reduce((s, p) => s + p.amount, 0)
    return goal.currentAmount + paymentSum
  }

  function getRecommendedMonthly(goal: Goal, effectiveCurrent: number): number {
    const months = goal.targetDate
      ? getMonthsLeft(goal.targetDate, goal.startDate)
      : (goal.deadline ? Math.ceil((new Date(goal.deadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30)) : 0)
    if (months <= 0) return 0
    return Math.ceil((goal.targetAmount - effectiveCurrent) / months)
  }

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(goal: Goal) {
    setEditingId(goal.id)
    setForm({
      name: goal.name,
      targetAmount: fmtInput(String(goal.targetAmount)),
      currentAmount: fmtInput(String(goal.currentAmount)),
      deadline: goal.deadline || '',
      targetDate: goal.targetDate || '',
      startDate: goal.startDate || currentMonth,
      goalCategory: goal.goalCategory || 'other',
      color: goal.color,
    })
    setShowModal(true)
  }

  function handleSave() {
    if (!form.name || !form.targetAmount) return
    const newGoal: Goal = {
      id: editingId || `g${Date.now()}`,
      name: form.name,
      targetAmount: parseAmt(form.targetAmount),
      currentAmount: parseAmt(form.currentAmount) || 0,
      deadline: form.deadline,
      color: form.color,
      goalCategory: form.goalCategory,
      targetDate: form.targetDate || undefined,
      startDate: form.startDate || undefined,
    }
    if (editingId) {
      setGoals(goals.map(g => g.id === editingId ? newGoal : g))
    } else {
      setGoals([...goals, newGoal])
    }
    setShowModal(false)
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  function handleDelete(id: string) {
    setGoals(goals.filter(g => g.id !== id))
    setGoalPayments(goalPayments.filter(p => p.goalId !== id))
    setDeleteConfirmId(null)
  }

  function openPaymentModal(goalId: string) {
    setPaymentGoalId(goalId)
    setPaymentType('save')
    setPaymentAmount('')
    setPaymentDate(todayStr)
    setPaymentNote('')
  }

  function handleAddPayment() {
    const amt = parseAmt(paymentAmount)
    if (!paymentGoalId || amt <= 0) return
    const payment: GoalPayment = {
      id: `gp${Date.now()}`,
      goalId: paymentGoalId,
      date: paymentDate,
      amount: paymentType === 'save' ? amt : -amt,
      note: paymentNote || undefined,
    }
    setGoalPayments([...goalPayments, payment])
    setPaymentGoalId(null)
    showToast(paymentType === 'save' ? 'save' : 'withdraw')
  }

  function handleDeletePayment(id: string) {
    setGoalPayments(goalPayments.filter(p => p.id !== id))
  }

  function toggleHistory(goalId: string) {
    setExpandedHistory(prev => {
      const next = new Set(prev)
      if (next.has(goalId)) next.delete(goalId)
      else next.add(goalId)
      return next
    })
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">재무 목표</h1>
        <button onClick={openAdd} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">+ 목표 추가</button>
      </div>

      <div className="space-y-4">
        {goals.map(goal => {
          const effectiveCurrent = getEffectiveCurrent(goal)
          const pct = Math.min(effectiveCurrent / goal.targetAmount * 100, 100)
          const dday = goal.deadline ? getDday(goal.deadline) : null
          const remaining = goal.targetAmount - effectiveCurrent
          const isDone = pct >= 100
          const daysLeft = goal.deadline ? Math.ceil((new Date(goal.deadline).getTime()-today.getTime())/(1000*60*60*24)) : 0
          const monthlyNeeded = getRecommendedMonthly(goal, effectiveCurrent)
          const catMeta = GOAL_CATEGORIES.find(c => c.value === (goal.goalCategory || 'other'))
          const payments = goalPayments.filter(p => p.goalId === goal.id).sort((a, b) => b.date.localeCompare(a.date))
          const isHistoryExpanded = expandedHistory.has(goal.id)

          const scenarios = [6, 12, 24].map(months => ({
            months,
            monthly: Math.ceil(remaining / months),
          })).filter(s => s.monthly > 0)

          return (
            <div key={goal.id} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between mb-4 gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: goal.color + '20', color: goal.color }}>
                    {catMeta?.icon || '🎯'}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-gray-900 truncate">{goal.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {catMeta && <span className="text-xs text-gray-400">{catMeta.label}</span>}
                      {dday && <span className={`text-xs font-medium ${daysLeft < 30 && !isDone ? 'text-red-500' : 'text-gray-400'}`}>{dday}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openEdit(goal)} className="text-xs text-gray-400 hover:text-blue-500 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">✏️ 수정</button>
                  <button onClick={() => setDeleteConfirmId(goal.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">🗑️ 삭제</button>
                </div>
              </div>

              <div className="flex items-end justify-between mb-3">
                <div>
                  <div className="text-2xl font-bold" style={{ color: goal.color }}>{fmtShort(effectiveCurrent)}원</div>
                  <div className="text-sm text-gray-400">목표 {fmtKRW(goal.targetAmount)}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">{pct.toFixed(1)}%</div>
                  {isDone ? <div className="text-sm text-emerald-600 font-medium">달성 완료! 🎉</div>
                    : <div className="text-sm text-gray-400">남은 금액 {fmtShort(remaining)}원</div>}
                </div>
              </div>

              <div className="bg-gray-100 rounded-full h-3 mb-4 overflow-hidden">
                <div className="h-3 rounded-full transition-all duration-500" style={{ width:`${pct}%`, backgroundColor: goal.color }} />
              </div>

              {/* 추천 월 납입액 섹션 */}
              {!isDone && monthlyNeeded > 0 && (
                <div className="bg-blue-50 rounded-xl p-4 mb-4">
                  <div className="text-xs font-semibold text-blue-700 mb-2">💡 추천 월 납입액</div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-lg font-bold text-blue-800">{fmtKRW(monthlyNeeded)}/월</div>
                      {goal.targetDate && (
                        <div className="text-xs text-blue-500 mt-0.5">
                          {goal.startDate
                            ? `${goal.startDate.replace('-', '년 ')}월 ~ ${goal.targetDate.replace('-', '년 ')}월`
                            : `${goal.targetDate.replace('-', '년 ')}월까지 달성 가능`}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-blue-500">
                      <div>남은 금액</div>
                      <div className="font-semibold">{fmtKRW(remaining)}</div>
                    </div>
                  </div>
                  {scenarios.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {scenarios.map(s => (
                        <div key={s.months} className="bg-white rounded-lg p-2 text-center">
                          <div className="text-[10px] text-gray-400">{s.months}개월</div>
                          <div className="text-xs font-bold text-gray-800">{fmtShort(s.monthly)}/월</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 납입 버튼 + 이력 토글 */}
              <div className="flex gap-2">
                <button onClick={() => openPaymentModal(goal.id)}
                  className="flex-1 text-sm font-medium text-white rounded-xl py-2 transition-colors"
                  style={{ backgroundColor: goal.color }}>
                  + 기록하기
                </button>
                {payments.length > 0 && (
                  <button onClick={() => toggleHistory(goal.id)}
                    className="flex items-center gap-1 px-3 py-2 text-xs text-gray-500 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                    이력 {payments.length}건
                    <span className="text-[10px]">{isHistoryExpanded ? '▲' : '▼'}</span>
                  </button>
                )}
              </div>

              {/* 납입 이력 목록 */}
              {isHistoryExpanded && payments.length > 0 && (
                <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
                  {payments.map((p, i) => {
                    const isSave = p.amount >= 0
                    return (
                      <div key={p.id} className={`flex items-center justify-between px-3 py-2.5 text-sm ${i !== 0 ? 'border-t border-gray-100' : ''}`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isSave ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-400'}`}>
                            {isSave ? '🐿️ 모았어요' : '🏃 출금했어요'}
                          </span>
                          <span className="text-xs text-gray-400">{fmtDate(p.date)}</span>
                          {p.note && <span className="text-xs text-gray-300">· {p.note}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold text-sm ${isSave ? 'text-emerald-600' : 'text-red-400'}`}>
                            {isSave ? '+' : '-'}{fmtKRW(Math.abs(p.amount))}
                          </span>
                          <button onClick={() => handleDeletePayment(p.id)}
                            className="text-gray-300 hover:text-red-400 text-xs px-1 transition-colors">✕</button>
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
                    <span className="text-xs text-gray-400">누적 합계</span>
                    <span className="text-xs font-bold text-gray-700">{fmtKRW(payments.reduce((s, p) => s + p.amount, 0))}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {goals.length === 0 && <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-2">🎯</div><div className="text-sm">재무 목표를 설정해보세요!</div></div>}
      </div>

      {/* 목표 추가/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editingId ? '목표 수정' : '목표 추가'}</h2>
              <button onClick={() => { setShowModal(false); setEditingId(null) }} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <input type="text" placeholder="목표 이름 *" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">목표 금액 *</label>
                  <input type="text" inputMode="numeric" placeholder="0원" value={form.targetAmount}
                    onChange={e => setForm(f => ({ ...f, targetAmount: fmtInput(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">현재 보유액</label>
                  <input type="text" inputMode="numeric" placeholder="0원" value={form.currentAmount}
                    onChange={e => setForm(f => ({ ...f, currentAmount: fmtInput(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">목표 시작 월</label>
                  <input type="month" min="1900-01" max="2099-12" value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">목표 달성 월</label>
                  <input type="month" min="1900-01" max="2099-12" value={form.targetDate}
                    onChange={e => {
                      const val = e.target.value
                      setForm(f => ({
                        ...f,
                        targetDate: val,
                        deadline: val ? targetDateToDeadline(val) : f.deadline,
                      }))
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* 추천 납입액 미리보기 */}
              {form.targetDate && form.targetAmount && (() => {
                const target = parseAmt(form.targetAmount)
                const current = parseAmt(form.currentAmount) || 0
                const months = getMonthsLeft(form.targetDate, form.startDate)
                const monthly = months > 0 ? Math.ceil((target - current) / months) : 0
                const periodLabel = form.startDate
                  ? `${form.startDate.replace('-', '년 ')}월 ~ ${form.targetDate.replace('-', '년 ')}월`
                  : `${months}개월`
                return monthly > 0 ? (
                  <div className="bg-blue-50 rounded-xl p-3 text-xs">
                    <span className="text-blue-600 font-medium">💡 추천 월 납입액: </span>
                    <span className="text-blue-800 font-bold">{fmtKRW(monthly)}/월</span>
                    <span className="text-blue-500 ml-1">({periodLabel}, {months}개월)</span>
                  </div>
                ) : null
              })()}

              <div>
                <label className="text-xs text-gray-400 block mb-1.5">목표 카테고리</label>
                <div className="flex flex-wrap gap-1.5">
                  {GOAL_CATEGORIES.map(c => (
                    <button key={c.value} onClick={() => setForm(f => ({ ...f, goalCategory: c.value }))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                        form.goalCategory === c.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                      }`}>
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`w-8 h-8 rounded-xl transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : ''}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                {editingId && (
                  <button onClick={() => setDeleteConfirmId(editingId)}
                    className="px-4 py-3 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">
                    삭제
                  </button>
                )}
                <button onClick={handleSave}
                  className="flex-1 bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors">
                  {editingId ? '수정 완료' : '추가하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 납입 추가 모달 */}
      {paymentGoalId && (() => {
        const goal = goals.find(g => g.id === paymentGoalId)
        if (!goal) return null
        const isSave = paymentType === 'save'
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-base font-bold">이력 기록</h2>
                <button onClick={() => setPaymentGoalId(null)} className="text-gray-400 text-xl leading-none">×</button>
              </div>
              <div className="text-xs text-gray-400 mb-4">{goal.name}</div>
              <div className="space-y-3">
                {/* 모았어요 / 출금했어요 선택 */}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setPaymentType('save')}
                    className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${isSave ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-100 bg-gray-50 text-gray-400'}`}>
                    🐿️ 모았어요
                  </button>
                  <button onClick={() => setPaymentType('withdraw')}
                    className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${!isSave ? 'border-red-300 bg-red-50 text-red-500' : 'border-gray-100 bg-gray-50 text-gray-400'}`}>
                    🏃 출금했어요
                  </button>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">금액 *</label>
                  <input type="text" inputMode="numeric" placeholder="0원" value={paymentAmount}
                    onChange={e => setPaymentAmount(fmtInput(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">날짜</label>
                  <input type="date" min="1900-01-01" max="2099-12-31" value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">메모 (선택)</label>
                  <input type="text" placeholder="예: 월급에서 이체" value={paymentNote}
                    onChange={e => setPaymentNote(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <button onClick={handleAddPayment}
                  className={`w-full font-semibold py-3 rounded-xl transition-colors text-white ${isSave ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-400 hover:bg-red-500'}`}>
                  {isSave ? '🐿️ 모았어요!' : '🏃 출금했어요!'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {deleteConfirmId && (
        <DeleteConfirmModal
          onConfirm={() => handleDelete(deleteConfirmId)}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {/* 납입 등록 토스트 */}
      {toast && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className={`flex flex-col items-center gap-1 px-5 py-3 rounded-2xl shadow-lg text-white text-center animate-fade-in
            ${toast.type === 'save' ? 'bg-blue-500' : 'bg-amber-500'}`}>
            <span className="text-base font-bold">밤티 등록! 🐿️</span>
            <span className="text-xs opacity-90">{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  )
}
