'use client'

import { useState } from 'react'
import { useApp } from '@/lib/AppContext'
import { Saving } from '@/types'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
// FR-007: 금액 입력 포맷
function parseAmt(s: string): number { return parseInt(s.replace(/[^0-9]/g, '')) || 0 }
function fmtInput(s: string): string { const n = parseAmt(s); return n === 0 ? '' : n.toLocaleString('ko-KR') }

const today = new Date()

// FR-008: 이자 계산 공식
function calcTermMonths(start: string, end: string): number {
  if (!start || !end) return 0
  const s = new Date(start), e = new Date(end)
  return Math.max(0, (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth())
}
function calcExpected(principal: number, rate: number, months: number, type: 'simple' | 'compound'): number {
  if (months <= 0 || rate <= 0) return principal
  if (type === 'simple') {
    return principal + Math.floor(principal * (rate / 100) * (months / 12))
  } else {
    const monthRate = rate / 100 / 12
    return Math.floor(principal * Math.pow(1 + monthRate, months))
  }
}

export default function SavingsPage() {
  const { data, setSavings } = useApp()
  const { savings } = data
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', bank: '', type: 'saving' as 'saving' | 'deposit',
    monthlyAmount: '', interestRate: '', startDate: '', maturityDate: '',
    currentAmount: '', interestType: 'simple' as 'simple' | 'compound',
    customExpected: '',  // 직접 입력한 예상이자 (비어있으면 자동계산)
  })

  function getDday(d: string) {
    const diff = Math.ceil((new Date(d).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return '만기완료'
    if (diff === 0) return 'D-Day'
    return `D-${diff}`
  }

  // FR-008: 자동 계산된 예상이자/만기금액
  const principal = parseAmt(form.currentAmount)
  const rate = parseFloat(form.interestRate) || 0
  const termMonths = calcTermMonths(form.startDate, form.maturityDate)
  const autoExpected = calcExpected(principal, rate, termMonths, form.interestType)
  const autoInterest = autoExpected - principal
  const isManual = form.customExpected !== ''
  const displayInterest = isManual ? parseAmt(form.customExpected) : autoInterest
  const displayExpected = principal + displayInterest

  function openAdd() {
    setEditingId(null)
    setForm({ name: '', bank: '', type: 'saving', monthlyAmount: '', interestRate: '', startDate: '', maturityDate: '', currentAmount: '', interestType: 'simple', customExpected: '' })
    setShowModal(true)
  }
  function openEdit(s: Saving) {
    setEditingId(s.id)
    const interest = s.expectedAmount - s.currentAmount
    const wasManual = s.manualInterest === true
    setForm({
      name: s.name, bank: s.bank, type: s.type,
      monthlyAmount: s.monthlyAmount ? fmtInput(String(s.monthlyAmount)) : '',
      interestRate: String(s.interestRate),
      startDate: s.startDate, maturityDate: s.maturityDate,
      currentAmount: fmtInput(String(s.currentAmount)),
      interestType: s.interestType || 'simple',
      customExpected: wasManual ? fmtInput(String(interest)) : '',
    })
    setShowModal(true)
  }

  function handleSave() {
    if (!form.name || !form.bank) return
    const cur = parseAmt(form.currentAmount)
    const rateNum = parseFloat(form.interestRate) || 0
    const months = calcTermMonths(form.startDate, form.maturityDate)
    const autoExp = calcExpected(cur, rateNum, months, form.interestType)
    const manual = form.customExpected !== ''
    const finalExpected = manual ? cur + parseAmt(form.customExpected) : autoExp

    const item: Saving = {
      id: editingId || `s${Date.now()}`,
      name: form.name, bank: form.bank, type: form.type,
      monthlyAmount: parseAmt(form.monthlyAmount),
      interestRate: rateNum,
      startDate: form.startDate, maturityDate: form.maturityDate,
      currentAmount: cur, expectedAmount: finalExpected,
      interestType: form.interestType,
      manualInterest: manual,
    }
    if (editingId) {
      setSavings(savings.map(s => s.id === editingId ? item : s))
    } else {
      setSavings([...savings, item])
    }
    setShowModal(false)
  }

  function handleDelete(id: string) { setSavings(savings.filter(s => s.id !== id)) }

  const totalCurrent = savings.reduce((s, a) => s + a.currentAmount, 0)
  const totalExpected = savings.reduce((s, a) => s + a.expectedAmount, 0)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">적금·예금 관리</h1>
        <button onClick={openAdd} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">+ 추가</button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-2xl p-4 shadow-sm"><div className="text-xs text-gray-500 mb-1">납입 원금 합계</div><div className="text-lg font-bold text-gray-900">{fmtKRW(totalCurrent)}</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-sm"><div className="text-xs text-gray-500 mb-1">만기 예상 수령액</div><div className="text-lg font-bold text-emerald-600">{fmtKRW(totalExpected)}</div></div>
      </div>
      <div className="space-y-3">
        {savings.map(s => {
          const dday = getDday(s.maturityDate)
          const isDone = dday === '만기완료'
          const pct = Math.min(s.currentAmount / s.expectedAmount * 100, 100)
          const interestIncome = s.expectedAmount - s.currentAmount
          const months = calcTermMonths(s.startDate, s.maturityDate)
          return (
            <div key={s.id} className={`bg-white rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${isDone ? 'border-2 border-emerald-200' : ''}`} onClick={() => openEdit(s)}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.type === 'saving' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>{s.type === 'saving' ? '적금' : '예금'}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDone ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>{dday}</span>
                    {/* FR-008: 이자 유형 배지 */}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{(s.interestType || 'simple') === 'simple' ? '단리' : '복리'}{months > 0 ? ` ${months}개월` : ''}</span>
                    {s.manualInterest && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-500 font-medium">직접 입력</span>}
                  </div>
                  <div className="font-semibold text-gray-900 mt-1">{s.name}</div>
                  <div className="text-xs text-gray-400">{s.bank} · 연 {s.interestRate}%</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">{fmtKRW(s.currentAmount)}</div>
                  <button onClick={e => { e.stopPropagation(); handleDelete(s.id) }} className="text-xs text-gray-300 hover:text-red-400 mt-0.5">삭제</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-gray-50 rounded-xl p-3"><div className="text-xs text-gray-500 mb-0.5">만기 예상 수령액</div><div className="text-sm font-semibold text-gray-900">{fmtKRW(s.expectedAmount)}</div></div>
                <div className="bg-emerald-50 rounded-xl p-3"><div className="text-xs text-emerald-600 mb-0.5">이자 수익</div><div className="text-sm font-semibold text-emerald-700">+{fmtKRW(interestIncome)}</div></div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <span>{s.startDate}</span><div className="flex-1 h-px bg-gray-100" /><span>{s.maturityDate}</span>
              </div>
              <div className="bg-gray-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
        {savings.length === 0 && <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">💰</div><div className="text-sm">등록된 적금·예금이 없습니다</div></div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editingId ? '적금·예금 수정' : '적금·예금 추가'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              {/* 적금/예금 구분 */}
              <div className="flex bg-gray-100 rounded-xl p-1">
                {(['saving', 'deposit'] as const).map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${form.type === t ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>{t === 'saving' ? '적금' : '예금'}</button>
                ))}
              </div>

              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="이름" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" placeholder="은행명" value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* FR-007: 금액 입력 쉼표 */}
              <input type="text" inputMode="numeric" placeholder="현재 원금 (납입액)" value={form.currentAmount}
                onChange={e => { setForm(f => ({ ...f, currentAmount: fmtInput(e.target.value), customExpected: '' })) }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="0.01" placeholder="연 이율 (%)" value={form.interestRate}
                  onChange={e => { setForm(f => ({ ...f, interestRate: e.target.value, customExpected: '' })) }}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                {form.type === 'saving' && (
                  <input type="text" inputMode="numeric" placeholder="월 납입액" value={form.monthlyAmount}
                    onChange={e => setForm(f => ({ ...f, monthlyAmount: fmtInput(e.target.value) }))}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                )}
              </div>

              {/* 날짜 */}
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-gray-400 block mb-0.5">가입일</label><input type="date" value={form.startDate} onChange={e => { setForm(f => ({ ...f, startDate: e.target.value, customExpected: '' })) }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                <div><label className="text-xs text-gray-400 block mb-0.5">만기일</label><input type="date" value={form.maturityDate} onChange={e => { setForm(f => ({ ...f, maturityDate: e.target.value, customExpected: '' })) }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              </div>

              {/* FR-008: 이자 유형 선택 */}
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">이자 유형</label>
                <div className="flex gap-3">
                  {([['simple', '단리'], ['compound', '복리']] as const).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="interestType" value={val}
                        checked={form.interestType === val}
                        onChange={() => setForm(f => ({ ...f, interestType: val, customExpected: '' }))}
                        className="accent-blue-600" />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* FR-008: 자동 계산 미리보기 */}
              {principal > 0 && rate > 0 && termMonths > 0 && (
                <div className="bg-blue-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-blue-600 font-medium">
                      {form.interestType === 'simple' ? '단리' : '복리'} 자동 계산 ({termMonths}개월)
                    </div>
                    {isManual && (
                      <button onClick={() => setForm(f => ({ ...f, customExpected: '' }))}
                        className="text-xs text-blue-500 hover:text-blue-700 underline">자동으로 되돌리기</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-blue-400 mb-0.5">예상 이자</div>
                      {isManual ? (
                        <div className="flex items-center gap-1.5">
                          <input type="text" inputMode="numeric"
                            value={form.customExpected}
                            onChange={e => setForm(f => ({ ...f, customExpected: fmtInput(e.target.value) }))}
                            className="w-full border border-blue-200 rounded-lg px-2 py-1 text-sm font-semibold text-blue-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          <span className="text-blue-600 font-medium flex-shrink-0">원</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-semibold text-blue-800">+{fmtKRW(autoInterest)}</span>
                          <button onClick={() => setForm(f => ({ ...f, customExpected: fmtInput(String(autoInterest)) }))}
                            className="text-blue-400 hover:text-blue-600 text-xs ml-1 underline">수정</button>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-blue-400 mb-0.5">만기금액</div>
                      <div className="text-sm font-semibold text-blue-800">{fmtKRW(displayExpected)}</div>
                    </div>
                  </div>
                  {isManual && (
                    <div className="text-xs text-orange-500 flex items-center gap-1">
                      <span>✏️</span><span>직접 입력값 적용 중 (자동계산: +{fmtKRW(autoInterest)})</span>
                    </div>
                  )}
                </div>
              )}

              <button onClick={handleSave} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors">{editingId ? '수정 완료' : '추가하기'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
