'use client'

import { useState } from 'react'
import { useApp } from '@/lib/AppContext'
import { Installment, CardBilling } from '@/types'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
// FR-007: 금액 입력 포맷
function parseAmt(s: string): number { return parseInt(s.replace(/[^0-9]/g, '')) || 0 }
function fmtInput(s: string): string { const n = parseAmt(s); return n === 0 ? '' : n.toLocaleString('ko-KR') }

const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

export default function CardsPage() {
  const { data, setInstallments, setCardBillings } = useApp()
  const { cards, installments, cardBillings } = data

  // 할부 모달
  const [showInstModal, setShowInstModal] = useState(false)
  const [instForm, setInstForm] = useState({
    cardId: cards[0]?.id || '', description: '', totalAmount: '',
    totalMonths: '6', startDate: today.toISOString().slice(0, 10),
  })

  // FR-009: 카드 청구 모달
  const [showBillingModal, setShowBillingModal] = useState(false)
  const [editingBillingId, setEditingBillingId] = useState<string | null>(null)
  const [billingForm, setBillingForm] = useState({
    cardId: cards[0]?.id || '',
    billingMonth: currentMonth,
    paymentMonth: currentMonth,
    totalAmount: '',
    paidAmount: '',
  })
  const [billingViewMonth, setBillingViewMonth] = useState(currentMonth)

  // ── 할부 ──────────────────────────────────────────────────────────────────────
  function handleAddInst() {
    if (!instForm.description || !instForm.totalAmount) return
    const total = parseAmt(instForm.totalAmount)
    const months = Number(instForm.totalMonths)
    setInstallments([...installments, {
      id: `i${Date.now()}`, cardId: instForm.cardId, description: instForm.description,
      totalAmount: total, monthlyAmount: Math.ceil(total / months),
      totalMonths: months, paidMonths: 0, startDate: instForm.startDate,
    } as Installment])
    setShowInstModal(false)
    setInstForm(f => ({ ...f, description: '', totalAmount: '' }))
  }
  function handleDeleteInst(id: string) { setInstallments(installments.filter(i => i.id !== id)) }

  // ── FR-009: 카드 청구 ─────────────────────────────────────────────────────────
  function openAddBilling() {
    setEditingBillingId(null)
    setBillingForm({ cardId: cards[0]?.id || '', billingMonth: currentMonth, paymentMonth: currentMonth, totalAmount: '', paidAmount: '' })
    setShowBillingModal(true)
  }
  function openEditBilling(b: CardBilling) {
    setEditingBillingId(b.id)
    setBillingForm({
      cardId: b.cardId, billingMonth: b.billingMonth, paymentMonth: b.paymentMonth,
      totalAmount: fmtInput(String(b.totalAmount)), paidAmount: fmtInput(String(b.paidAmount)),
    })
    setShowBillingModal(true)
  }
  function handleSaveBilling() {
    const total = parseAmt(billingForm.totalAmount)
    const paid = parseAmt(billingForm.paidAmount)
    if (!billingForm.cardId || total <= 0) return
    const item: CardBilling = {
      id: editingBillingId || `cb${Date.now()}`,
      cardId: billingForm.cardId,
      billingMonth: billingForm.billingMonth,
      paymentMonth: billingForm.paymentMonth,
      totalAmount: total,
      paidAmount: Math.min(paid, total),
    }
    if (editingBillingId) {
      setCardBillings(cardBillings.map(b => b.id === editingBillingId ? item : b))
    } else {
      setCardBillings([...cardBillings, item])
    }
    setShowBillingModal(false)
  }
  function handleDeleteBilling(id: string) { setCardBillings(cardBillings.filter(b => b.id !== id)) }

  // FR-009: 조회 월 기준으로 납부 기준 청구 내역
  const viewBillings = cardBillings.filter(b => b.paymentMonth === billingViewMonth)
  const totalBilled = viewBillings.reduce((s, b) => s + b.totalAmount, 0)
  const totalPaid   = viewBillings.reduce((s, b) => s + b.paidAmount, 0)
  const totalRemain = totalBilled - totalPaid

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">카드·할부 관리</h1>
        <div className="flex gap-2">
          <button onClick={openAddBilling} className="bg-emerald-600 text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-emerald-700 transition-colors">+ 청구 등록</button>
          <button onClick={() => setShowInstModal(true)} className="bg-blue-600 text-white text-sm font-medium px-3 py-2 rounded-xl hover:bg-blue-700 transition-colors">+ 할부 추가</button>
        </div>
      </div>

      {/* 카드 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {cards.map(card => {
          const monthly = installments.filter(i => i.cardId === card.id).reduce((s, i) => s + i.monthlyAmount, 0)
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

      {/* ── FR-009: 카드 청구·납부 현황 ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm mb-6 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">카드 청구·납부 현황</span>
          <div className="flex items-center gap-2">
            <input type="month" value={billingViewMonth} onChange={e => setBillingViewMonth(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {/* 월 요약 */}
        {totalBilled > 0 && (
          <div className="grid grid-cols-3 gap-3 p-4 border-b border-gray-100">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-0.5">청구 총액</div>
              <div className="text-sm font-bold text-gray-800">{fmtKRW(totalBilled)}</div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3">
              <div className="text-xs text-emerald-600 mb-0.5">납부완료</div>
              <div className="text-sm font-bold text-emerald-700">{fmtKRW(totalPaid)}</div>
            </div>
            <div className={`rounded-xl p-3 ${totalRemain > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
              <div className={`text-xs mb-0.5 ${totalRemain > 0 ? 'text-red-400' : 'text-emerald-600'}`}>
                {totalRemain > 0 ? '잔여 납부금액' : '납부 완료'}
              </div>
              <div className={`text-sm font-bold ${totalRemain > 0 ? 'text-red-500' : 'text-emerald-700'}`}>
                {totalRemain > 0 ? fmtKRW(totalRemain) : '✅ 완납'}
              </div>
            </div>
          </div>
        )}

        {/* 청구 내역 목록 */}
        {viewBillings.length > 0 ? (
          <div>
            {viewBillings.map(b => {
              const card = cards.find(c => c.id === b.cardId)
              const remain = b.totalAmount - b.paidAmount
              const isPaid = remain <= 0
              return (
                <div key={b.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 group hover:bg-gray-50/50 cursor-pointer transition-colors" onClick={() => openEditBilling(b)}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{card?.name}</span>
                      <span className="text-xs text-gray-400">(사용 {b.billingMonth})</span>
                      {isPaid
                        ? <span className="text-xs bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-md font-medium">✅ 납부 완료</span>
                        : <span className="text-xs bg-red-100 text-red-500 px-1.5 py-0.5 rounded-md font-medium">⚠️ 미납</span>
                      }
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      청구 {fmtKRW(b.totalAmount)} · 납부완료 {fmtKRW(b.paidAmount)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      {!isPaid && (
                        <div className="text-sm font-semibold text-red-500">
                          -{fmtKRW(remain)}
                        </div>
                      )}
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleDeleteBilling(b.id) }}
                      className="text-xs text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">삭제</button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <div className="text-2xl mb-1">💳</div>
            <div className="text-xs">{billingViewMonth} 청구 내역이 없습니다</div>
            <button onClick={openAddBilling} className="mt-2 text-xs text-blue-500 underline">청구 등록</button>
          </div>
        )}
      </div>

      {/* ── 할부 목록 ─────────────────────────────────────────────────────────── */}
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
                  <button onClick={() => handleDeleteInst(inst.id)} className="text-xs text-gray-300 hover:text-red-400 mt-0.5">삭제</button>
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
          <div className="text-center py-10 text-gray-400"><div className="text-4xl mb-2">💳</div><div className="text-sm">등록된 할부가 없습니다</div></div>
        )}
      </div>

      {/* ── 할부 추가 모달 ─────────────────────────────────────────────────────── */}
      {showInstModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">할부 추가</h2>
              <button onClick={() => setShowInstModal(false)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <select value={instForm.cardId} onChange={e => setInstForm(f => ({ ...f, cardId: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input type="text" placeholder="품목명" value={instForm.description} onChange={e => setInstForm(f => ({ ...f, description: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {/* FR-007 */}
              <input type="text" inputMode="numeric" placeholder="총 금액" value={instForm.totalAmount}
                onChange={e => setInstForm(f => ({ ...f, totalAmount: fmtInput(e.target.value) }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-2">
                <select value={instForm.totalMonths} onChange={e => setInstForm(f => ({ ...f, totalMonths: e.target.value }))} className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {[3, 6, 9, 10, 12, 18, 24, 36].map(m => <option key={m} value={m}>{m}개월</option>)}
                </select>
                <input type="date" value={instForm.startDate} onChange={e => setInstForm(f => ({ ...f, startDate: e.target.value }))} className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {instForm.totalAmount && <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">월 납입: {fmtKRW(Math.ceil(parseAmt(instForm.totalAmount) / Number(instForm.totalMonths)))}</div>}
              <button onClick={handleAddInst} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors">추가하기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── FR-009: 청구 등록/수정 모달 ───────────────────────────────────────── */}
      {showBillingModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editingBillingId ? '청구 내역 수정' : '카드 청구 등록'}</h2>
              <button onClick={() => setShowBillingModal(false)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">카드 선택</label>
                <select value={billingForm.cardId} onChange={e => setBillingForm(f => ({ ...f, cardId: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">카드 사용 월 (청구 기준)</label>
                  <input type="month" value={billingForm.billingMonth} onChange={e => setBillingForm(f => ({ ...f, billingMonth: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">실제 납부 월</label>
                  <input type="month" value={billingForm.paymentMonth} onChange={e => setBillingForm(f => ({ ...f, paymentMonth: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">청구 총액</label>
                <input type="text" inputMode="numeric" placeholder="청구 총액" value={billingForm.totalAmount}
                  onChange={e => setBillingForm(f => ({ ...f, totalAmount: fmtInput(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">납부완료 금액</label>
                <input type="text" inputMode="numeric" placeholder="납부완료 금액 (미납이면 0)" value={billingForm.paidAmount}
                  onChange={e => setBillingForm(f => ({ ...f, paidAmount: fmtInput(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {/* 잔여금액 미리보기 */}
              {billingForm.totalAmount && (
                <div className={`rounded-xl p-3 text-sm ${parseAmt(billingForm.totalAmount) - parseAmt(billingForm.paidAmount) > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                  {parseAmt(billingForm.totalAmount) - parseAmt(billingForm.paidAmount) > 0
                    ? `⚠️ 잔여 납부금액: ${fmtKRW(parseAmt(billingForm.totalAmount) - parseAmt(billingForm.paidAmount))}`
                    : '✅ 납부 완료'}
                </div>
              )}
              <button onClick={handleSaveBilling} className="w-full bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-700 transition-colors">{editingBillingId ? '수정 완료' : '등록하기'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
