'use client'

import { useState, useCallback, useEffect } from 'react'
import { useApp, computeAccountBalance, getConsumptionType } from '@/lib/AppContext'
import { Transaction, PaymentMethod, Saving, ConsumptionType } from '@/types'
import TransactionImport from '@/components/TransactionImport'
import DeleteConfirmModal from '@/components/DeleteConfirmModal'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
// FR-007: 금액 입력 포맷 헬퍼
function parseAmt(s: string): number { return parseInt(s.replace(/[^0-9]/g, '')) || 0 }
function fmtInput(s: string): string { const n = parseAmt(s); return n === 0 ? '' : n.toLocaleString('ko-KR') }

// FR-010: 적금 카테고리 ID 집합 (기본값)

const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`
type PaymentTab = 'all' | 'account' | 'card'
type TxFormType = 'expense' | 'income' | 'transfer' | 'refund'

interface FormState {
  date: string
  description: string
  amount: string
  accountId: string
  toAccountId: string
  categoryId: string
  paymentMethod: PaymentMethod
  cardId: string
  installmentMonths: string   // '1' = 일시불, '2'~ = 할부
  billingMonth: string        // 카드대금 납부 시 청구 월 (YYYY-MM)
  consumptionType: ConsumptionType | undefined
}

function prevMonthStr(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function recentMonthOptions(): string[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - (i + 1))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

export default function TransactionsPage() {
  const { data, categories, addTransaction, updateTransaction, deleteTransaction, setSavings } = useApp()
  const { accounts, transactions, cards } = data

  function isCardPaymentCat(categoryId: string): boolean {
    const cat = categories.find(c => c.id === categoryId)
    return cat?.role === 'card_payment'
  }

  const [month, setMonth] = useState(currentMonth)
  const [filterAccount, setFilterAccount] = useState('all')
  const [filterCard, setFilterCard] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [paymentTab, setPaymentTab] = useState<PaymentTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterCategories, setFilterCategories] = useState<string[]>([])
  const [catParentFilter, setCatParentFilter] = useState('')
  const [fromBudgetLabel, setFromBudgetLabel] = useState('')
  const [accountChipSearch, setAccountChipSearch] = useState('')
  const [cardChipSearch, setCardChipSearch] = useState('')

  // URL 파라미터로 초기 상태 복원 (FR-002, FR-003)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const catParam = params.get('category')
    if (catParam) setFilterCategories(catParam.split(',').filter(Boolean))
    const monthParam = params.get('month')
    if (monthParam) setMonth(monthParam)
    const labelParam = params.get('catLabel')
    if (labelParam) setFromBudgetLabel(decodeURIComponent(labelParam))
  }, [])

  // 카테고리 필터 변경 시 URL 동기화
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (filterCategories.length > 0) {
      params.set('category', filterCategories.join(','))
    } else {
      params.delete('category')
      params.delete('catLabel')
      setFromBudgetLabel('')
    }
    const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '')
    history.replaceState(null, '', newUrl)
  }, [filterCategories])

  // 모달 상태 — editingId가 있으면 수정 모드
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [formType, setFormType] = useState<TxFormType>('expense')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [realConsumptionFilter, setRealConsumptionFilter] = useState(false)

  // 적금·예금 상품 연동 상태
  const [savingLinks, setSavingLinks] = useState<{ savingId: string; amount: string }[]>([])
  const [savingSearch, setSavingSearch] = useState('')
  const [showQuickAddSaving, setShowQuickAddSaving] = useState(false)
  const [quickSavingForm, setQuickSavingForm] = useState({
    name: '', bank: '', type: 'saving' as 'saving' | 'deposit' | 'subscription',
    monthlyAmount: '', interestRate: '', startDate: '', maturityDate: '',
  })

  const defaultForm = useCallback((): FormState => ({
    date: today.toISOString().slice(0, 10),
    description: '',
    amount: '',
    accountId: accounts[0]?.id || '',
    toAccountId: accounts[1]?.id || accounts[0]?.id || '',
    categoryId: categories.find(c => c.type === 'expense' && c.parentId !== null)?.id || '',
    paymentMethod: 'account',
    cardId: cards[0]?.id || '',
    installmentMonths: '1',
    billingMonth: '',
    consumptionType: undefined,
  }), [accounts, cards, categories])

  const [form, setForm] = useState<FormState>(defaultForm)

  // ── 필터링 ──────────────────────────────────────────────────────────────────
  const filtered = transactions
    .filter(t => t.date.startsWith(month))
    .filter(t => filterAccount === 'all' || t.accountId === filterAccount || t.toAccountId === filterAccount)
    .filter(t => filterType === 'all' || t.type === filterType)
    .filter(t => {
      if (paymentTab === 'all') return true
      if (paymentTab === 'account') return t.type === 'transfer' || t.paymentMethod === 'account'
      // 카드 탭: 카드 결제만 (이체 제외)
      return t.type !== 'transfer' && t.paymentMethod === 'card'
    })
    .filter(t => filterCard === 'all' || (t.paymentMethod === 'card' && t.cardId === filterCard))
    .filter(t => !filterDateFrom || t.date >= filterDateFrom)
    .filter(t => !filterDateTo   || t.date <= filterDateTo)
    .filter(t => !searchQuery.trim() ||
      t.description.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
      String(t.amount).includes(searchQuery.trim())
    )
    .filter(t => filterCategories.length === 0 || filterCategories.includes(t.categoryId))
    .filter(t => !realConsumptionFilter || getConsumptionType(t, categories) === 'normal')
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))

  const income    = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenseRaw = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const refundAmt  = filtered.filter(t => t.type === 'refund').reduce((s, t) => s + t.amount, 0)
  const expense   = Math.max(0, expenseRaw - refundAmt)
  const transfer  = filtered.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0)
  // FR-010: 적금·카드대금 분리 계산
  const savingExpense  = filtered.filter(t => t.type === 'expense' && isSavingCat(t.categoryId)).reduce((s, t) => s + t.amount, 0)
  const cardPayExpense = filtered.filter(t => t.type === 'expense' && isCardPaymentCat(t.categoryId)).reduce((s, t) => s + t.amount, 0)
  const cardPayByCard  = cards.map(card => ({
    ...card,
    amount: filtered.filter(t => t.type === 'expense' && isCardPaymentCat(t.categoryId) && t.cardId === card.id).reduce((s, t) => s + t.amount, 0),
  }))
  const realExpense    = Math.max(0, expense - savingExpense - cardPayExpense)

  // 카드 탭: 당월 결제 vs 할부 이월 분석
  // 할부 이월 판별: installmentCurrent > 1 이거나 설명에 "(2/3)" "(3/12)" 같은 패턴
  const { cardNewChargeAmt, cardCarryoverAmt } = (() => {
    if (paymentTab !== 'card') return { cardNewChargeAmt: 0, cardCarryoverAmt: 0 }
    const cardExpTxs = filtered.filter(t => t.type === 'expense' && t.paymentMethod === 'card')
    let newCharge = 0, carryover = 0
    cardExpTxs.forEach(t => {
      const descMatch = t.description.match(/\((\d+)\/\d+\)/)
      const isCarryover =
        (t.installmentCurrent !== undefined && t.installmentCurrent > 1) ||
        (descMatch !== null && parseInt(descMatch[1]) > 1)
      if (isCarryover) carryover += t.amount
      else newCharge += t.amount
    })
    return { cardNewChargeAmt: newCharge, cardCarryoverAmt: carryover }
  })()

  // 계좌별 실시간 잔액 (전체 거래 기준, 월 필터 없음)
  const accountBalances = accounts.map(acc => ({
    acc,
    balance: computeAccountBalance(acc.id, acc.balance, transactions),
  }))

  // 카드별 이번 달 누적 (월 필터 적용)
  const cardMonthlyTotals = cards.map(card => ({
    card,
    total: transactions
      .filter(t => t.date.startsWith(month) && t.paymentMethod === 'card' && t.cardId === card.id && (t.type === 'expense' || t.type === 'refund'))
      .reduce((s, t) => t.type === 'refund' ? s - t.amount : s + t.amount, 0),
  }))

  const grouped = filtered.reduce<Record<string, Transaction[]>>((acc, t) => {
    if (!acc[t.date]) acc[t.date] = []
    acc[t.date].push(t)
    return acc
  }, {})

  // ── 계좌 필터링 시: 거래 후 잔액 계산 ──────────────────────────────────────
  // 특정 계좌가 선택됐을 때 각 거래 직후의 잔액을 Map으로 계산
  const runningBalanceMap = (() => {
    if (filterAccount === 'all') return new Map<string, number>()
    const acc = accounts.find(a => a.id === filterAccount)
    if (!acc) return new Map<string, number>()

    // 해당 계좌의 모든 거래를 오래된 순으로 정렬
    const accTxs = transactions
      .filter(t => t.accountId === filterAccount || t.toAccountId === filterAccount)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

    let bal = acc.balance
    const map = new Map<string, number>()
    for (const t of accTxs) {
      if ((t.type === 'income' || (t.type === 'refund' && t.paymentMethod !== 'card')) && t.accountId === filterAccount) bal += t.amount
      else if (t.type === 'expense' && t.accountId === filterAccount && t.paymentMethod === 'account') bal -= t.amount
      else if (t.type === 'transfer') {
        if (t.accountId === filterAccount) bal -= t.amount
        else if (t.toAccountId === filterAccount) bal += t.amount
      }
      map.set(t.id, bal)
    }
    return map
  })()

  // ── 모달 열기 ────────────────────────────────────────────────────────────────
  function openAdd() {
    setEditingId(null)
    setFormType('expense')
    setForm(defaultForm())
    setSavingLinks([])
    setSavingSearch('')
    setShowModal(true)
  }

  function openEdit(t: Transaction) {
    setEditingId(t.id)
    const type = t.type as TxFormType
    setFormType(type)
    setForm({
      date: t.date,
      description: t.description,
      amount: fmtInput(String(t.amount)),
      accountId: t.accountId,
      toAccountId: t.toAccountId || accounts[1]?.id || accounts[0]?.id || '',
      categoryId: t.categoryId,
      paymentMethod: t.paymentMethod,
      cardId: t.cardId || cards[0]?.id || '',
      installmentMonths: '1',
      billingMonth: t.billingMonth || '',
      consumptionType: t.consumptionType,
    })
    setSavingLinks((t.savingLinks || []).map(l => ({ savingId: l.savingId, amount: fmtInput(String(l.amount)) })))
    setSavingSearch('')
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
    setSavingLinks([])
    setSavingSearch('')
    setAccountSearch('')
    setCatSearch('')
    setCatModalParent('')
  }

  // ── 적금 빠른 추가 ──────────────────────────────────────────────────────────
  function handleQuickAddSaving() {
    if (!quickSavingForm.name || !quickSavingForm.bank) return
    const newSaving: Saving = {
      id: `s${Date.now()}`,
      name: quickSavingForm.name,
      bank: quickSavingForm.bank,
      type: quickSavingForm.type,
      monthlyAmount: parseAmt(quickSavingForm.monthlyAmount),
      interestRate: Number(quickSavingForm.interestRate) || 0,
      startDate: quickSavingForm.startDate,
      maturityDate: quickSavingForm.maturityDate,
      currentAmount: 0,
      expectedAmount: parseAmt(quickSavingForm.monthlyAmount),
      interestType: 'simple',
      taxType: 'general',
    }
    setSavings([...data.savings, newSaving])
    setSavingLinks(prev => [...prev, { savingId: newSaving.id, amount: quickSavingForm.monthlyAmount }])
    setShowQuickAddSaving(false)
    setQuickSavingForm({ name: '', bank: '', type: 'saving', monthlyAmount: '', interestRate: '', startDate: '', maturityDate: '' })
  }

  // ── 저장 ─────────────────────────────────────────────────────────────────────
  function handleSave() {
    if (!form.amount) return

    // 적금 연동 금액 합계 검증
    if (savingLinks.length > 0) {
      const totalLinked = savingLinks.reduce((s, l) => s + parseAmt(l.amount), 0)
      if (totalLinked > parseAmt(form.amount)) {
        alert('연동 금액의 합계가 거래 금액을 초과할 수 없습니다.')
        return
      }
    }

    let tx: Transaction

    if (formType === 'transfer') {
      if (!form.accountId || !form.toAccountId) return
      if (form.accountId === form.toAccountId) return alert('보내는 계좌와 받는 계좌가 같습니다.')
      tx = {
        id: editingId || `t${Date.now()}`,
        date: form.date,
        description: form.description || '계좌 이체',
        amount: parseAmt(form.amount),
        type: 'transfer',
        accountId: form.accountId,
        toAccountId: form.toAccountId,
        categoryId: 'transfer',
        paymentMethod: 'account',
      }
    } else {
      if (!form.description) return
      const totalAmount = parseAmt(form.amount)
      const months = Math.max(1, Number(form.installmentMonths) || 1)
      const isInstallment = form.paymentMethod === 'card' && months > 1

      if (isInstallment && !editingId) {
        // 할부: 월별 분할 거래 생성
        const baseDate = new Date(form.date)
        const monthlyAmount = Math.floor(totalAmount / months)
        const remainder = totalAmount - monthlyAmount * months  // 나머지는 1회차에 추가

        for (let i = 0; i < months; i++) {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate())
          const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          const amt = i === 0 ? monthlyAmount + remainder : monthlyAmount
          addTransaction({
            id: `t${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`,
            date: dateStr,
            description: `${form.description} (${i+1}/${months})`,
            amount: amt,
            type: formType as 'expense',
            accountId: form.accountId,
            categoryId: form.categoryId,
            paymentMethod: 'card',
            cardId: form.cardId,
          })
        }
        closeModal()
        return
      }

      const resolvedSavingLinks = isSavingCat(form.categoryId) && savingLinks.length > 0
        ? savingLinks.filter(l => l.savingId && parseAmt(l.amount) > 0).map(l => ({ savingId: l.savingId, amount: parseAmt(l.amount) }))
        : undefined

      tx = {
        id: editingId || `t${Date.now()}`,
        date: form.date,
        description: form.description,
        amount: totalAmount,
        type: formType,
        accountId: form.accountId,
        categoryId: form.categoryId,
        paymentMethod: form.paymentMethod,
        cardId: form.paymentMethod === 'card' ? form.cardId : undefined,
        savingLinks: resolvedSavingLinks,
        billingMonth: isCardPaymentCat(form.categoryId) && form.billingMonth ? form.billingMonth : undefined,
        consumptionType: formType === 'expense' ? form.consumptionType : undefined,
      }
    }

    if (editingId) {
      updateTransaction(editingId, tx)
    } else {
      addTransaction(tx)
    }
    closeModal()
  }

  function switchFormType(t: TxFormType) {
    setFormType(t)
    setCatSearch('')
    setCatModalParent('')
    if (t === 'refund') {
      setForm(f => ({
        ...f,
        categoryId: categories.find(c => c.type === 'expense' && c.parentId !== null)?.id || ''
      }))
    } else if (t !== 'transfer') {
      setForm(f => ({
        ...f,
        categoryId: categories.find(c => c.type === t && c.parentId !== null)?.id || ''
      }))
    }
  }

  // 적금·예금·저축 관련 카테고리 판별
  // - 기본 ID 집합에 있거나
  // - savingId가 연결돼 있거나
  // - 부모 카테고리 이름이 적금/예금/저축 관련이면 인식
  function isSavingCat(categoryId: string): boolean {
    const cat = categories.find(c => c.id === categoryId)
    if (!cat) return false
    if (cat.role === 'savings') return true
    if (cat.savingId) return true
    const parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
    return parent?.role === 'savings'
  }

  // 환급은 지출 카테고리 목록 사용
  const filteredCats = formType === 'refund'
    ? categories.filter(c => c.type === 'expense' && c.parentId !== null)
    : categories.filter(c => c.type === formType && c.parentId !== null)
  const isEditing = !!editingId

  // 카테고리 선택 (모달)
  const [catSearch, setCatSearch] = useState('')
  const [catModalParent, setCatModalParent] = useState('')
  // 계좌 선택 검색 (모달)
  const [accountSearch, setAccountSearch] = useState('')

  // 모달용 카테고리 필터링
  const catParentList = (() => {
    const type = formType === 'refund' ? 'expense' : formType
    return categories.filter(c => c.parentId === null && c.type === type)
  })()
  const searchedCats = (() => {
    if (catSearch.trim()) {
      return filteredCats.filter(c => c.name.toLowerCase().includes(catSearch.trim().toLowerCase()))
    }
    if (catModalParent) {
      return filteredCats.filter(c => c.parentId === catModalParent)
    }
    return filteredCats
  })()

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* 예산 화면에서 이동 배너 (FR-003) */}
      {fromBudgetLabel && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-2.5 mb-4 flex items-center justify-between">
          <span className="text-sm text-blue-700">← 예산 화면에서 이동: <strong>{fromBudgetLabel}</strong></span>
          <button
            onClick={() => { setFilterCategories([]); window.history.back() }}
            className="text-xs text-blue-500 hover:text-blue-700 font-medium">돌아가기</button>
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">거래 내역</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)}
            className="bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-green-700 transition-colors">
            📊 엑셀 가져오기
          </button>
          <button onClick={openAdd}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">
            + 추가
          </button>
        </div>
      </div>

      {/* 통장/카드 탭 */}
      <div className="flex bg-white rounded-2xl p-1 shadow-sm mb-3 gap-1 w-fit">
        {([['all','전체'],['account','🏦 통장'],['card','💳 카드']] as const).map(([key, label]) => (
          <button key={key}
            onClick={() => {
              setPaymentTab(key)
              setFilterAccount('all')
              setFilterCard('all')
            }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${paymentTab === key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 통장 탭: 계좌 칩 (실시간 잔액) */}
      {paymentTab === 'account' && (
        <div className="mb-4">
          {/* 은행/계좌 검색 */}
          <div className="relative mb-2">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
            <input
              type="text"
              value={accountChipSearch}
              onChange={e => setAccountChipSearch(e.target.value)}
              placeholder="은행·계좌 검색..."
              className="w-full pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {accountChipSearch && (
              <button onClick={() => setAccountChipSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-xs">×</button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterAccount('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                filterAccount === 'all'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}>
              전체
            </button>
            {accountBalances
              .filter(({ acc }) =>
                !accountChipSearch.trim() ||
                acc.name.toLowerCase().includes(accountChipSearch.trim().toLowerCase()) ||
                acc.bank.toLowerCase().includes(accountChipSearch.trim().toLowerCase())
              )
              .map(({ acc, balance }) => (
                <button
                  key={acc.id}
                  onClick={() => setFilterAccount(acc.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                    filterAccount === acc.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}>
                  <span>{acc.name}</span>
                  <span className={`text-xs font-normal ${filterAccount === acc.id ? 'text-blue-100' : 'text-gray-400'}`}>
                    {balance >= 0 ? '' : '-'}{Math.abs(balance).toLocaleString('ko-KR')}원
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* 카드 탭: 카드 칩 (월별 누적) */}
      {paymentTab === 'card' && (
        <div className="mb-4">
          {/* 카드 검색 */}
          <div className="relative mb-2">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
            <input
              type="text"
              value={cardChipSearch}
              onChange={e => setCardChipSearch(e.target.value)}
              placeholder="카드 검색..."
              className="w-full pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {cardChipSearch && (
              <button onClick={() => setCardChipSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-xs">×</button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterCard('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                filterCard === 'all'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}>
              전체 카드
            </button>
            {cardMonthlyTotals
              .filter(({ card }) =>
                !cardChipSearch.trim() ||
                card.name.toLowerCase().includes(cardChipSearch.trim().toLowerCase()) ||
                card.bank.toLowerCase().includes(cardChipSearch.trim().toLowerCase())
              )
              .map(({ card, total }) => (
                <button
                  key={card.id}
                  onClick={() => setFilterCard(filterCard === card.id ? 'all' : card.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                    filterCard === card.id
                      ? 'text-white border-transparent'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                  style={filterCard === card.id ? { backgroundColor: card.color, borderColor: card.color } : {}}>
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${filterCard === card.id ? 'bg-white/60' : ''}`}
                    style={filterCard !== card.id ? { backgroundColor: card.color } : {}}
                  />
                  <span>{card.name}</span>
                  <span className={`text-xs font-normal ${filterCard === card.id ? 'text-white/80' : 'text-red-400'}`}>
                    {total > 0 ? `${total.toLocaleString('ko-KR')}원` : '0원'}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* 카테고리 필터 */}
      {(() => {
        const parentCats = categories.filter(c => c.parentId === null)
        const leafCats   = categories.filter(c => c.parentId != null)
        if (leafCats.length === 0) return null
        const subCats = catParentFilter ? leafCats.filter(c => c.parentId === catParentFilter) : []
        const hasFilter = filterCategories.length > 0 || !!catParentFilter
        return (
          <div className="mb-3 bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* 대분류 행 */}
            <div className="overflow-x-auto">
              <div className="flex gap-1 p-2" style={{ minWidth: 'max-content' }}>
                <button
                  onClick={() => { setCatParentFilter(''); setFilterCategories([]) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                    !hasFilter ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}>
                  전체
                </button>
                {parentCats.map(p => {
                  const isActive = catParentFilter === p.id
                  return (
                    <button key={p.id}
                      onClick={() => { setCatParentFilter(prev => prev === p.id ? '' : p.id); setFilterCategories([]) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                      style={isActive ? { backgroundColor: p.color || '#4B5563' } : {}}>
                      {p.icon} {p.name}
                    </button>
                  )
                })}
              </div>
            </div>
            {/* 소분류 행 — 대분류 선택 시만 표시 */}
            {catParentFilter && subCats.length > 0 && (
              <div className="overflow-x-auto border-t border-gray-100">
                <div className="flex gap-1 p-2" style={{ minWidth: 'max-content' }}>
                  {subCats.map(cat => {
                    const isSelected = filterCategories.includes(cat.id)
                    return (
                      <button key={cat.id}
                        onClick={() => setFilterCategories(prev =>
                          prev.includes(cat.id) ? prev.filter(c => c !== cat.id) : [...prev, cat.id]
                        )}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 border ${
                          isSelected ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                        style={isSelected ? { backgroundColor: cat.color || '#4B5563' } : {}}>
                        {cat.icon} {cat.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* 필터 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 flex flex-wrap gap-2">
        {/* PRD 2.1: 실소비만 보기 토글 */}
        <div className="w-full flex items-center gap-2 pb-2 border-b border-gray-100 mb-1">
          <button
            type="button"
            onClick={() => setRealConsumptionFilter(v => !v)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${realConsumptionFilter ? 'bg-blue-600' : 'bg-gray-200'}`}
            role="switch"
            aria-checked={realConsumptionFilter}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${realConsumptionFilter ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <span className="text-sm text-gray-700 font-medium">실소비만 보기</span>
          {realConsumptionFilter && <span className="text-xs text-blue-500">저축이체·카드대금 제외</span>}
        </div>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-gray-400 text-sm self-center">~</span>
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {/* 전체 탭일 때만 계좌 드롭다운 표시 */}
        {paymentTab === 'all' && (
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all">전체 계좌</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">전체</option>
          <option value="income">수입</option>
          <option value="expense">지출</option>
          <option value="transfer">이체</option>
          <option value="refund">환급</option>
        </select>
        <div className="relative w-full">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="적요, 금액 검색..."
            className="w-full pl-8 pr-3 border border-gray-200 rounded-lg py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">×</button>
          )}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">수입</div>
          <div className="text-base font-bold text-emerald-600">+{fmtKRW(income)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">지출{refundAmt > 0 ? ' (환급 차감)' : ''}</div>
          <div className="text-base font-bold text-red-500">-{fmtKRW(expense)}</div>
          {refundAmt > 0 && (
            <div className="text-xs text-purple-500 mt-0.5">↩ 환급 -{fmtKRW(refundAmt)}</div>
          )}
          {/* 카드 탭: 당월 결제 vs 할부 이월 */}
          {paymentTab === 'card' && cardCarryoverAmt > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">당월 결제</span>
                <span className="text-[11px] font-semibold text-red-400 tabular-nums">{fmtKRW(cardNewChargeAmt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-orange-400 flex items-center gap-0.5">
                  <span>↩</span> 할부 이월
                </span>
                <span className="text-[11px] font-semibold text-orange-500 tabular-nums">{fmtKRW(cardCarryoverAmt)}</span>
              </div>
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">이체</div>
          <div className="text-base font-bold text-blue-500">{fmtKRW(transfer)}</div>
        </div>
      </div>

      {/* FR-010: 지출 상세 분석 (적금·카드대금 분리) */}
      {(savingExpense > 0 || cardPayExpense > 0) && (
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="text-xs font-semibold text-gray-500 mb-3">지출 상세 분석</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-red-50 rounded-xl p-3">
              <div className="text-xs text-red-400 mb-0.5">실제 지출</div>
              <div className="text-sm font-bold text-red-500">-{fmtKRW(realExpense)}</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-3">
              <div className="text-xs text-amber-500 mb-0.5">카드대금</div>
              <div className="text-sm font-bold text-amber-700">-{fmtKRW(cardPayExpense)}</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3">
              <div className="text-xs text-blue-400 mb-0.5">적금</div>
              <div className="text-sm font-bold text-blue-600">-{fmtKRW(savingExpense)}</div>
            </div>
          </div>
        </div>
      )}

      {/* 검색 결과 건수 */}
      {searchQuery.trim() && (
        <div className="text-sm text-gray-500 mb-2">
          검색 결과 {filtered.length}건
        </div>
      )}

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
              const toAcc = accounts.find(a => a.id === t.toAccountId)
              const usedCard = t.paymentMethod === 'card' ? cards.find(c => c.id === t.cardId) : null
              const isTransfer = t.type === 'transfer'
              const isRefund   = t.type === 'refund'
              const runningBalance = runningBalanceMap.get(t.id)

              const isSavingTx = t.type === 'expense' && isSavingCat(t.categoryId)
              const consumptionType = getConsumptionType(t, categories)
              return (
                <div key={t.id}
                  className={`flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 group hover:bg-gray-50/50 transition-colors cursor-pointer ${isSavingTx ? 'bg-blue-50/40' : ''}`}
                  onClick={() => openEdit(t)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${isTransfer ? 'bg-blue-50' : isRefund ? 'bg-purple-50' : 'bg-gray-50'}`}>
                      {isTransfer ? '↔️' : isRefund ? '↩️' : cat?.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-900 truncate">{t.description}</span>
                        {isRefund && <span className="text-xs bg-purple-100 text-purple-600 font-medium px-1.5 py-0.5 rounded-md flex-shrink-0">환급</span>}
                        {isSavingTx && (
                          t.savingLinks && t.savingLinks.length > 0
                            ? <span className="text-xs bg-emerald-100 text-emerald-600 font-medium px-1.5 py-0.5 rounded-md flex-shrink-0">납입완료 {t.savingLinks.length}건</span>
                            : <span className="text-xs bg-blue-100 text-blue-600 font-medium px-1.5 py-0.5 rounded-md flex-shrink-0">저축</span>
                        )}
                        {t.isInstallment && t.installmentCurrent && t.installmentMonths && (
                          <span className="text-xs bg-blue-100 text-blue-600 font-medium px-1.5 py-0.5 rounded-md flex-shrink-0 whitespace-nowrap">
                            할부 {t.installmentCurrent}/{t.installmentMonths}
                          </span>
                        )}
                        {consumptionType === 'savings_transfer' && (
                          <span className="text-xs bg-teal-100 text-teal-600 font-medium px-1.5 py-0.5 rounded-md flex-shrink-0">저축이체</span>
                        )}
                        {consumptionType === 'card_payment' && (() => {
                          const paidCard = usedCard ?? (t.cardId ? cards.find(c => c.id === t.cardId) : null)
                          return paidCard
                            ? <span className="text-xs font-bold px-2 py-0.5 rounded-md flex-shrink-0 text-white" style={{ backgroundColor: paidCard.color }}>💳 {paidCard.name} 납부</span>
                            : <span className="text-xs bg-gray-800 text-white font-medium px-1.5 py-0.5 rounded-md flex-shrink-0">💳 카드대금</span>
                        })()}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isTransfer ? (
                          <span className="text-xs text-blue-500 font-medium">
                            {acc?.name} <span className="text-gray-400">→</span> {toAcc?.name}
                          </span>
                        ) : (
                          <>
                            <span className="text-xs text-gray-400">{cat?.name}</span>
                            <span className="text-gray-200">·</span>
                            {usedCard ? (
                              <span className="text-xs px-1.5 py-0.5 rounded-md font-medium text-white" style={{ backgroundColor: usedCard.color }}>{usedCard.name}</span>
                            ) : (
                              <span className="text-xs text-gray-400">🏦 {acc?.name}</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      {/* 거래 금액 */}
                      <div className={`text-sm font-semibold ${
                        isTransfer ? 'text-blue-500' :
                        isRefund   ? 'text-purple-600' :
                        t.type === 'income' ? 'text-emerald-600' : 'text-red-500'
                      }`}>
                        {isTransfer ? '' : (t.type === 'income' || isRefund) ? '+' : '-'}{fmtKRW(t.amount)}
                      </div>
                      {/* 거래 후 잔액 — 계좌 필터 선택 시에만 표시 */}
                      {runningBalance !== undefined && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          잔액 {runningBalance.toLocaleString('ko-KR')}원
                        </div>
                      )}
                    </div>
                    {/* 수정 / 삭제 버튼 — hover 시 표시 */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); openEdit(t) }}
                        className="text-xs text-gray-400 hover:text-blue-500 px-1.5 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                      >수정</button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirmId(t.id) }}
                        className="text-xs text-red-600 hover:bg-red-50 px-1.5 py-1 rounded-lg transition-colors"
                      >삭제</button>
                    </div>
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

      {/* ── 추가 / 수정 모달 ────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">
                {isEditing ? '거래 수정' : '거래 추가'}
              </h2>
              <button onClick={closeModal} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">

              {/* 유형 탭 */}
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {([
                  ['expense', '지출',   'bg-red-500'],
                  ['income',  '수입',   'bg-emerald-500'],
                  ['transfer','이체',   'bg-blue-500'],
                  ['refund',  '환급',   'bg-purple-500'],
                ] as const).map(([type, label, activeColor]) => (
                  <button key={type}
                    onClick={() => switchFormType(type)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                      formType === type ? `${activeColor} text-white` : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* 환급 안내 */}
              {formType === 'refund' && (
                <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-2.5 text-xs text-purple-700 leading-relaxed">
                  {form.paymentMethod === 'card'
                    ? <>💳 <strong>카드 환급/할인</strong>: 카드 이용금액에서 차감되며, <strong>거래 내역에만 기록</strong>됩니다. 예산·잔액에는 반영되지 않습니다.</>
                    : <>💜 <strong>통장 환급</strong>: 통장에 <strong>입금</strong>되고, 선택한 지출 항목에서 <strong>차감</strong>됩니다.</>
                  }
                </div>
              )}

              {/* ── 이체 ── */}
              {formType === 'transfer' ? (
                <>
                  <input type="date" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="text" inputMode="numeric" placeholder="이체 금액" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: fmtInput(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="text" placeholder="메모 (선택)" value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">보내는 계좌</label>
                      <select value={form.accountId}
                        onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div className="text-xl text-blue-400 mt-5">→</div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">받는 계좌</label>
                      <select value={form.toAccountId}
                        onChange={e => setForm(f => ({ ...f, toAccountId: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                  </div>
                  {form.amount && form.accountId !== form.toAccountId && (
                    <div className="bg-blue-50 rounded-xl p-3 space-y-1.5">
                      <div className="text-xs font-medium text-blue-700 mb-1">이체 후 잔액</div>
                      {[
                        { acc: accounts.find(a => a.id === form.accountId), delta: -parseAmt(form.amount) },
                        { acc: accounts.find(a => a.id === form.toAccountId), delta: +parseAmt(form.amount) },
                      ].map(({ acc, delta }) => {
                        if (!acc) return null
                        // 수정 모드면 기존 이체는 제외하고 계산
                        const baseTxs = isEditing
                          ? transactions.filter(t => t.id !== editingId)
                          : transactions
                        const cur = computeAccountBalance(acc.id, acc.balance, baseTxs)
                        return (
                          <div key={acc.id} className="flex justify-between text-xs">
                            <span className="text-blue-600">{acc.name}</span>
                            <span className="font-medium text-blue-800">
                              {fmtKRW(cur)} → {fmtKRW(cur + delta)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              ) : (
                /* ── 수입 / 지출 / 환급 ── */
                <>
                  {/* 결제수단 탭 (이체 제외) */}
                  <div className="flex bg-gray-100 rounded-xl p-1">
                    {(['account','card'] as const).map(method => (
                      <button key={method}
                        onClick={() => setForm(f => ({ ...f, paymentMethod: method }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${form.paymentMethod === method ? (formType === 'refund' ? 'bg-purple-500 text-white' : 'bg-blue-600 text-white') : 'text-gray-500'}`}>
                        {method === 'account' ? '🏦 통장' : '💳 카드'}
                      </button>
                    ))}
                  </div>
                  <input type="date" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="text" placeholder="내용"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus={!isEditing}
                  />
                  <input type="text" inputMode="numeric" placeholder="금액" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: fmtInput(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {/* 카드 결제는 계좌 불필요 — 통장일 때만 표시 */}
                  {form.paymentMethod === 'account' && (() => {
                    const filteredAccs = accountSearch.trim()
                      ? accounts.filter(a =>
                          a.name.toLowerCase().includes(accountSearch.trim().toLowerCase()) ||
                          a.bank.toLowerCase().includes(accountSearch.trim().toLowerCase())
                        )
                      : accounts
                    return (
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex items-center px-3 py-2 border-b border-gray-100 bg-gray-50">
                          <span className="text-gray-400 text-xs mr-2">🔍</span>
                          <input
                            type="text"
                            value={accountSearch}
                            onChange={e => setAccountSearch(e.target.value)}
                            placeholder="계좌·은행 검색..."
                            className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400"
                          />
                          {accountSearch && <button onClick={() => setAccountSearch('')} className="text-gray-300 hover:text-gray-500 text-xs">×</button>}
                        </div>
                        <select value={form.accountId}
                          onChange={e => { setForm(f => ({ ...f, accountId: e.target.value })); setAccountSearch('') }}
                          size={Math.min(filteredAccs.length || 1, 4)}
                          className="w-full px-3 py-1 text-sm focus:outline-none bg-white">
                          {filteredAccs.length === 0
                            ? <option disabled>일치하는 계좌 없음</option>
                            : filteredAccs.map(a => <option key={a.id} value={a.id}>{a.name} · {a.bank}</option>)
                          }
                        </select>
                      </div>
                    )
                  })()}
                  {form.paymentMethod === 'card' && (
                    <>
                      <select value={form.cardId}
                        onChange={e => setForm(f => ({ ...f, cardId: e.target.value }))}
                        className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${
                          formType === 'refund' ? 'border-purple-200 focus:ring-purple-400' : 'border-gray-200 focus:ring-blue-500'
                        }`}>
                        {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {/* 할부 선택 — 수정 모드에서는 숨김 */}
                      {!isEditing && formType === 'expense' && (
                        <div>
                          <label className="text-xs text-gray-500 mb-1 block">할부 개월</label>
                          <div className="flex gap-1.5 flex-wrap">
                            {['1','2','3','4','5','6','10','12','24'].map(m => (
                              <button key={m} type="button"
                                onClick={() => setForm(f => ({ ...f, installmentMonths: m }))}
                                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                                  form.installmentMonths === m
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                                }`}>
                                {m === '1' ? '일시불' : `${m}개월`}
                              </button>
                            ))}
                          </div>
                          {Number(form.installmentMonths) > 1 && form.amount && (
                            <div className="mt-2 bg-blue-50 rounded-xl px-3 py-2 text-xs text-blue-700">
                              월 {Math.floor(parseAmt(form.amount) / Number(form.installmentMonths)).toLocaleString('ko-KR')}원
                              × {form.installmentMonths}개월 → 각 달에 거래 자동 추가
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {/* 카드 환급은 카테고리 불필요 (내역에만 표시) */}
                  {!(formType === 'refund' && form.paymentMethod === 'card') && (() => {
                    const accentColor = formType === 'refund' ? 'purple' : formType === 'income' ? 'emerald' : 'blue'
                    const borderCls   = formType === 'refund' ? 'border-purple-200' : 'border-gray-200'
                    const selectedCat = categories.find(c => c.id === form.categoryId)

                    function selectCat(newCatId: string) {
                      setForm(f => ({
                        ...f,
                        categoryId: newCatId,
                        billingMonth: isCardPaymentCat(newCatId) && !f.billingMonth ? prevMonthStr() : f.billingMonth,
                      }))
                      setCatSearch('')
                      if (!isSavingCat(newCatId)) {
                        setSavingLinks([])
                      } else {
                        const cat = categories.find(c => c.id === newCatId)
                        if (cat?.savingId && !savingLinks.some(l => l.savingId === cat.savingId)) {
                          const s = data.savings.find(sv => sv.id === cat.savingId)
                          if (s) setSavingLinks([{ savingId: s.id, amount: s.monthlyAmount ? fmtInput(String(s.monthlyAmount)) : '' }])
                        }
                      }
                    }

                    return (
                      <div className={`border ${borderCls} rounded-xl overflow-hidden`}>
                        {formType === 'refund' && (
                          <div className="px-3 pt-2.5 pb-0 text-xs text-purple-600 font-medium">차감할 지출 항목 선택</div>
                        )}

                        {/* 선택된 카테고리 표시 */}
                        {selectedCat && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100">
                            <span className="text-xs text-gray-400">선택됨</span>
                            <span
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white"
                              style={{ backgroundColor: selectedCat.color || '#4B5563' }}
                            >
                              {selectedCat.icon} {selectedCat.name}
                            </span>
                          </div>
                        )}

                        {/* 검색 */}
                        <div className="flex items-center px-3 py-2 border-b border-gray-100 bg-white gap-2">
                          <span className="text-gray-400 text-xs">🔍</span>
                          <input
                            type="text"
                            value={catSearch}
                            onChange={e => { setCatSearch(e.target.value); if (e.target.value) setCatModalParent('') }}
                            placeholder="카테고리 검색..."
                            className="flex-1 text-xs outline-none text-gray-700 placeholder-gray-400"
                          />
                          {catSearch
                            ? <button onClick={() => setCatSearch('')} className="text-gray-300 hover:text-gray-500 text-xs leading-none">×</button>
                            : <span className="text-[10px] text-gray-300">입력하면 전체 검색</span>
                          }
                        </div>

                        {/* 대분류 탭 (검색 중이 아닐 때) */}
                        {!catSearch && catParentList.length > 0 && (
                          <div className="overflow-x-auto border-b border-gray-100 bg-white">
                            <div className="flex gap-1 px-2 py-1.5" style={{ minWidth: 'max-content' }}>
                              <button
                                onClick={() => setCatModalParent('')}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex-shrink-0 ${
                                  !catModalParent ? `bg-${accentColor}-600 text-white` : 'text-gray-500 hover:bg-gray-100'
                                }`}
                                style={!catModalParent ? { backgroundColor: accentColor === 'emerald' ? '#059669' : accentColor === 'purple' ? '#9333ea' : '#2563eb' } : {}}
                              >
                                전체
                              </button>
                              {catParentList.map(p => (
                                <button key={p.id}
                                  onClick={() => setCatModalParent(prev => prev === p.id ? '' : p.id)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex-shrink-0 whitespace-nowrap ${
                                    catModalParent === p.id ? 'text-white' : 'text-gray-600 hover:bg-gray-100'
                                  }`}
                                  style={catModalParent === p.id ? { backgroundColor: p.color || '#4B5563' } : {}}
                                >
                                  {p.icon} {p.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 소분류 칩 그리드 */}
                        <div className="p-2 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto bg-white">
                          {searchedCats.length === 0 ? (
                            <span className="text-xs text-gray-400 py-2 px-1">일치하는 카테고리가 없습니다</span>
                          ) : searchedCats.map(c => {
                            const isSelected = form.categoryId === c.id
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => selectCat(c.id)}
                                className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                                  isSelected
                                    ? 'text-white border-transparent shadow-sm ring-2 ring-offset-1'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                                }`}
                                style={isSelected
                                  ? { backgroundColor: c.color || '#4B5563' }
                                  : {}}
                              >
                                {c.icon} {c.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* ── 카드대금 청구 월 선택 ── */}
                  {isCardPaymentCat(form.categoryId) && (
                    <div className="border border-purple-100 rounded-xl bg-purple-50/40 p-3">
                      <label className="text-xs font-semibold text-purple-700 block mb-2">💳 청구 월 선택</label>
                      <select
                        value={form.billingMonth}
                        onChange={e => setForm(f => ({ ...f, billingMonth: e.target.value }))}
                        className="w-full border border-purple-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white">
                        <option value="">청구 월 선택 (선택사항)</option>
                        {recentMonthOptions().map(ym => (
                          <option key={ym} value={ym}>{fmtMonthLabel(ym)} 카드대금</option>
                        ))}
                      </select>
                      {form.billingMonth && (
                        <p className="text-xs text-purple-500 mt-1.5">
                          {fmtMonthLabel(form.billingMonth)}에 사용한 카드 내역의 대금을 납부하는 거래로 기록됩니다.
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── PRD 2.1: 거래 유형 선택 (지출 전용) ── */}
                  {formType === 'expense' && (
                    <div className="border border-gray-200 rounded-xl p-3">
                      <label className="text-xs font-semibold text-gray-600 block mb-2">거래 유형</label>
                      <div className="flex gap-1.5">
                        {([
                          ['normal',            '일반 지출'],
                          ['savings_transfer',  '적금·예금 이체'],
                          ['card_payment',      '카드대금 결제'],
                        ] as const).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setForm(f => ({ ...f, consumptionType: f.consumptionType === val ? undefined : val }))}
                            className={`flex-1 px-2 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                              form.consumptionType === val
                                ? val === 'savings_transfer'
                                  ? 'bg-teal-500 text-white border-teal-500'
                                  : val === 'card_payment'
                                  ? 'bg-gray-500 text-white border-gray-500'
                                  : 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">미선택 시 카테고리 역할로 자동 감지됩니다.</p>
                    </div>
                  )}

                  {/* ── 적금·예금 상품 연동 섹션 ── */}
                  {formType === 'expense' && isSavingCat(form.categoryId) && (
                    <div className="border border-blue-100 rounded-xl bg-blue-50/40 p-3 space-y-2.5">
                      <div className="text-xs font-semibold text-blue-700">💰 저축 상품 연동 (적금·예금·청약)</div>

                      {data.savings.length === 0 ? (
                        <div className="text-center py-3">
                          <p className="text-xs text-gray-400 mb-2">등록된 적금·예금 상품이 없습니다</p>
                          <button
                            type="button"
                            onClick={() => setShowQuickAddSaving(true)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium underline">
                            + 새 상품 추가
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* 상품 검색 */}
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
                            <input
                              type="text"
                              value={savingSearch}
                              onChange={e => setSavingSearch(e.target.value)}
                              placeholder="상품명 검색..."
                              className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                          </div>

                          {/* 미선택 상품 목록 */}
                          {(() => {
                            const unlinked = data.savings.filter(s =>
                              !savingLinks.some(l => l.savingId === s.id) &&
                              (!savingSearch.trim() || s.name.includes(savingSearch.trim()) || s.bank.includes(savingSearch.trim()))
                            )
                            return unlinked.length > 0 ? (
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {unlinked.map(s => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                      const defaultAmt = s.monthlyAmount
                                        ? fmtInput(String(s.monthlyAmount))
                                        : (form.amount || '')
                                      setSavingLinks(prev => [...prev, { savingId: s.id, amount: defaultAmt }])
                                      setSavingSearch('')
                                    }}
                                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left">
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                          s.type === 'saving' ? 'bg-blue-50 text-blue-500' :
                                          s.type === 'deposit' ? 'bg-amber-50 text-amber-500' :
                                          'bg-teal-50 text-teal-500'
                                        }`}>{s.type === 'saving' ? '적금' : s.type === 'deposit' ? '예금' : '청약'}</span>
                                        <span className="text-xs font-medium text-gray-800">{s.name}</span>
                                      </div>
                                      <span className="text-xs text-gray-400">{s.bank}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {s.monthlyAmount > 0 && (
                                        <span className="text-xs text-gray-400">{fmtKRW(s.monthlyAmount)}</span>
                                      )}
                                      <span className="text-xs text-blue-500 font-bold">+</span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              savingSearch.trim() && <p className="text-xs text-gray-400 text-center py-1">일치하는 상품 없음</p>
                            )
                          })()}

                          {/* 선택된 상품 & 금액 입력 */}
                          {savingLinks.length > 0 && (
                            <div className="space-y-1.5 pt-1 border-t border-blue-100">
                              <div className="text-xs text-gray-500 font-medium">연동 상품</div>
                              {savingLinks.map((link, i) => {
                                const s = data.savings.find(sv => sv.id === link.savingId)
                                return (
                                  <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-2 border border-blue-100">
                                    <div className="flex-1 min-w-0">
                                      <span className="text-xs font-medium text-gray-800 truncate block">{s?.name}</span>
                                      <span className="text-xs text-gray-400">{s?.bank}</span>
                                    </div>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={link.amount}
                                      onChange={e => setSavingLinks(prev => prev.map((l, j) =>
                                        j === i ? { ...l, amount: fmtInput(e.target.value) } : l
                                      ))}
                                      placeholder="금액"
                                      className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setSavingLinks(prev => prev.filter((_, j) => j !== i))}
                                      className="text-gray-300 hover:text-red-400 text-sm leading-none flex-shrink-0">×</button>
                                  </div>
                                )
                              })}
                              {/* 남은 금액 */}
                              {form.amount && (() => {
                                const total = parseAmt(form.amount)
                                const linked = savingLinks.reduce((s, l) => s + parseAmt(l.amount), 0)
                                const remaining = total - linked
                                return (
                                  <div className={`text-xs text-right font-medium ${remaining < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                                    남은 금액: {remaining < 0 ? '-' : ''}{fmtKRW(Math.abs(remaining))}
                                    {remaining < 0 && ' ⚠️ 초과'}
                                  </div>
                                )
                              })()}
                            </div>
                          )}

                          {/* + 새 상품 추가 */}
                          <button
                            type="button"
                            onClick={() => setShowQuickAddSaving(true)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                            + 새 상품 추가
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-2 pt-1">
                {isEditing && (
                  <button
                    onClick={() => setDeleteConfirmId(editingId!)}
                    className="px-4 py-3 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">
                    삭제
                  </button>
                )}
                <button onClick={handleSave}
                  className={`flex-1 text-white font-semibold py-3 rounded-xl transition-colors ${
                    formType === 'transfer' ? 'bg-blue-500 hover:bg-blue-600' :
                    formType === 'income'   ? 'bg-emerald-500 hover:bg-emerald-600' :
                    formType === 'refund'   ? 'bg-purple-500 hover:bg-purple-600' :
                                             'bg-red-500 hover:bg-red-600'
                  }`}>
                  {isEditing ? '수정 완료' : formType === 'transfer' ? '이체하기' : formType === 'refund' ? '환급 추가' : '추가하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 적금 빠른 추가 모달 (z-[60]: 메인 모달보다 위) ── */}
      {showQuickAddSaving && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">새 상품 추가</h3>
              <button onClick={() => setShowQuickAddSaving(false)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              {/* 적금/예금/청약 탭 */}
              <div className="flex bg-gray-100 rounded-xl p-1">
                {(['saving', 'deposit', 'subscription'] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setQuickSavingForm(f => ({ ...f, type: t }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${quickSavingForm.type === t ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
                    {t === 'saving' ? '적금' : t === 'deposit' ? '예금' : '청약'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="상품명 *" value={quickSavingForm.name}
                  onChange={e => setQuickSavingForm(f => ({ ...f, name: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" placeholder="은행명 *" value={quickSavingForm.bank}
                  onChange={e => setQuickSavingForm(f => ({ ...f, bank: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <input type="text" inputMode="numeric"
                placeholder={quickSavingForm.type === 'saving' ? '월 납입액 (원) *' : '원금 (원) *'}
                value={quickSavingForm.monthlyAmount}
                onChange={e => setQuickSavingForm(f => ({ ...f, monthlyAmount: fmtInput(e.target.value) }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="연 이율 (%)" value={quickSavingForm.interestRate}
                  onChange={e => setQuickSavingForm(f => ({ ...f, interestRate: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <div>
                  <label className="text-xs text-gray-400 block mb-0.5">가입일</label>
                  <input type="date" value={quickSavingForm.startDate}
                    onChange={e => setQuickSavingForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-0.5">만기일</label>
                <input type="date" value={quickSavingForm.maturityDate}
                  onChange={e => setQuickSavingForm(f => ({ ...f, maturityDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button
                type="button"
                onClick={handleQuickAddSaving}
                disabled={!quickSavingForm.name || !quickSavingForm.bank || !quickSavingForm.monthlyAmount}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                추가 후 연동하기
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <TransactionImport onClose={() => setShowImport(false)} />
      )}

      {/* PRD 2.3: 삭제 확인 모달 */}
      {deleteConfirmId !== null && (
        <DeleteConfirmModal
          onConfirm={() => {
            deleteTransaction(deleteConfirmId)
            setDeleteConfirmId(null)
            closeModal()
          }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  )
}
