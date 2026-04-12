'use client'

import { useState } from 'react'
import { goals as initialGoals } from '@/lib/mockData'
import { Goal } from '@/types'

function formatKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function formatKRWShort(n: number) {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억'
  if (n >= 10000) return (n / 10000).toFixed(0) + '만'
  return n.toLocaleString()
}

const PRESET_COLORS = ['#0064FF', '#00B493', '#FF6B6B', '#FFB800', '#9B59B6', '#E67E22', '#1ABC9C', '#E74C3C']

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>(initialGoals)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', targetAmount: '', currentAmount: '', deadline: '', color: '#0064FF' })

  const today = new Date()

  function getDday(deadline: string) {
    const diff = Math.ceil((new Date(deadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return '기한 초과'
    if (diff === 0) return 'D-Day'
    return `D-${diff}`
  }

  function handleAdd() {
    if (!form.name || !form.targetAmount) return
    const newGoal: Goal = {
      id: `g${Date.now()}`,
      name: form.name,
      targetAmount: Number(form.targetAmount),
      currentAmount: Number(form.currentAmount) || 0,
      deadline: form.deadline,
      color: form.color,
    }
    setGoals(prev => [...prev, newGoal])
    setShowModal(false)
    setForm({ name: '', targetAmount: '', currentAmount: '', deadline: '', color: '#0064FF' })
  }

  function handleDelete(id: string) {
    setGoals(prev => prev.filter(g => g.id !== id))
  }

  function handleAddAmount(id: string, amount: number) {
    setGoals(prev => prev.map(g => g.id === id
      ? { ...g, currentAmount: Math.min(g.currentAmount + amount, g.targetAmount) }
      : g
    ))
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">재무 목표</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
        >
          + 목표 추가
        </button>
      </div>

      {/* 목표 목록 */}
      <div className="space-y-4">
        {goals.map(goal => {
          const pct = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
          const dday = getDday(goal.deadline)
          const remaining = goal.targetAmount - goal.currentAmount
          const isDone = pct >= 100
          const daysLeft = Math.ceil((new Date(goal.deadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          const monthlyNeeded = daysLeft > 0 ? Math.ceil(remaining / (daysLeft / 30)) : 0

          return (
            <div key={goal.id} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xl font-bold"
                    style={{ backgroundColor: goal.color }}>
                    🎯
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{goal.name}</div>
                    <div className={`text-xs font-medium mt-0.5 ${daysLeft < 30 && !isDone ? 'text-red-500' : 'text-gray-400'}`}>{dday}</div>
                  </div>
                </div>
                <button onClick={() => handleDelete(goal.id)} className="text-xs text-gray-300 hover:text-red-400">삭제</button>
              </div>

              {/* 금액 표시 */}
              <div className="flex items-end justify-between mb-3">
                <div>
                  <div className="text-2xl font-bold" style={{ color: goal.color }}>
                    {formatKRWShort(goal.currentAmount)}원
                  </div>
                  <div className="text-sm text-gray-400">목표 {formatKRW(goal.targetAmount)}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">{pct.toFixed(1)}%</div>
                  {isDone ? (
                    <div className="text-sm text-emerald-600 font-medium">달성 완료! 🎉</div>
                  ) : (
                    <div className="text-sm text-gray-400">남은 금액 {formatKRWShort(remaining)}원</div>
                  )}
                </div>
              </div>

              {/* 진행바 */}
              <div className="bg-gray-100 rounded-full h-3 mb-3 overflow-hidden">
                <div
                  className="h-3 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: goal.color }}
                ></div>
              </div>

              {/* 월 납입 필요 금액 */}
              {!isDone && daysLeft > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 mb-3">
                  <div className="text-xs text-gray-500">목표 달성을 위한 월 필요 금액</div>
                  <div className="text-sm font-semibold text-gray-700 mt-0.5">{formatKRW(monthlyNeeded)}/월</div>
                </div>
              )}

              {/* 금액 추가 버튼 */}
              {!isDone && (
                <div className="flex gap-2">
                  {[10000, 50000, 100000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => handleAddAmount(goal.id, amt)}
                      className="flex-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-xl py-2 hover:bg-blue-100 transition-colors"
                    >
                      +{formatKRWShort(amt)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {goals.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2">🎯</div>
            <div className="text-sm">재무 목표를 설정해보세요!</div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">목표 추가</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <input type="text" placeholder="목표 이름 (예: 1억 모으기)" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="number" placeholder="목표 금액" value={form.targetAmount}
                onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="number" placeholder="현재 금액" value={form.currentAmount}
                onChange={e => setForm(f => ({ ...f, currentAmount: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div>
                <label className="text-xs text-gray-500 mb-1 block">목표 기한</label>
                <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-2">색상 선택</div>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      className={`w-8 h-8 rounded-xl transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : ''}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <button onClick={handleAdd}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors">
                추가하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
