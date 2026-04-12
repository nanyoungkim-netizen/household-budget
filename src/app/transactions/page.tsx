'use client'

import { useState } from 'react'
import { transactions as initialTransactions, accounts, categories } from '@/lib/mockData'
import { Transaction } from '@/types'

function formatKRW(amount: number) {
  return amount.toLocaleString('ko-KR') + '원'
}

const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

export default function TransactionsPage() {
  const [month, setMonth] = useState(currentMonth)
  const [filterAccount, setFilterAccount] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [txList, setTxList] = useState<Transaction[]>(initialTransactions)
  const [form, setForm] = useState({
    date: today.toISOString().slice(0, 10),
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense',
    accountId: accounts[0].id,
    categoryId: categories.find(c => c.type === 'expense')?.id || '',
  })

  const filtered = txList
    .filter(t => t.date.startsWith(month))
    .filter(t => filterAccount === 'all' || t.accountId === filterAccount)
    .filter(t => filterType === 'all' || t.type === filterType)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const income = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  const grouped = filtered.reduce<Record<string, Transaction[]>>((acc, t) => {
    if (!acc[t.date]) acc[t.date] = []
    acc[t.date].push(t)
    return acc
  }, {})

  function handleAdd() {
    if (!form.description || !form.amount) return
    const newTx: Transaction = {
      id: `t${Date.now()}`,
      date: form.date,
      description: form.description,
      amount: Number(form.amount.replace(/,/g, '')),
      type: form.type,
      accountId: form.accountId,
      categoryId: form.categoryId,
    }
    setTxList(prev => [...prev, newTx])
    setShowModal(false)
    setForm({
      date: today.toISOString().slice(0, 10),
      description: '',
      amount: '',
      type: 'expense',
      accountId: accounts[0].id,
      categoryId: categories.find(c => c.type === 'expense')?.id || '',
    })
  }

  function handleDelete(id: string) {
    setTxList(prev => prev.filter(t => t.id !== id))
  }

  const filteredCategories = categories.filter(c => c.type === form.type)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">거래 내역</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
        >
          + 추가
        </button>
      </div>

      {/* 필터 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-wrap gap-2">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filterAccount}
            onChange={e => setFilterAccount(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">전체 계좌</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">전체</option>
            <option value="income">수입</option>
            <option value="expense">지출</option>
          </select>
        </div>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">수입</div>
          <div className="text-lg font-bold text-emerald-600">+{formatKRW(income)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">지출</div>
          <div className="text-lg font-bold text-red-500">-{formatKRW(expense)}</div>
        </div>
      </div>

      {/* 거래 목록 */}
      <div className="space-y-3">
        {Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(date => (
          <div key={date} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-500">{date}</span>
            </div>
            {grouped[date].map(t => {
              const cat = categories.find(c => c.id === t.categoryId)
              const acc = accounts.find(a => a.id === t.accountId)
              return (
                <div key={t.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 group">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-base">
                      {cat?.icon}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{t.description}</div>
                      <div className="text-xs text-gray-400">{cat?.name} · {acc?.name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-sm font-semibold ${t.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {t.type === 'income' ? '+' : '-'}{formatKRW(t.amount)}
                    </div>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-gray-300 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        {Object.keys(grouped).length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2">📭</div>
            <div className="text-sm">거래 내역이 없습니다</div>
          </div>
        )}
      </div>

      {/* 거래 추가 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">거래 추가</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-3">
              {/* 수입/지출 탭 */}
              <div className="flex bg-gray-100 rounded-xl p-1">
                {(['expense', 'income'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        type,
                        categoryId: categories.find(c => c.type === type)?.id || ''
                      }))
                    }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      form.type === type
                        ? type === 'income' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                        : 'text-gray-500'
                    }`}
                  >
                    {type === 'income' ? '수입' : '지출'}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="내용 (예: 점심식사)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                placeholder="금액"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={form.accountId}
                onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select
                value={form.categoryId}
                onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <button
                onClick={handleAdd}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors"
              >
                추가하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
