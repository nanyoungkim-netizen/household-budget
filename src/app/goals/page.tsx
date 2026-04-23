'use client'

import { useState } from 'react'
import { useApp } from '@/lib/AppContext'
import { Goal, GoalCategory } from '@/types'
import DeleteConfirmModal from '@/components/DeleteConfirmModal'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function parseAmt(s: string): number { return parseInt(s.replace(/[^0-9]/g, '')) || 0 }
function fmtInput(s: string): string { const n = parseAmt(s); return n === 0 ? '' : n.toLocaleString('ko-KR') }
function fmtShort(n: number) {
  if (n >= 100000000) return (n/100000000).toFixed(1)+'억'
  if (n >= 10000) return (n/10000).toFixed(0)+'만'
  return n.toLocaleString()
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
const currentMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

type FormState = {
  name: string
  targetAmount: string
  currentAmount: string
  deadline: string
  targetDate: string
  goalCategory: GoalCategory
  color: string
}

const EMPTY_FORM: FormState = {
  name: '',
  targetAmount: '',
  currentAmount: '',
  deadline: '',
  targetDate: '',
  goalCategory: 'other',
  color: '#0064FF',
}

export default function GoalsPage() {
  const { data, setGoals } = useApp()
  const { goals } = data

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  function getDday(d: string) {
    if (!d) return null
    const diff = Math.ceil((new Date(d).getTime()-today.getTime())/(1000*60*60*24))
    if (diff < 0) return '기한 초과'
    if (diff === 0) return 'D-Day'
    return `D-${diff}`
  }

  function getMonthsLeft(targetDate: string): number {
    if (!targetDate) return 0
    const [y, m] = targetDate.split('-').map(Number)
    const [cy, cm] = currentMonth.split('-').map(Number)
    return Math.max(1, (y - cy) * 12 + (m - cm))
  }

  function getRecommendedMonthly(goal: Goal): number {
    const months = goal.targetDate ? getMonthsLeft(goal.targetDate) : (goal.deadline ? Math.ceil((new Date(goal.deadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30)) : 0)
    if (months <= 0) return 0
    return Math.ceil((goal.targetAmount - goal.currentAmount) / months)
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
    setDeleteConfirmId(null)
  }

  function handleAddAmount(id: string, amount: number) {
    setGoals(goals.map(g => g.id === id ? { ...g, currentAmount: Math.min(g.currentAmount+amount, g.targetAmount) } : g))
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">재무 목표</h1>
        <button onClick={openAdd} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">+ 목표 추가</button>
      </div>

      <div className="space-y-4">
        {goals.map(goal => {
          const pct = Math.min(goal.currentAmount / goal.targetAmount * 100, 100)
          const dday = goal.deadline ? getDday(goal.deadline) : null
          const remaining = goal.targetAmount - goal.currentAmount
          const isDone = pct >= 100
          const daysLeft = goal.deadline ? Math.ceil((new Date(goal.deadline).getTime()-today.getTime())/(1000*60*60*24)) : 0
          const monthlyNeeded = getRecommendedMonthly(goal)
          const catMeta = GOAL_CATEGORIES.find(c => c.value === (goal.goalCategory || 'other'))

          // 시나리오 비교 (6/12/24개월)
          const scenarios = [6, 12, 24].map(months => ({
            months,
            monthly: Math.ceil(remaining / months),
          })).filter(s => s.monthly > 0)

          return (
            <div key={goal.id} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: goal.color + '20', color: goal.color }}>
                    {catMeta?.icon || '🎯'}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{goal.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {catMeta && <span className="text-xs text-gray-400">{catMeta.label}</span>}
                      {dday && <span className={`text-xs font-medium ${daysLeft < 30 && !isDone ? 'text-red-500' : 'text-gray-400'}`}>{dday}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(goal)} className="text-xs text-gray-400 hover:text-blue-500 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">✏️ 수정</button>
                  <button onClick={() => setDeleteConfirmId(goal.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">🗑️ 삭제</button>
                </div>
              </div>

              <div className="flex items-end justify-between mb-3">
                <div>
                  <div className="text-2xl font-bold" style={{ color: goal.color }}>{fmtShort(goal.currentAmount)}원</div>
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
                          {goal.targetDate.replace('-', '년 ')}월까지 달성 가능
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs text-blue-500">
                      <div>남은 금액</div>
                      <div className="font-semibold">{fmtKRW(remaining)}</div>
                    </div>
                  </div>
                  {/* 시나리오 비교 */}
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

              {!isDone && (
                <div className="flex gap-2">
                  {[10000,50000,100000].map(amt => (
                    <button key={amt} onClick={() => handleAddAmount(goal.id, amt)}
                      className="flex-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-xl py-2 hover:bg-blue-100 transition-colors">
                      +{fmtShort(amt)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {goals.length === 0 && <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-2">🎯</div><div className="text-sm">재무 목표를 설정해보세요!</div></div>}
      </div>

      {/* 추가/수정 모달 */}
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
                  <label className="text-xs text-gray-400 block mb-0.5">목표 달성 월</label>
                  <input type="month" value={form.targetDate}
                    onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">기한 (D-Day)</label>
                  <input type="date" value={form.deadline}
                    onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* 추천 납입액 미리보기 */}
              {form.targetDate && form.targetAmount && (() => {
                const target = parseAmt(form.targetAmount)
                const current = parseAmt(form.currentAmount) || 0
                const months = getMonthsLeft(form.targetDate)
                const monthly = months > 0 ? Math.ceil((target - current) / months) : 0
                return monthly > 0 ? (
                  <div className="bg-blue-50 rounded-xl p-3 text-xs">
                    <span className="text-blue-600 font-medium">💡 추천 월 납입액: </span>
                    <span className="text-blue-800 font-bold">{fmtKRW(monthly)}/월</span>
                    <span className="text-blue-500 ml-1">({months}개월)</span>
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

      {deleteConfirmId && (
        <DeleteConfirmModal
          onConfirm={() => handleDelete(deleteConfirmId)}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  )
}
