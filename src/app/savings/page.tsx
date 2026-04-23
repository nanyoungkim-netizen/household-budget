'use client'

import { useState, useMemo } from 'react'
import { useApp } from '@/lib/AppContext'
import { Saving } from '@/types'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function parseAmt(s: string) { return parseInt(s.replace(/[^0-9]/g, '')) || 0 }
function fmtInput(s: string) { const n = parseAmt(s); return n === 0 ? '' : n.toLocaleString('ko-KR') }
const today = new Date()

// ── 만기예상금 계산 (네이버 금융 계산기 기준) ────────────────────────────────
interface CalcResult {
  principal: number
  grossInterest: number
  taxAmount: number
  netInterest: number
  maturityAmount: number
  months: number
}

function calcMaturity(
  type: 'saving' | 'deposit' | 'subscription',
  principal: number,
  ratePercent: number,
  startDate: string,
  maturityDate: string,
  interestType: 'simple' | 'compound',
  taxType: 'general' | 'low_tax' | 'exempt',
): CalcResult | null {
  if (type === 'subscription') return null
  if (!startDate || !maturityDate || ratePercent <= 0) return null
  const start = new Date(startDate)
  const end   = new Date(maturityDate)
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  if (months <= 0 || principal <= 0) return null

  const r  = ratePercent / 100
  const mr = r / 12

  let totalPrincipal: number
  let grossInterest: number

  if (type === 'deposit') {
    totalPrincipal = principal
    grossInterest = interestType === 'simple'
      ? principal * r * (months / 12)
      : principal * Math.pow(1 + mr, months) - principal
  } else {
    totalPrincipal = principal * months
    grossInterest = interestType === 'simple'
      ? principal * mr * (months * (months + 1) / 2)
      : principal * (Math.pow(1 + mr, months) - 1) / mr * (1 + mr) - totalPrincipal
  }

  const taxRate   = taxType === 'general' ? 0.154 : taxType === 'low_tax' ? 0.099 : 0
  const taxAmount = grossInterest * taxRate
  const netInterest    = grossInterest - taxAmount
  const maturityAmount = totalPrincipal + netInterest

  return {
    principal:     Math.floor(totalPrincipal),
    grossInterest: Math.floor(grossInterest),
    taxAmount:     Math.floor(taxAmount),
    netInterest:   Math.floor(netInterest),
    maturityAmount:Math.floor(maturityAmount),
    months,
  }
}

// ── 폼 초기값 ─────────────────────────────────────────────────────────────────
type TaxType = 'general' | 'low_tax' | 'exempt'
type SavingFormType = 'saving' | 'deposit' | 'subscription'

const EMPTY_FORM = {
  name: '', bank: '', accountNumber: '',
  type: 'saving' as SavingFormType,
  monthlyAmount: '', interestRate: '', startDate: '', maturityDate: '', currentAmount: '',
  interestType: 'simple' as 'simple' | 'compound',
  taxType: 'general' as TaxType,
}

function isFormEmpty(form: typeof EMPTY_FORM) {
  return !form.name && !form.bank && !form.monthlyAmount && !form.interestRate
    && !form.startDate && !form.maturityDate && !form.currentAmount
}

const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

type PageTab   = 'savings_deposit' | 'subscription'
type FilterTab = 'all' | 'saving' | 'deposit'

