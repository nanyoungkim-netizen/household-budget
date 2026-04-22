'use client'

import { useState, useMemo } from 'react'
import { useApp } from '@/lib/AppContext'
import { Saving } from '@/types'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function parseAmt(s: string) { return parseInt(s.replace(/[^0-9]/g, '')) || 0 }
function fmtInput(s: string) { const n = parseAmt(s); return n === 0 ? '' : n.toLocaleString('ko-KR') }
const today = new Date()

// ── FR-011: 만기예상금 계산 (네이버 금융 계산기 기준) ─────────────────────────
interface CalcResult {
  principal: number
  grossInterest: number
  taxAmount: number
  netInterest: number
  maturityAmount: number
  months: number
}

function calcMaturity(
  type: 'saving' | 'deposit',
  principal: number,        // 예금=원금, 적금=월납입액
  ratePercent: number,      // 연이율(%)
  startDate: string,
  maturityDate: string,
  interestType: 'simple' | 'compound',
  taxType: 'general' | 'exempt'
): CalcResult | null {
  if (!startDate || !maturityDate || ratePercent <= 0) return null
  const start = new Date(startDate)
  const end   = new Date(maturityDate)
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  if (months <= 0 || principal <= 0) return null

  const r = ratePercent / 100          // 연이율 소수
  const mr = r / 12                    // 월이율

  let totalPrincipal: number
  let grossInterest: number

  if (type === 'deposit') {
    totalPrincipal = principal
    if (interestType === 'simple') {
      grossInterest = principal * r * (months / 12)
    } else {
      // 월복리: A = P × (1 + mr)^n
      const maturity = principal * Math.pow(1 + mr, months)
      grossInterest = maturity - principal
    }
  } else {
    // 적금: 매월 납입
    totalPrincipal = principal * months
    if (interestType === 'simple') {
      // 단리: 첫 달은 전 기간, 마지막 달은 1개월 이자
      grossInterest = principal * mr * (months * (months + 1) / 2)
    } else {
      // 월복리: FV = pmt × [(1+mr)^n − 1] / mr × (1+mr)
      const maturity = principal * (Math.pow(1 + mr, months) - 1) / mr * (1 + mr)
      grossInterest = maturity - totalPrincipal
    }
  }

  const taxAmount  = taxType === 'general' ? grossInterest * 0.154 : 0
  const netInterest = grossInterest - taxAmount
  const maturityAmount = totalPrincipal + netInterest

  return {
    principal: Math.floor(totalPrincipal),
    grossInterest: Math.floor(grossInterest),
    taxAmount: Math.floor(taxAmount),
    netInterest: Math.floor(netInterest),
    maturityAmount: Math.floor(maturityAmount),
    months,
  }
}

// ── 초기 폼 상태 ─────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  name: '', bank: '', type: 'saving' as 'saving' | 'deposit',
  monthlyAmount: '', interestRate: '', startDate: '', maturityDate: '', currentAmount: '',
  interestType: 'simple' as 'simple' | 'compound',
  taxType: 'general' as 'general' | 'exempt',
}

function isFormEmpty(form: typeof EMPTY_FORM) {
  return !form.name && !form.bank && !form.monthlyAmount && !form.interestRate
    && !form.startDate && !form.maturityDate && !form.currentAmount
}

const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

