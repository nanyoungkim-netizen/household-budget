'use client'

import { useState } from 'react'
import { savings as initialSavings } from '@/lib/mockData'
import { Saving } from '@/types'

function formatKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }

export default function SavingsPage() {
  const [savings, setSavings] = useState<Saving[]>(initialSavings)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    name: '', bank: '', type: 'saving' as 'saving' | 'deposit',
    monthlyAmount: '', interestRate: '', startDate: '', maturityDate: '', currentAmount: '',
  })

  const today = new Date()

  function getDday(maturityDate: string) {
    const diff = Math.ceil((new Date(maturityDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return '만기완료'
    if (diff === 0) return 'D-Day'
    return `D-${diff}`
  }

  function handleAdd() {
    if (!form.name || !form.bank) return
    const newSaving: Saving = {
      id: `s${Date.now()}`,
      name: form.name,
      bank: form.bank,
      type: form.type,
      monthlyAmount: Number(form.monthlyAmount),
      interestRate: Number(form.interestRate),
      startDate: form.startDate,
      maturityDate: form.maturityDate,
      currentAmount: Number(form.currentAmount),
      expectedAmount: Number(form.currentAmount) * (1 + Number(form.interestRate) / 100),
    }
    setSavings(prev => [...prev, newSaving])
    setShowModal(false)
    setForm({ name: '', bank: '', type: 'saving', monthlyAmount: '', interestRate: '', startDate: '', maturityDate: '', currentAmount: '' })
  }

  function handleDelete(id: string) {
    setSavings(prev => prev.filter(s => s.id !== id))
  }

  const totalCurrent = savings.reduce((s, a) => s + a.currentAmount, 0)
  const totalExpected = savings.reduce((s, a) => s + a.expectedAmount, 0)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">적금·예금 관리</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
        >
          + 추가
        </button>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">납입 원금 합계</div>
          <div className="text-lg font-bold text-gray-900">{formatKRW(totalCurrent)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">만기 예상 수령액</div>
          <div className="text-lg font-bold text-emerald-600">{formatKRW(totalExpected)}</div>
        </div>
      </div>

      {/* 적금·예금 목록 */}
      <div className="space-y-3">
        {savings.map(s => {
          const dday = getDday(s.maturityDate)
          const isDone = dday === '만기완료'
          const pct = Math.min((s.currentAmount / s.expectedAmount) * 100, 100)
          const interestIncome = s.expectedAmount - s.currentAmount

          return (
            <div key={s.id} className={`bg-white rounded-2xl p-5 shadow-sm ${isDone ? 'border-2 border-emerald-200' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.type === 'saving' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                      {s.type === 'saving' ? '적금' : '예금'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDone ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                      {dday}
                    </span>
                  </div>
                  <div className="font-semibold text-gray-900 mt-1">{s.name}</div>
                  <div className="text-xs text-gray-400">{s.bank} · 연 {s.interestRate}%</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">{formatKRW(s.currentAmount)}</div>
                  <button onClick={() => handleDelete(s.id)} className="text-xs text-gray-300 hover:text-red-400 mt-0.5">삭제</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-0.5">만기 예상 수령액</div>
                  <div className="text-sm font-semibold text-gray-900">{formatKRW(s.expectedAmount)}</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3">
                  <div className="text-xs text-emerald-600 mb-0.5">이자 수익</div>
                  <div className="text-sm font-semibold text-emerald-700">+{formatKRW(interestIncome)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <span>{s.startDate}</span>
                <div className="flex-1 h-px bg-gray-100"></div>
                <span>{s.maturityDate}</span>
              </div>
              <div className="bg-gray-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`}
                  style={{ width: `${pct}%` }}
                ></div>
              </div>
            </div>
          )
        })}
        {savings.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-2">💰</div>
            <div className="text-sm">등록된 적금·예금이 없습니다</div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">적금·예금 추가</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="flex bg-gray-100 rounded-xl p-1">
                {(['saving', 'deposit'] as const).map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${form.type === t ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
                    {t === 'saving' ? '적금' : '예금'}
                  </button>
                ))}
              </div>
              <input type="text" placeholder="이름 (예: 주택청약)" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="text" placeholder="은행명" value={form.bank}
                onChange={e => setForm(f => ({ ...f, bank: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="현재 금액" value={form.currentAmount}
                  onChange={e => setForm(f => ({ ...f, currentAmount: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="number" placeholder="연 이율 (%)" value={form.interestRate}
                  onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">가입일</label>
                  <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">만기일</label>
                  <input type="date" value={form.maturityDate} onChange={e => setForm(f => ({ ...f, maturityDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
