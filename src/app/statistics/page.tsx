'use client'

import { useState } from 'react'
import { useApp } from '@/lib/AppContext'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function fmtShort(n: number) {
  if (n >= 1000000) return (n/10000).toFixed(0)+'만'
  if (n >= 10000) return (n/10000).toFixed(1)+'만'
  return n.toLocaleString()
}
const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

export default function StatisticsPage() {
  const { data, categories } = useApp()
  const { transactions } = data
  const [tab, setTab] = useState<'trend'|'category'|'annual'>('trend')
  const [catTab, setCatTab] = useState<'expense'|'income'>('expense')
  const [catMonth, setCatMonth] = useState(currentMonth)

  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth()-(5-i), 1)
    const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const label = `${d.getMonth()+1}월`
    const income = transactions.filter(t => t.date.startsWith(m) && t.type === 'income').reduce((s,t) => s+t.amount, 0)
    const expense = transactions.filter(t => t.date.startsWith(m) && t.type === 'expense').reduce((s,t) => s+t.amount, 0)
    return { label, income, expense, saving: income-expense }
  })

  const catItems = categories
    .filter(c => c.type === catTab && c.parentId !== null)
    .map(c => ({
      name: c.name,
      icon: c.icon,
      value: Math.max(0, transactions
        .filter(t => t.date.startsWith(catMonth) && t.categoryId === c.id)
        .reduce((s, t) => {
          if (t.type === 'expense' && catTab === 'expense') return s + t.amount
          if (t.type === 'refund' && catTab === 'expense') return s - t.amount
          if (t.type === 'income' && catTab === 'income') return s + t.amount
          return s
        }, 0)),
      color: c.color,
    }))
    .filter(c => c.value > 0)
    .sort((a, b) => b.value - a.value)

  const totalAmount = catItems.reduce((s, c) => s + c.value, 0)

  const top5 = catItems.slice(0, 5)
  const monthlyBreakdown = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(new Date(catMonth + '-01').getFullYear(), new Date(catMonth + '-01').getMonth() - (5-i), 1)
    const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    const label = `${d.getMonth()+1}월`
    const entry: Record<string, number|string> = { label }
    top5.forEach(cat => {
      entry[cat.name] = transactions
        .filter(t => t.date.startsWith(m) && t.categoryId === categories.find(c => c.name === cat.name)?.id && t.type === catTab)
        .reduce((s, t) => s + t.amount, 0)
    })
    return entry
  })

  const annualData = Array.from({ length: 12 }, (_, i) => {
    const m = `${today.getFullYear()}-${String(i+1).padStart(2,'0')}`
    const label = `${i+1}월`
    const income = transactions.filter(t => t.date.startsWith(m) && t.type === 'income').reduce((s,t) => s+t.amount, 0)
    const expense = transactions.filter(t => t.date.startsWith(m) && t.type === 'expense').reduce((s,t) => s+t.amount, 0)
    return { label, income, expense }
  })

  const hasData = transactions.length > 0

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-5">통계 & 차트</h1>
      <div className="flex bg-white rounded-2xl p-1 shadow-sm mb-5 w-fit gap-1">
        {([['trend','추이'],['category','카테고리'],['annual','연간']] as const).map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
        ))}
      </div>

      {!hasData && (
        <div className="bg-white rounded-2xl p-10 shadow-sm text-center text-gray-400">
          <div className="text-4xl mb-2">📊</div>
          <div className="text-sm">거래 내역을 추가하면 차트가 표시됩니다</div>
        </div>
      )}

      {hasData && tab === 'trend' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-4">최근 6개월 수입 · 지출 추이</div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize:12, fill:'#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmtKRW(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="income" name="수입" stroke="#00B493" strokeWidth={2.5} dot={{ r:4, fill:'#00B493' }} />
                <Line type="monotone" dataKey="expense" name="지출" stroke="#FF3B30" strokeWidth={2.5} dot={{ r:4, fill:'#FF3B30' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="font-semibold text-sm text-gray-900 mb-4">월별 절약 금액</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize:12, fill:'#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmtKRW(Number(v))} />
                <Bar dataKey="saving" name="절약" fill="#0064FF" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {hasData && tab === 'category' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                <button
                  onClick={() => setCatTab('expense')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${catTab === 'expense' ? 'bg-red-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                  지출
                </button>
                <button
                  onClick={() => setCatTab('income')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${catTab === 'income' ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                  수입
                </button>
              </div>
              <input type="month" value={catMonth} onChange={e => setCatMonth(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="font-semibold text-sm text-gray-900 mb-4">
              카테고리별 {catTab === 'expense' ? '지출' : '수입'}
              <span className="ml-2 text-gray-400 font-normal">총 {fmtKRW(totalAmount)}</span>
            </div>
            {catItems.length > 0 ? (
              <div className="flex flex-col md:flex-row items-center gap-6">
                <ResponsiveContainer width={220} height={220}>
                  <PieChart>
                    <Pie data={catItems} cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value" paddingAngle={2}>
                      {catItems.map((c, idx) => <Cell key={idx} fill={c.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtKRW(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2 w-full">
                  {catItems.map(c => (
                    <div key={c.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="text-sm text-gray-600 flex-1">{c.icon} {c.name}</span>
                      <span className="text-sm font-medium text-gray-900">{fmtKRW(c.value)}</span>
                      <span className="text-xs text-gray-400 w-10 text-right">{totalAmount > 0 ? (c.value/totalAmount*100).toFixed(1) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <div className="text-sm">{catMonth} {catTab === 'expense' ? '지출' : '수입'} 내역이 없습니다</div>
              </div>
            )}
          </div>
          {top5.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="font-semibold text-sm text-gray-900 mb-4">
                카테고리별 월별 추이 (최근 6개월)
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="label" tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtShort} tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => fmtKRW(Number(v))} />
                  <Legend />
                  {top5.map(cat => (
                    <Bar key={cat.name} dataKey={cat.name} stackId="a" fill={cat.color} radius={top5.indexOf(cat) === top5.length-1 ? [4,4,0,0] : [0,0,0,0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {hasData && tab === 'annual' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <div className="font-semibold text-sm text-gray-900 mb-4">{today.getFullYear()}년 월별 수입 · 지출</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={annualData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="label" tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtShort} tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => fmtKRW(Number(v))} />
              <Legend />
              <Bar dataKey="income" name="수입" fill="#00B493" radius={[4,4,0,0]} />
              <Bar dataKey="expense" name="지출" fill="#FF3B30" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