export default function SavingsPage() {
  const { data, setSavings } = useApp()
  const { savings } = data

  const [pageTab,  setPageTab]  = useState<PageTab>('savings_deposit')
  const [filterTab, setFilterTab] = useState<FilterTab>('all')

  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm]     = useState(EMPTY_FORM)
  const [pendingTab, setPendingTab] = useState<SavingFormType | null>(null)
  const [expandedSavingId, setExpandedSavingId] = useState<string | null>(null)

  // ── D-day ──────────────────────────────────────────────────────────────────
  function getDday(d: string) {
    if (!d) return '날짜 미설정'
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return '날짜 미설정'
    const diff = Math.ceil((dt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return '만기완료'
    if (diff === 0) return 'D-Day'
    return `D-${diff}`
  }

  // ── 탭 전환 (적금↔예금 변경 시 초기화 확인) ──────────────────────────────
  function handleTabSwitch(tab: SavingFormType) {
    if (tab === form.type) return
    if (!isFormEmpty(form)) { setPendingTab(tab); return }
    setForm({ ...EMPTY_FORM, type: tab })
  }
  function confirmTabSwitch() {
    if (!pendingTab) return
    setForm({ ...EMPTY_FORM, type: pendingTab })
    setPendingTab(null)
  }

  // ── 실시간 만기 계산 ──────────────────────────────────────────────────────
  const calcResult = useMemo(() => calcMaturity(
    form.type,
    parseAmt(form.type === 'saving' ? form.monthlyAmount : form.currentAmount),
    Number(form.interestRate) || 0,
    form.startDate, form.maturityDate,
    form.interestType, form.taxType,
  ), [form.type, form.monthlyAmount, form.currentAmount, form.interestRate,
      form.startDate, form.maturityDate, form.interestType, form.taxType])

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function openAdd(defaultType?: SavingFormType) {
    setEditId(null)
    setForm({ ...EMPTY_FORM, type: defaultType ?? 'saving' })
    setShowModal(true)
  }

  function openEdit(s: Saving) {
    setEditId(s.id)
    setForm({
      name: s.name, bank: s.bank, accountNumber: s.accountNumber ?? '',
      type: s.type,
      monthlyAmount: s.monthlyAmount ? fmtInput(String(s.monthlyAmount)) : '',
      interestRate:  String(s.interestRate),
      startDate:     s.startDate,
      maturityDate:  s.maturityDate,
      currentAmount: s.currentAmount ? fmtInput(String(s.currentAmount)) : '',
      interestType:  s.interestType ?? 'simple',
      taxType:       (s.taxType as TaxType) ?? 'general',
    })
    setShowModal(true)
  }

  function handleSave() {
    if (!form.name || !form.bank) return
    const cur     = parseAmt(form.currentAmount)
    const rate    = Number(form.interestRate) || 0
    const maturity = calcResult?.maturityAmount ?? (cur > 0 ? cur * (1 + rate / 100) : 0)

    const saving: Saving = {
      id: editId ?? `s${Date.now()}`,
      name: form.name, bank: form.bank,
      type: form.type,
      monthlyAmount:  parseAmt(form.monthlyAmount),
      interestRate:   rate,
      startDate:      form.startDate,
      maturityDate:   form.maturityDate,
      currentAmount:  cur,
      expectedAmount: maturity,
      interestType:   form.interestType,
      taxType:        form.taxType,
      accountNumber:  form.accountNumber || undefined,
    }
    if (editId) setSavings(savings.map(s => s.id === editId ? saving : s))
    else        setSavings([...savings, saving])
    setShowModal(false); setEditId(null); setForm(EMPTY_FORM)
  }

  function handleDelete(id: string) { setSavings(savings.filter(s => s.id !== id)) }

  function moveItem(id: string, dir: -1 | 1) {
    const idx = savings.findIndex(s => s.id === id)
    if (idx < 0) return
    const next = idx + dir
    if (next < 0 || next >= savings.length) return
    const arr = [...savings]
    ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
    setSavings(arr)
  }

  // ── 납입 금액 계산 헬퍼 ──────────────────────────────────────────────────
  function getPaidAmount(s: Saving) {
    const linkedPaid = data.transactions
      .filter(t => t.savingLinks?.some(l => l.savingId === s.id))
      .reduce((acc, t) => acc + (t.savingLinks?.find(l => l.savingId === s.id)?.amount ?? 0), 0)
    return (s.currentAmount || 0) + linkedPaid
  }

  // ── 요약 ─────────────────────────────────────────────────────────────────
  const sdSavings = savings.filter(s => s.type !== 'subscription')
  const subSavings = savings.filter(s => s.type === 'subscription')

  const totalCurrent     = sdSavings.reduce((sum, s) => sum + getPaidAmount(s), 0)
  const savingPaid       = sdSavings.filter(s => s.type === 'saving') .reduce((sum, s) => sum + getPaidAmount(s), 0)
  const depositPaid      = sdSavings.filter(s => s.type === 'deposit').reduce((sum, s) => sum + getPaidAmount(s), 0)
  const totalExpected    = sdSavings.reduce((sum, s) => sum + s.expectedAmount, 0)
  const totalSubPaid     = subSavings.reduce((sum, s) => sum + getPaidAmount(s), 0)

  // ── 리스트 필터 ──────────────────────────────────────────────────────────
  const displayedSD  = sdSavings.filter(s => filterTab === 'all' || s.type === filterTab)
  const displayedSub = subSavings

  // ── 과세 라벨 ─────────────────────────────────────────────────────────────
  const TAX_LABELS: Record<TaxType, string> = {
    general: '일반과세(15.4%)', low_tax: '저율과세(9.9%)', exempt: '비과세',
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">적금·예금 관리</h1>
        <button
          onClick={() => openAdd(pageTab === 'subscription' ? 'subscription' : 'saving')}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">
          + 추가
        </button>
      </div>

      {/* 페이지 탭 */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
        {([['savings_deposit','💰 적금·예금'],['subscription','🏠 청약']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setPageTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${pageTab === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ══ 적금·예금 탭 ══════════════════════════════════════════════════════ */}
      {pageTab === 'savings_deposit' && (
        <>
          {/* 요약 카드 */}
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <div className="text-xs text-gray-500 mb-0.5">납입 원금 합계</div>
                <div className="text-lg font-bold text-gray-900">{fmtKRW(totalCurrent)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">만기 예상 수령액</div>
                <div className="text-lg font-bold text-emerald-600">{fmtKRW(totalExpected)}</div>
              </div>
            </div>
            {(savingPaid > 0 || depositPaid > 0) && (
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100">
                <div className="bg-blue-50 rounded-xl p-2.5">
                  <div className="text-xs text-blue-500 mb-0.5">적금 납입</div>
                  <div className="text-sm font-bold text-blue-700">{fmtKRW(savingPaid)}</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-2.5">
                  <div className="text-xs text-amber-500 mb-0.5">예금 납입</div>
                  <div className="text-sm font-bold text-amber-700">{fmtKRW(depositPaid)}</div>
                </div>
              </div>
            )}
          </div>

          {/* 필터 탭 */}
          <div className="flex gap-1.5 mb-4">
            {([['all','전체'],['saving','적금'],['deposit','예금']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setFilterTab(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${filterTab === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'}`}>
                {label}
                <span className="ml-1 opacity-60">
                  {key === 'all' ? sdSavings.length : sdSavings.filter(s => s.type === key).length}
                </span>
              </button>
            ))}
          </div>

          {/* 목록 */}
          <div className="space-y-3">
            {displayedSD.map((s, idx) => {
              const dday = getDday(s.maturityDate)
              const isDone = dday === '만기완료'
              const totalMonths = s.startDate && s.maturityDate
                ? (() => {
                    const st = new Date(s.startDate), en = new Date(s.maturityDate)
                    return (en.getFullYear() - st.getFullYear()) * 12 + (en.getMonth() - st.getMonth())
                  })()
                : 0

              const cardCalc = calcMaturity(
                s.type, s.type === 'saving' ? s.monthlyAmount : s.currentAmount,
                s.interestRate, s.startDate, s.maturityDate,
                s.interestType ?? 'simple', (s.taxType as TaxType) ?? 'general',
              )
              const totalPrincipal = cardCalc
                ? cardCalc.principal
                : (s.type === 'saving' ? s.monthlyAmount * Math.max(totalMonths, 1) : s.currentAmount)
              const interestIncome  = cardCalc ? cardCalc.netInterest  : Math.max(0, s.expectedAmount - totalPrincipal)
              const displayMaturity = cardCalc ? cardCalc.maturityAmount : s.expectedAmount

              const linkedTxs = data.transactions.filter(t =>
                t.savingLinks?.some(l => l.savingId === s.id)
              ).sort((a, b) => b.date.localeCompare(a.date))
              const linkedPaid   = linkedTxs.reduce((sum, t) => sum + (t.savingLinks?.find(l => l.savingId === s.id)?.amount ?? 0), 0)
              const paidAmount   = (s.currentAmount || 0) + linkedPaid
              const remainingAmt = Math.max(0, totalPrincipal - paidAmount)
              const paidPct      = totalPrincipal > 0 ? Math.min(paidAmount / totalPrincipal * 100, 100) : 0
              const paidMonths   = s.monthlyAmount > 0 ? Math.floor(paidAmount / s.monthlyAmount) : 0

              const thisMonthLinked = linkedTxs.filter(t => t.date.startsWith(currentMonthStr))
              const isPaidThisMonth = thisMonthLinked.length > 0
              const isExpanded = expandedSavingId === s.id

              // 전체 배열에서의 실제 인덱스 (필터 상태와 무관)
              const realIdx = savings.findIndex(sv => sv.id === s.id)

              return (
                <div key={s.id} className={`bg-white rounded-2xl p-5 shadow-sm ${isDone ? 'border-2 border-emerald-200' : ''}`}>
                  {/* 헤더 */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.type === 'saving' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                          {s.type === 'saving' ? '적금' : '예금'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDone ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>{dday}</span>
                        {s.interestType && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-400">{s.interestType === 'simple' ? '단리' : '월복리'}</span>
                        )}
                        {s.taxType && s.taxType !== 'general' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-500">{TAX_LABELS[s.taxType as TaxType]}</span>
                        )}
                        {isPaidThisMonth ? (
                          <button onClick={() => setExpandedSavingId(isExpanded ? null : s.id)}
                            className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors">
                            ✓ 납입완료 {thisMonthLinked.length > 1 ? `${thisMonthLinked.length}건` : ''} {isExpanded ? '▲' : '▼'}
                          </button>
                        ) : linkedTxs.length > 0 ? (
                          <button onClick={() => setExpandedSavingId(isExpanded ? null : s.id)}
                            className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                            이번 달 미납입 {isExpanded ? '▲' : '▼'}
                          </button>
                        ) : null}
                      </div>
                      <div className="font-semibold text-gray-900 mt-1">{s.name}</div>
                      <div className="text-xs text-gray-400">
                        {s.bank} · 연 {s.interestRate}% {totalMonths > 0 ? `· ${totalMonths}개월` : ''}
                        {s.accountNumber && <span className="ml-1.5 text-gray-300">| {s.accountNumber}</span>}
                      </div>
                    </div>
                    {/* 순서 변경 + 수정/삭제 */}
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveItem(s.id, -1)} disabled={realIdx === 0}
                          className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none px-1">▲</button>
                        <button onClick={() => moveItem(s.id, 1)} disabled={realIdx === savings.length - 1}
                          className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none px-1">▼</button>
                      </div>
                      <button onClick={() => openEdit(s)} className="text-xs text-blue-400 hover:text-blue-600 ml-1">수정</button>
                      <button onClick={() => handleDelete(s.id)} className="text-xs text-gray-300 hover:text-red-400">삭제</button>
                    </div>
                  </div>

                  {/* 만기 예상 */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-gray-50 rounded-xl p-3">
                      <div className="text-xs text-gray-400 mb-0.5">총 납입 원금</div>
                      <div className="text-sm font-semibold text-gray-900">{fmtKRW(totalPrincipal)}</div>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-3">
                      <div className="text-xs text-emerald-600 mb-0.5">이자(세후)</div>
                      <div className="text-sm font-semibold text-emerald-700">+{fmtKRW(interestIncome)}</div>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3">
                      <div className="text-xs text-blue-600 mb-0.5">만기수령액</div>
                      <div className="text-sm font-semibold text-blue-700">{fmtKRW(displayMaturity)}</div>
                    </div>
                  </div>

                  {/* 납입 현황 (적금) */}
                  {s.type === 'saving' && totalMonths > 0 && (
                    <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-gray-500">납입 현황</span>
                        <span className="text-xs text-gray-400">{paidMonths}/{totalMonths}개월</span>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 bg-white rounded-lg p-2.5 border border-emerald-100">
                          <div className="text-xs text-emerald-600 mb-0.5">납입 완료</div>
                          <div className="text-sm font-bold text-emerald-700">{fmtKRW(paidAmount)}</div>
                          {s.currentAmount > 0 && linkedPaid > 0 && (
                            <div className="text-xs text-gray-400 mt-0.5">기존 {fmtKRW(s.currentAmount)} + 연동 {fmtKRW(linkedPaid)}</div>
                          )}
                        </div>
                        <div className="flex-1 bg-white rounded-lg p-2.5 border border-gray-100">
                          <div className="text-xs text-gray-400 mb-0.5">남은 납입</div>
                          <div className="text-sm font-bold text-gray-700">{fmtKRW(remainingAmt)}</div>
                          {remainingAmt > 0 && s.monthlyAmount > 0 && (
                            <div className="text-xs text-gray-400 mt-0.5">{Math.ceil(remainingAmt / s.monthlyAmount)}개월 남음</div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div className={`h-2 rounded-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-emerald-400'}`} style={{ width: `${paidPct}%` }} />
                        </div>
                        <div className="text-right text-xs text-gray-400">{paidPct.toFixed(1)}%</div>
                      </div>
                    </div>
                  )}

                  {/* 기간 바 */}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{s.startDate}</span>
                    <div className="flex-1 h-px bg-gray-100" />
                    <span>{s.maturityDate}</span>
                  </div>

                  {/* 연동 거래 내역 */}
                  {isExpanded && linkedTxs.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                      <div className="text-xs font-semibold text-gray-500 mb-2">연동된 거래 내역</div>
                      {linkedTxs.slice(0, 10).map(t => {
                        const linkAmt = t.savingLinks?.find(l => l.savingId === s.id)?.amount ?? t.amount
                        const isThis  = t.date.startsWith(currentMonthStr)
                        return (
                          <div key={t.id} className={`flex justify-between items-center text-xs rounded-lg px-2.5 py-1.5 ${isThis ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                            <div>
                              <span className={`font-medium ${isThis ? 'text-emerald-700' : 'text-gray-600'}`}>{t.date}</span>
                              <span className="text-gray-400 ml-1.5">{t.description}</span>
                            </div>
                            <span className={`font-semibold ${isThis ? 'text-emerald-600' : 'text-blue-600'}`}>{fmtKRW(linkAmt)}</span>
                          </div>
                        )
                      })}
                      {linkedTxs.length > 10 && <p className="text-xs text-gray-400 text-center">외 {linkedTxs.length - 10}건</p>}
                    </div>
                  )}
                </div>
              )
            })}
            {displayedSD.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">💰</div>
                <div className="text-sm">등록된 {filterTab === 'saving' ? '적금' : filterTab === 'deposit' ? '예금' : '적금·예금'}이 없습니다</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ 청약 탭 ══════════════════════════════════════════════════════════ */}
      {pageTab === 'subscription' && (
        <>
          {/* 요약 */}
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
            <div className="text-xs text-gray-500 mb-0.5">총 납입 원금</div>
            <div className="text-lg font-bold text-gray-900">{fmtKRW(totalSubPaid)}</div>
            <div className="text-xs text-gray-400 mt-1">{subSavings.length}건 등록</div>
          </div>

          <div className="space-y-3">
            {displayedSub.map(s => {
              const linkedTxs = data.transactions.filter(t =>
                t.savingLinks?.some(l => l.savingId === s.id)
              ).sort((a, b) => b.date.localeCompare(a.date))
              const linkedPaid = linkedTxs.reduce((sum, t) => sum + (t.savingLinks?.find(l => l.savingId === s.id)?.amount ?? 0), 0)
              const paidAmount = (s.currentAmount || 0) + linkedPaid
              const realIdx    = savings.findIndex(sv => sv.id === s.id)
              const elapsedMonths = s.startDate
                ? (() => {
                    const st = new Date(s.startDate)
                    return (today.getFullYear() - st.getFullYear()) * 12 + (today.getMonth() - st.getMonth())
                  })()
                : 0
              const thisMonthLinked = linkedTxs.filter(t => t.date.startsWith(currentMonthStr))
              const isPaidThisMonth = thisMonthLinked.length > 0
              const isExpanded = expandedSavingId === s.id

              return (
                <div key={s.id} className="bg-white rounded-2xl p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-teal-50 text-teal-600">청약</span>
                        {elapsedMonths > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{elapsedMonths}개월 경과</span>
                        )}
                        {isPaidThisMonth ? (
                          <button onClick={() => setExpandedSavingId(isExpanded ? null : s.id)}
                            className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors">
                            ✓ 납입완료 {isExpanded ? '▲' : '▼'}
                          </button>
                        ) : linkedTxs.length > 0 ? (
                          <button onClick={() => setExpandedSavingId(isExpanded ? null : s.id)}
                            className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                            이번 달 미납입 {isExpanded ? '▲' : '▼'}
                          </button>
                        ) : null}
                      </div>
                      <div className="font-semibold text-gray-900">{s.name}</div>
                      <div className="text-xs text-gray-400">
                        {s.bank}
                        {s.monthlyAmount > 0 && ` · 월 ${fmtKRW(s.monthlyAmount)}`}
                        {s.accountNumber && <span className="ml-1.5 text-gray-300">| {s.accountNumber}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveItem(s.id, -1)} disabled={realIdx === 0}
                          className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none px-1">▲</button>
                        <button onClick={() => moveItem(s.id, 1)} disabled={realIdx === savings.length - 1}
                          className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none px-1">▼</button>
                      </div>
                      <button onClick={() => openEdit(s)} className="text-xs text-blue-400 hover:text-blue-600 ml-1">수정</button>
                      <button onClick={() => handleDelete(s.id)} className="text-xs text-gray-300 hover:text-red-400">삭제</button>
                    </div>
                  </div>

                  {/* 납입 현황 */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-teal-50 rounded-xl p-3">
                      <div className="text-xs text-teal-600 mb-0.5">납입 원금</div>
                      <div className="text-sm font-bold text-teal-700">{fmtKRW(paidAmount)}</div>
                      {s.currentAmount > 0 && linkedPaid > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">기존 {fmtKRW(s.currentAmount)} + 연동 {fmtKRW(linkedPaid)}</div>
                      )}
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <div className="text-xs text-gray-400 mb-0.5">월 납입액</div>
                      <div className="text-sm font-bold text-gray-700">{s.monthlyAmount > 0 ? fmtKRW(s.monthlyAmount) : '-'}</div>
                    </div>
                  </div>

                  {s.startDate && (
                    <div className="text-xs text-gray-400">
                      가입일 {s.startDate}
                    </div>
                  )}

                  {/* 연동 거래 내역 */}
                  {isExpanded && linkedTxs.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                      <div className="text-xs font-semibold text-gray-500 mb-2">연동된 거래 내역</div>
                      {linkedTxs.slice(0, 10).map(t => {
                        const linkAmt = t.savingLinks?.find(l => l.savingId === s.id)?.amount ?? t.amount
                        const isThis  = t.date.startsWith(currentMonthStr)
                        return (
                          <div key={t.id} className={`flex justify-between items-center text-xs rounded-lg px-2.5 py-1.5 ${isThis ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                            <div>
                              <span className={`font-medium ${isThis ? 'text-emerald-700' : 'text-gray-600'}`}>{t.date}</span>
                              <span className="text-gray-400 ml-1.5">{t.description}</span>
                            </div>
                            <span className={`font-semibold ${isThis ? 'text-emerald-600' : 'text-teal-600'}`}>{fmtKRW(linkAmt)}</span>
                          </div>
                        )
                      })}
                      {linkedTxs.length > 10 && <p className="text-xs text-gray-400 text-center">외 {linkedTxs.length - 10}건</p>}
                    </div>
                  )}
                </div>
              )
            })}
            {displayedSub.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">🏠</div>
                <div className="text-sm">등록된 청약 통장이 없습니다</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ 탭 전환 확인 다이얼로그 ══════════════════════════════════════════ */}
      {pendingTab && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900 mb-2">탭 전환 확인</h3>
            <p className="text-sm text-gray-500 mb-5">입력 중인 내용이 있습니다.<br />탭을 전환하면 초기화됩니다. 계속하시겠습니까?</p>
            <div className="flex gap-2">
              <button onClick={() => setPendingTab(null)} className="flex-1 bg-gray-100 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-200">취소</button>
              <button onClick={confirmTabSwitch} className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-blue-700">전환</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 추가/수정 모달 ════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editId ? '수정' : '추가'}</h2>
              <button onClick={() => { setShowModal(false); setEditId(null); setForm(EMPTY_FORM) }} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              {/* 종류 탭 */}
              <div className="flex bg-gray-100 rounded-xl p-1">
                {(['saving','deposit','subscription'] as const).map(t => (
                  <button key={t} onClick={() => handleTabSwitch(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${form.type === t ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
                    {t === 'saving' ? '적금' : t === 'deposit' ? '예금' : '청약'}
                  </button>
                ))}
              </div>

              {/* 이름 / 은행 */}
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="이름" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" placeholder="은행명" value={form.bank}
                  onChange={e => setForm(f => ({ ...f, bank: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              {/* 계좌번호 (선택) */}
              <input type="text" placeholder="계좌번호 (선택)" value={form.accountNumber}
                onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

              {/* 금액 / 이율 */}
              <div className="grid grid-cols-2 gap-2">
                {form.type === 'deposit' ? (
                  <input type="text" inputMode="numeric" placeholder="원금 (원)" value={form.currentAmount}
                    onChange={e => setForm(f => ({ ...f, currentAmount: fmtInput(e.target.value) }))}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                ) : (
                  <input type="text" inputMode="numeric" placeholder="월 납입액 (원)" value={form.monthlyAmount}
                    onChange={e => setForm(f => ({ ...f, monthlyAmount: fmtInput(e.target.value) }))}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                )}
                {form.type !== 'subscription' ? (
                  <input type="number" placeholder="연 이율 (%)" value={form.interestRate}
                    onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                ) : (
                  <div />
                )}
              </div>

              {/* 기존 납입 원금 (적금·청약) */}
              {(form.type === 'saving' || form.type === 'subscription') && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    기존 납입 원금 <span className="text-gray-300">(앱 사용 전 이미 납입한 금액, 선택)</span>
                  </label>
                  <input type="text" inputMode="numeric" placeholder="0원" value={form.currentAmount}
                    onChange={e => setForm(f => ({ ...f, currentAmount: fmtInput(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}

              {/* 날짜 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">가입일</label>
                  <input type="date" value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {form.type !== 'subscription' && (
                  <div>
                    <label className="text-xs text-gray-400 block mb-0.5">만기일</label>
                    <input type="date" value={form.maturityDate}
                      onChange={e => setForm(f => ({ ...f, maturityDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
              </div>

              {/* 이자 계산 방식 / 과세 유형 — 적금·예금만 */}
              {form.type !== 'subscription' && (
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">이자 계산 방식</label>
                    <div className="flex bg-gray-100 rounded-xl p-0.5">
                      {(['simple','compound'] as const).map(t => (
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
                      {(['general','low_tax','exempt'] as const).map(t => (
                        <button key={t} onClick={() => setForm(f => ({ ...f, taxType: t }))}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${form.taxType === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
                          {t === 'general' ? '일반(15.4%)' : t === 'low_tax' ? '저율(9.9%)' : '비과세'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 실시간 계산 결과 */}
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
                  {form.taxType !== 'exempt' && (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">이자 과세 ({form.taxType === 'general' ? '15.4%' : '9.9%'})</span>
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
                  <p className="text-xs text-gray-400 mt-1">※ 참고용이며 실제와 다를 수 있습니다.</p>
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
