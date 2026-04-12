'use client'

import { useState } from 'react'
import { budgets as initialBudgets, categories, transactions } from '@/lib/mockData'
import { Budget } from '@/types'

function formatKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }

const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

export default function BudgetPage() {
  const [month, setMonth] = useState(currentMonth)
  const [budgets, setBudgets] = useState<Budget[]>(initialBudgets)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const expenseCategories = categories.filter(c => c.type === 'expense')

  const monthTx = transactions.filter(t => t.date.startsWith(month) && t.type === 'expense')

  function getActual(catId: string) {
    return monthTx.filter(t => t.categoryId === catId).reduce((s, t) => s + t.amount, 0)
  }

  function getBudget(catId: string) {
    return budgets.find(b => b.categoryId === catId && b.month === month)?.amount || 0
  }

  function saveBudget(catId: string) {
    const amount = Number(editValue)
    if (isNaN(amount) || amount < 0) return
    setBudgets(prev => {
      const exists = prev.find(b => b.categoryId === catId && b.month === month)
      if (exists) {
        return prev.map(b => b.categoryId === catId && b.month === month ? { ...b, amount } : b)
      }
      return [...prev, { id: `b${Date.now()}`, categoryId: catId, month, amount }]
    })
    setEditing(null)
  }

  const totalBudget = expenseCategories.reduce((s, c) => s + getBudget(c.id), 0)
  const totalActual = expenseCategories.reduce((s, c) => s + getActual(c.id), 0)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">예산 관리</h1>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">총 예산</div>
          <div className="text-base font-bold text-gray-900">{formatKRW(totalBudget)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">실제 지출</div>
          <div className={`text-base font-bold ${totalActual > totalBudget ? 'text-red-500' : 'text-gray-900'}`}>
            {formatKRW(totalActual)}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">절약 가능</div>
          <div className={`text-base font-bold ${totalBudget - totalActual >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {formatKRW(totalBudget - totalActual)}
          </div>
        </div>
      </div>

      {/* 전체 진행바 */}
      {totalBudget > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-5">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>전체 예산 사용률</span>
            <span>{Math.min((totalActual / totalBudget * 100), 100).toFixed(1)}%</span>
          </div>
          <div className="bg-gray-100 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${totalActual > totalBudget ? 'bg-red-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min((totalActual / totalBudget) * 100, 100)}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* 카테고리별 예산 */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-4 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500">
          <span>카테고리</span>
          <span className="text-right">예산</span>
          <span className="text-right">실제</span>
          <span className="text-right">차액</span>
        </div>
        {expenseCategories.map(cat => {
          const budgetAmt = getBudget(cat.id)
          const actual = getActual(cat.id)
          const diff = budgetAmt - actual
          const pct = budgetAmt > 0 ? Math.min((actual / budgetAmt) * 100, 100) : 0
          const isOver = budgetAmt > 0 && actual > budgetAmt

          return (
            <div key={cat.id} className="border-b border-gray-50 last:border-0">
              <div className="grid grid-cols-4 px-4 py-3 items-center">
                <div className="flex items-center gap-2">
                  <span>{cat.icon}</span>
                  <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                </div>
                <div className="text-right">
                  {editing === cat.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveBudget(cat.id)}
                        className="w-24 text-right text-xs border border-blue-300 rounded-lg px-2 py-1 focus:outline-none"
                        autoFocus
                      />
                      <button onClick={() => saveBudget(cat.id)} className="text-blue-600 text-xs font-medium">저장</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditing(cat.id); setEditValue(String(budgetAmt)) }}
                      className="text-sm text-gray-600 hover:text-blue-600 transition-colors"
                    >
                      {budgetAmt > 0 ? formatKRW(budgetAmt) : <span className="text-gray-300 text-xs">설정</span>}
                    </button>
                  )}
                </div>
                <div className={`text-right text-sm ${actual > 0 ? 'font-medium' : 'text-gray-300'}`}>
                  {actual > 0 ? formatKRW(actual) : '-'}
                </div>
                <div className={`text-right text-sm font-medium ${isOver ? 'text-red-500' : diff > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {budgetAmt > 0 ? (isOver ? '▲' + formatKRW(Math.abs(diff)) : diff > 0 ? '-' + formatKRW(diff) : '±0') : '-'}
                </div>
              </div>
              {budgetAmt > 0 && (
                <div className="px-4 pb-2">
                  <div className="bg-gray-100 rounded-full h-1">
                    <div
                      className={`h-1 rounded-full ${isOver ? 'bg-red-500' : pct > 80 ? 'bg-amber-400' : 'bg-blue-500'}`}
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
