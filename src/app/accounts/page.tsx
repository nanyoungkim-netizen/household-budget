'use client'

import { useState } from 'react'
import { useApp } from '@/lib/AppContext'
import { Account } from '@/types'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

export default function AccountsPage() {
  const { data, setAccounts } = useApp()
  const { accounts, transactions } = data
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', bank: '', balance: '', color: '#0064FF' })

  function getMonthlyIncome(id: string) {
    return transactions.filter(t => t.accountId === id && t.date.startsWith(currentMonth) && t.type === 'income').reduce((s,t) => s+t.amount, 0)
  }
  function getMonthlyExpense(id: string) {
    return transactions.filter(t => t.accountId === id && t.date.startsWith(currentMonth) && t.type === 'expense').reduce((s,t) => s+t.amount, 0)
  }
  function getRecentTx(id: string) {
    return transactions.filter(t => t.accountId === id).sort((a,b) => new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,3)
  }
  function handleAdd() {
    if (!form.name || !form.bank) return
    setAccounts([...accounts, { id: `acc${Date.now()}`, name: form.name, bank: form.bank, balance: Number(form.balance)||0, color: form.color } as Account])
    setShowModal(false)
    setForm({ name: '', bank: '', balance: '', color: '#0064FF' })
  }
  function handleDelete(id: string) { setAccounts(accounts.filter(a => a.id !== id)) }
  function handleBalanceEdit(id: string, val: string) {
    setAccounts(accounts.map(a => a.id === id ? { ...a, balance: Number(val)||0 } : a))
  }

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">계좌 관리</h1>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">+ 계좌 추가</button>
      </div>
      <div className="bg-blue-600 text-white rounded-2xl p-5 mb-5">
        <div className="text-sm opacity-80 mb-1">전체 잔액</div>
        <div className="text-3xl font-bold">{fmtKRW(totalBalance)}</div>
        <div className="text-sm opacity-70 mt-1">계좌 {accounts.length}개</div>
      </div>
      <div className="space-y-3">
        {accounts.map(acc => {
          const income = getMonthlyIncome(acc.id)
          const expense = getMonthlyExpense(acc.id)
          const recentTx = getRecentTx(acc.id)
          return (
            <div key={acc.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: acc.color }}>
                      {acc.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{acc.name}</div>
                      <div className="text-xs text-gray-400">{acc.bank}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <input type="number" value={acc.balance}
                        onChange={e => handleBalanceEdit(acc.id, e.target.value)}
                        className="text-xl font-bold text-gray-900 text-right w-36 border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none transition-colors bg-transparent" />
                      <span className="text-sm text-gray-400">원</span>
                    </div>
                    <button onClick={() => handleDelete(acc.id)} className="text-xs text-gray-300 hover:text-red-400 mt-0.5">삭제</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 rounded-xl p-3">
                    <div className="text-xs text-emerald-600 mb-0.5">이달 수입</div>
                    <div className="text-sm font-semibold text-emerald-700">+{fmtKRW(income)}</div>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3">
                    <div className="text-xs text-red-500 mb-0.5">이달 지출</div>
                    <div className="text-sm font-semibold text-red-600">-{fmtKRW(expense)}</div>
                  </div>
                </div>
              </div>
              {recentTx.length > 0 && (
                <div className="border-t border-gray-50 px-5 py-3">
                  <div className="text-xs text-gray-400 mb-2">최근 거래</div>
                  <div className="space-y-1.5">
                    {recentTx.map(t => (
                      <div key={t.id} className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">{t.description}</span>
                        <span className={`text-xs font-medium ${t.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                          {t.type === 'income' ? '+' : '-'}{fmtKRW(t.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {accounts.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-2">🏦</div>
            <div className="text-sm">등록된 계좌가 없습니다</div>
          </div>
        )}
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">계좌 추가</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <input type="text" placeholder="계좌명" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" placeholder="은행명" value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="number" placeholder="현재 잔액" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">색상</span>
                <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-10 rounded-lg cursor-pointer border-0" />
              </div>
              <button onClick={handleAdd} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors">추가하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
