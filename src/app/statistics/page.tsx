'use client'

import { useState } from 'react'
import { transactions, categories } from '@/lib/mockData'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

function formatKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function fmtShort(n: number) {
  if (n >= 1000000) return (n / 10000).toFixed(0) + '만'
  if (n >= 10000) return (n / 10000).toFixed(1) + '만'
  return n.toLocaleString()
}

const today = new Date()

// 최근 6개월 데이터 생성
const monthlyData = Array.from({ length: 6 }, (_, i) => {
  const d = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1)
  const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const label = `${d.getMonth() + 1}월`
  const income = transactions.filter(t => t.date.startsWith(m) && t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = transactions.filter(t => t.date.startsWith(m) && t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  return { label, income, expense, saving: income - expense }
})

const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
const catExpenses = categories
  .filter(c => c.type === 'expense')
  .map(c => ({
    name: c.name,
    icon: c.icon,
    value: transactions.filter(t => t.date.startsWith(currentMonth) && t.categoryId === c.id && t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    color: c.color,
  }))
  .filter(c => c.value > 0)
  .sort((a, b) => b.value - a.value)

const COLORS = catExpenses.map(c => c.color)

export default function StatisticsPage() {
  const [tab, setTab] = useState<'trend' | 'category' | 'annual'>('trend')

  const totalExpense = catExpenses.reduce((s, c) => s + c.value, 0)

  const annualData = Array.from({ length: 12 }, (_, i) => {
    const m = `${today.getFullYear()}-${String(i + 1).padStart(2, '0')}`
    const label = `${i + 1}월`
    const income = transactions.filter(t => t.date.startsWith(m) && t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = transactions.filter(t => t.date.startsWith(m) && t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return { label, income, expense }
  })

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-5">통계 & 차트</h1>

      {/* 탭 */}
      <div className="flex bg-white rounded-2xl p-1 shadow-sm mb-5 w-fit gap-1">
        {([['trend', '추이'], ['category', '카테고리'], ['annual', '연간']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'trend' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-4">최근 6개월 수입 · 지출 추이</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => formatKRW(v)} />
                <Legend />
                <Line type="monotone" dataKey="income" name="수입" stroke="#00B493" strokeWidth={2.5} dot={{ r: 4, fill: '#00B493' }} />
                <Line type="monotone" dataKey="expense" name="지출" stroke="#FF3B30" strokeWidth={2.5} dot={{ r: 4, fill: '#FF3B30' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-4">월별 절약 금액</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => formatKRW(v)} />
                <Bar dataKey="saving" name="절약" fill="#0064FF" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === 'category' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-4">
              이번 달 카테고리별 지출
              <span className="ml-2 text-gray-400 font-normal">총 {formatKRW(totalExpense)}</span>
            </div>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <ResponsiveContainer width={220} height={220}>
                <PieChart>
                  <Pie
                    data={catExpenses}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {catExpenses.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatKRW(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2 w-full">
                {catExpenses.map((c, idx) => (
                  <div key={c.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                    <span className="text-sm text-gray-600 flex-1">{c.icon} {c.name}</span>
                    <span className="text-sm font-medium text-gray-900">{formatKRW(c.value)}</span>
                    <span className="text-xs text-gray-400 w-10 text-right">
                      {totalExpense > 0 ? (c.value / totalExpense * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'annual' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="font-semibold text-sm text-gray-900 mb-4">{today.getFullYear()}년 월별 수입 · 지출</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={annualData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => formatKRW(v)} />
              <Legend />
              <Bar dataKey="income" name="수입" fill="#00B493" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="지출" fill="#FF3B30" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
