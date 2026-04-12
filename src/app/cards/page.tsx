'use client'

import { useState } from 'react'
import { useApp } from '@/lib/AppContext'
import { Installment } from '@/types'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }

export default function CardsPage() {
  const { data, setInstallments } = useApp()
  const { cards, installments } = data
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ cardId: cards[0]?.id || '', description: '', totalAmount: '', totalMonths: '6', startDate: new Date().toISOString().slice(0,10) })

  function handleAdd() {
    if (!form.description || !form.totalAmount) return
    const total = Number(form.totalAmount)
    const months = Number(form.totalMonths)
    setInstallments([...installments, {
      id: `i${Date.now()}`, cardId: form.cardId, description: form.description,
      totalAmount: total, monthlyAmount: Math.ceil(total/months), totalMonths: months, paidMonths: 0, startDate: form.startDate,
    } as Installment])
    setShowModal(false)
    setForm(f => ({ ...f, description: '', totalAmount: '' }))
  }
  function handleDelete(id: string) { setInstallments(installments.filter(i => i.id !== id)) }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">카드·할부 관리</h1>
        <button onClick={() => setShowModal(true)} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">+ 할부 추가</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {cards.map(card => {
          const monthly = installments.filter(i => i.cardId === card.id).reduce((s,i) => s+i.monthlyAmount, 0)
          return (
            <div key={card.id} className="text-white rounded-2xl p-4 shadow-sm" style={{ backgroundColor: card.color }}>
              <div className="text-xs opacity-80 mb-1">{card.bank}</div>
              <div className="text-sm font-bold mb-3">{card.name}</div>
              <div className="text-xs opacity-80">할부 월납</div>
              <div className="text-base font-bold">{fmtKRW(monthly)}</div>
            </div>
          )
        })}
      </div>
      <div className="space-y-3">
        <div className="text-sm font-semibold text-gray-700">진행 중인 할부</div>
        {installments.map(inst => {
          const card = cards.find(c => c.id === inst.cardId)
          const remaining = inst.totalMonths - inst.paidMonths
          const pct = (inst.paidMonths / inst.totalMonths) * 100
          const isDone = remaining === 0
          return (
            <div key={inst.id} className={`bg-white rounded-2xl p-4 shadow-sm ${isDone ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-gray-900">{inst.description}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{card?.name} · 총 {fmtKRW(inst.totalAmount)}</div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${isDone ? 'text-emerald-600' : 'text-gray-900'}`}>{isDone ? '완료' : `월 ${fmtKRW(inst.monthlyAmount)}`}</div>
                  <button onClick={() => handleDelete(inst.id)} className="text-xs text-gray-300 hover:text-red-400 mt-0.5">삭제</button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className={`h-2 rounded-full ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{inst.paidMonths}/{inst.totalMonths}회차{!isDone && ` (${remaining}회 남음)`}</span>
              </div>
            </div>
          )
        })}
        {installments.length === 0 && (
          <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">💳</div><div className="text-sm">등록된 할부가 없습니다</div></div>
        )}
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">할부 추가</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <select value={form.cardId} onChange={e => setForm(f => ({ ...f, cardId: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="text" placeholder="품목명" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input type="number" placeholder="총 금액" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-2">
                <select value={form.totalMonths} onChange={e => setForm(f => ({ ...f, totalMonths: e.target.value }))} className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {[3,6,9,10,12,18,24,36].map(m => <option key={m} value={m}>{m}개월</option>)}
                </select>
                <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {form.totalAmount && <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">월 납입: {fmtKRW(Math.ceil(Number(form.totalAmount)/Number(form.totalMonths)))}</div>}
              <button onClick={handleAdd} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors">추가하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