export default function SavingsPage() {
  const { data, setSavings } = useApp()
  const { savings } = data
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)   // null=추가, string=수정
  const [form, setForm] = useState(EMPTY_FORM)
  // FR-013: 탭 전환 확인 다이얼로그
  const [pendingTab, setPendingTab] = useState<'saving' | 'deposit' | null>(null)
  // 납입완료 내역 펼치기
  const [expandedSavingId, setExpandedSavingId] = useState<string | null>(null)

  function getDday(d: string) {
    if (!d) return '날짜 미설정'
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return '날짜 미설정'
    const diff = Math.ceil((dt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return '만기완료'
    if (diff === 0) return 'D-Day'
    return `D-${diff}`
  }

  // FR-013: 탭 전환 핸들러 — 입력 내용 있으면 확인 팝업
  function handleTabSwitch(tab: 'saving' | 'deposit') {
    if (tab === form.type) return
    if (!isFormEmpty(form)) {
      setPendingTab(tab)   // 확인 팝업 표시
    } else {
      setForm({ ...EMPTY_FORM, type: tab })
    }
  }

  function confirmTabSwitch() {
    if (!pendingTab) return
    setForm({ ...EMPTY_FORM, type: pendingTab })
    setPendingTab(null)
  }

  // FR-011: 실시간 계산
  const calcResult = useMemo(() => calcMaturity(
    form.type,
    parseAmt(form.type === 'saving' ? form.monthlyAmount : form.currentAmount),
    Number(form.interestRate) || 0,
    form.startDate,
    form.maturityDate,
    form.interestType,
    form.taxType,
  ), [form.type, form.monthlyAmount, form.currentAmount, form.interestRate,
      form.startDate, form.maturityDate, form.interestType, form.taxType])

  function openAdd() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(s: Saving) {
    setEditId(s.id)
    setForm({
      name: s.name,
      bank: s.bank,
      type: s.type,
      monthlyAmount: s.monthlyAmount ? fmtInput(String(s.monthlyAmount)) : '',
      interestRate: String(s.interestRate),
      startDate: s.startDate,
      maturityDate: s.maturityDate,
      currentAmount: s.currentAmount ? fmtInput(String(s.currentAmount)) : '',
      interestType: s.interestType ?? 'simple',
      taxType: s.taxType ?? 'general',
    })
    setShowModal(true)
  }

  function handleSave() {
    if (!form.name || !form.bank) return
    const cur   = parseAmt(form.currentAmount)
    const rate  = Number(form.interestRate) || 0
    const maturity = calcResult?.maturityAmount ?? cur * (1 + rate / 100)

    const saving: Saving = {
      id: editId ?? `s${Date.now()}`,
      name: form.name,
      bank: form.bank,
      type: form.type,
      monthlyAmount: parseAmt(form.monthlyAmount),
      interestRate: rate,
      startDate: form.startDate,
      maturityDate: form.maturityDate,
      currentAmount: cur,
      expectedAmount: maturity,
      interestType: form.interestType,
      taxType: form.taxType,
    }

    if (editId) {
      setSavings(savings.map(s => s.id === editId ? saving : s))
    } else {
      setSavings([...savings, saving])
    }
    setShowModal(false)
    setEditId(null)
    setForm(EMPTY_FORM)
  }

  function handleDelete(id: string) { setSavings(savings.filter(s => s.id !== id)) }

  const totalCurrent  = savings.reduce((s, a) => s + a.currentAmount, 0)
  const totalExpected = savings.reduce((s, a) => s + a.expectedAmount, 0)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">적금·예금 관리</h1>
        <button onClick={openAdd} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">+ 추가</button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">납입 원금 합계</div>
          <div className="text-lg font-bold text-gray-900">{fmtKRW(totalCurrent)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">만기 예상 수령액</div>
          <div className="text-lg font-bold text-emerald-600">{fmtKRW(totalExpected)}</div>
        </div>
      </div>

      {/* 목록 */}
      <div className="space-y-3">
        {savings.map(s => {
          const dday = getDday(s.maturityDate)
          const isDone = dday === '만기완료'
          const pct = s.expectedAmount > 0 ? Math.min(s.currentAmount / s.expectedAmount * 100, 100) : 0
          const interestIncome = s.expectedAmount - s.currentAmount

          // 연동 거래 계산
          const linkedTxs = data.transactions.filter(t =>
            t.savingLinks?.some(l => l.savingId === s.id)
          ).sort((a, b) => b.date.localeCompare(a.date))
          const thisMonthLinked = linkedTxs.filter(t => t.date.startsWith(currentMonthStr))
          const isPaidThisMonth = thisMonthLinked.length > 0
          const isExpanded = expandedSavingId === s.id

          return (
            <div key={s.id} className={`bg-white rounded-2xl p-5 shadow-sm ${isDone ? 'border-2 border-emerald-200' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.type === 'saving' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                      {s.type === 'saving' ? '적금' : '예금'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDone ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>{dday}</span>
                    {s.interestType && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-400">{s.interestType === 'simple' ? '단리' : '월복리'}</span>
                    )}
                    {/* 납입완료 배지 */}
                    {isPaidThisMonth ? (
                      <button
                        onClick={() => setExpandedSavingId(isExpanded ? null : s.id)}
                        className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors">
                        ✓ 납입완료 {thisMonthLinked.length > 1 ? `${thisMonthLinked.length}건` : ''}
                        <span className="ml-0.5">{isExpanded ? '▲' : '▼'}</span>
                      </button>
                    ) : linkedTxs.length > 0 ? (
                      <button
                        onClick={() => setExpandedSavingId(isExpanded ? null : s.id)}
                        className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                        이번 달 미납입 {isExpanded ? '▲' : '▼'}
                      </button>
                    ) : null}
                  </div>
                  <div className="font-semibold text-gray-900 mt-1">{s.name}</div>
                  <div className="text-xs text-gray-400">{s.bank} · 연 {s.interestRate}%</div>
                </div>
                <div className="flex gap-2 items-start mt-0.5">
                  <button onClick={() => openEdit(s)} className="text-xs text-blue-400 hover:text-blue-600">수정</button>
                  <button onClick={() => handleDelete(s.id)} className="text-xs text-gray-300 hover:text-red-400">삭제</button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-400 mb-0.5">원금</div>
                  <div className="text-sm font-semibold text-gray-900">{fmtKRW(s.currentAmount)}</div>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3">
                  <div className="text-xs text-emerald-600 mb-0.5">이자</div>
                  <div className="text-sm font-semibold text-emerald-700">+{fmtKRW(Math.max(0, interestIncome))}</div>
                </div>
                <div className="bg-blue-50 rounded-xl p-3">
                  <div className="text-xs text-blue-600 mb-0.5">만기수령액</div>
                  <div className="text-sm font-semibold text-blue-700">{fmtKRW(s.expectedAmount)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <span>{s.startDate}</span>
                <div className="flex-1 h-px bg-gray-100" />
                <span>{s.maturityDate}</span>
              </div>
              <div className="bg-gray-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${isDone ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
              </div>

              {/* 연동 거래 내역 (펼쳤을 때) */}
              {isExpanded && linkedTxs.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                  <div className="text-xs font-semibold text-gray-500 mb-2">연동된 거래 내역</div>
                  {linkedTxs.slice(0, 10).map(t => {
                    const linkAmt = t.savingLinks?.find(l => l.savingId === s.id)?.amount ?? t.amount
                    const isThisMonth = t.date.startsWith(currentMonthStr)
                    return (
                      <div key={t.id} className={`flex justify-between items-center text-xs rounded-lg px-2.5 py-1.5 ${isThisMonth ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                        <div>
                          <span className={`font-medium ${isThisMonth ? 'text-emerald-700' : 'text-gray-600'}`}>{t.date}</span>
                          <span className="text-gray-400 ml-1.5">{t.description}</span>
                        </div>
                        <span className={`font-semibold ${isThisMonth ? 'text-emerald-600' : 'text-blue-600'}`}>{fmtKRW(linkAmt)}</span>
                      </div>
                    )
                  })}
                  {linkedTxs.length > 10 && (
                    <p className="text-xs text-gray-400 text-center">외 {linkedTxs.length - 10}건</p>
                  )}
                </div>
              )}
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

      {/* FR-013: 탭 전환 확인 다이얼로그 — z-[60]으로 모달보다 앞에 표시 */}
      {pendingTab && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900 mb-2">탭 전환 확인</h3>
            <p className="text-sm text-gray-500 mb-5">
              입력 중인 내용이 있습니다.<br />
              탭을 전환하면 내용이 초기화됩니다. 계속하시겠습니까?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPendingTab(null)}
                className="flex-1 bg-gray-100 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-200 transition-colors">
                취소
              </button>
              <button onClick={confirmTabSwitch}
                className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition-colors">
                전환
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 추가 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editId ? '적금·예금 수정' : '적금·예금 추가'}</h2>
              <button onClick={() => { setShowModal(false); setEditId(null); setForm(EMPTY_FORM) }} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              {/* FR-013: 탭 전환 핸들러 적용 */}
              <div className="flex bg-gray-100 rounded-xl p-1">
                {(['saving', 'deposit'] as const).map(t => (
                  <button key={t} onClick={() => handleTabSwitch(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${form.type === t ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
                    {t === 'saving' ? '적금' : '예금'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="이름" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" placeholder="은행명" value={form.bank}
                  onChange={e => setForm(f => ({ ...f, bank: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {form.type === 'saving' ? (
                  <input type="text" inputMode="numeric" placeholder="월 납입액 (원)" value={form.monthlyAmount}
                    onChange={e => setForm(f => ({ ...f, monthlyAmount: fmtInput(e.target.value) }))}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                ) : (
                  <input type="text" inputMode="numeric" placeholder="원금 (원)" value={form.currentAmount}
                    onChange={e => setForm(f => ({ ...f, currentAmount: fmtInput(e.target.value) }))}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                )}
                <input type="number" placeholder="연 이율 (%)" value={form.interestRate}
                  onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">가입일</label>
                  <input type="date" value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">만기일</label>
                  <input type="date" value={form.maturityDate}
                    onChange={e => setForm(f => ({ ...f, maturityDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              {/* FR-011: 이자 계산 방식 / 과세 유형 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">이자 계산 방식</label>
                  <div className="flex bg-gray-100 rounded-xl p-0.5">
                    {(['simple', 'compound'] as const).map(t => (
                      <button key={t} onClick={() => setForm(f => ({ ...f, interestType: t }))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${form.interestType === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
                        {t === 'simple' ? '단리' : '월복리'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">과세 유형</label>
                  <div className="flex bg-gray-100 rounded-xl p-0.5">
                    {(['general', 'exempt'] as const).map(t => (
                      <button key={t} onClick={() => setForm(f => ({ ...f, taxType: t }))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${form.taxType === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
                        {t === 'general' ? '일반(15.4%)' : '비과세'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* FR-011: 실시간 계산 결과 */}
              {calcResult && (
                <div className="bg-blue-50 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-semibold text-blue-700 mb-2">📊 만기 예상 계산 결과</div>
                  {form.type === 'saving' && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">총 납입원금</span>
                      <span className="font-medium text-gray-900">{fmtKRW(calcResult.principal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">세전 예상이자</span>
                    <span className="font-medium text-gray-900">+{fmtKRW(calcResult.grossInterest)}</span>
                  </div>
                  {form.taxType === 'general' && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">이자 과세 (15.4%)</span>
                      <span className="font-medium text-red-500">−{fmtKRW(calcResult.taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">세후 예상이자</span>
                    <span className="font-semibold text-emerald-600">+{fmtKRW(calcResult.netInterest)}</span>
                  </div>
                  <div className="border-t border-blue-100 pt-2 flex justify-between">
                    <span className="text-sm font-bold text-blue-800">만기 예상금액</span>
                    <span className="text-base font-bold text-blue-700">{fmtKRW(calcResult.maturityAmount)}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    ※ 참고용 계산이며, 실제 은행 상품의 우대금리·중도해지 조건에 따라 달라질 수 있습니다.
                  </p>
                </div>
              )}

              <button onClick={handleSave}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors">
                {editId ? '저장하기' : '추가하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
