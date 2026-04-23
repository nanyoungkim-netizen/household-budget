'use client'

import { useState, useCallback, useEffect } from 'react'
import { useApp, computeAccountBalance } from '@/lib/AppContext'
import { Transaction, PaymentMethod, Saving } from '@/types'
import TransactionImport from '@/components/TransactionImport'

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
  const [catChipSearch, setCatChipSearch] = useState('')
  const [catParentFilter, setCatParentFilter] = useState('')
  const [fromBudgetLabel, setFromBudgetLabel] = useState('')
  const [accountChipSearch, setAccountChipSearch] = useState('')

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
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))

  const income    = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenseRaw = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const refundAmt  = filtered.filter(t => t.type === 'refund').reduce((s, t) => s + t.amount, 0)
  const expense   = Math.max(0, expenseRaw - refundAmt)
  const transfer  = filtered.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0)
  // FR-010: 적금 분리 계산
  const savingExpense = filtered.filter(t => t.type === 'expense' && isSavingCat(t.categoryId)).reduce((s, t) => s + t.amount, 0)
  const realExpense   = Math.max(0, expense - savingExpense)

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
    if (t === 'refund') {
      // 환급은 지출 카테고리를 사용
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

  // FR-004: 카테고리 드롭다운 검색
  const [catSearch, setCatSearch] = useState('')
  // 계좌 선택 검색 (모달)
  const [accountSearch, setAccountSearch] = useState('')
  const searchedCats = catSearch.trim()
    ? filteredCats.filter(c => c.name.toLowerCase().includes(catSearch.trim().toLowerCase()))
    : filteredCats

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
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setFilterCard('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
              filterCard === 'all'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}>
            전체 카드
          </button>
          {cardMonthlyTotals.map(({ card, total }) => (
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
      )}

      {/* 카테고리 필터 (대분류 탭 + 소분류 칩) */}
      {(() => {
        const leafCats = categories.filter(c => c.parentId != null)
        if (leafCats.length === 0) return null
        const parentCats = categories.filter(c => c.parentId === null)
        const preFiltered = catParentFilter
          ? leafCats.filter(c => c.parentId === catParentFilter)
          : leafCats
        const visibleCats = catChipSearch.trim()
          ? preFiltered.filter(c => c.name.toLowerCase().includes(catChipSearch.trim().toLowerCase()))
          : preFiltered
        return (
          <div className="mb-3 bg-white rounded-2xl shadow-sm p-3">
            {/* 대분류 탭 */}
            <div className="overflow-x-auto mb-2">
              <div className="flex gap-1.5 pb-0.5" style={{ minWidth: 'max-content' }}>
                <button
                  onClick={() => { setCatParentFilter(''); setCatChipSearch('') }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex-shrink-0 transition-all ${
                    !catParentFilter ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  }`}>
                  전체
                </button>
                {parentCats.map(p => (
                  <button key={p.id}
                    onClick={() => { setCatParentFilter(prev => prev === p.id ? '' : p.id); setCatChipSearch('') }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex-shrink-0 transition-all ${
                      catParentFilter === p.id ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}
                    style={catParentFilter === p.id ? { backgroundColor: p.color || '#4B5563', borderColor: p.color || '#4B5563' } : {}}>
                    {p.icon} {p.name}
                    <span className="ml-1 opacity-50 text-[10px]">{leafCats.filter(c => c.parentId === p.id).length}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* 소분류 검색 */}
            <div className="relative mb-2">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
              <input
                type="text"
                value={catChipSearch}
                onChange={e => setCatChipSearch(e.target.value)}
                placeholder="소분류 검색..."
                className="w-full pl-7 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {catChipSearch && (
                <button onClick={() => setCatChipSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-xs">×</button>
              )}
            </div>
            {/* 소분류 칩 */}
            <div className="overflow-x-auto">
              <div className="flex gap-1.5 pb-0.5" style={{ minWidth: 'max-content' }}>
                {!catChipSearch.trim() && !catParentFilter && (
                  <button
                    onClick={() => setFilterCategories([])}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex-shrink-0 ${
                      filterCategories.length === 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                    }`}>
                    전체
                  </button>
                )}
                {visibleCats.length === 0 && (
                  <span className="text-xs text-gray-400 py-1.5 px-2">일치하는 카테고리 없음</span>
                )}
                {visibleCats.map(cat => (
                  <button key={cat.id}
                    onClick={() => { setFilterCategories(prev =>
                      prev.includes(cat.id) ? prev.filter(c => c !== cat.id) : [...prev, cat.id]
                    ); setCatChipSearch('') }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs border transition-all flex-shrink-0 ${
                      filterCategories.includes(cat.id) ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}
                    style={filterCategories.includes(cat.id) ? { backgroundColor: cat.color || '#4B5563' } : {}}>
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>
            </div>
            {/* 선택된 카테고리 */}
            {filterCategories.length > 0 && !catChipSearch && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-gray-400">선택:</span>
                {filterCategories.map(id => {
                  const cat = categories.find(c => c.id === id)
                  return cat ? (
                    <span key={id} className="text-xs text-white px-2 py-0.5 rounded-lg font-medium flex items-center gap-1"
                      style={{ backgroundColor: cat.color || '#4B5563' }}>
                      {cat.icon} {cat.name}
                      <button onClick={() => setFilterCategories(prev => prev.filter(c => c !== id))} className="opacity-70 hover:opacity-100 leading-none">×</button>
                    </span>
                  ) : null
                })}
                <button onClick={() => setFilterCategories([])} className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">전체 해제</button>
              </div>
            )}
          </div>
        )
      })()}

      {/* 필터 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 flex flex-wrap gap-2">
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
            <div className="text-xs text-purple-500 mt-0.5">환급 -{fmtKRW(refundAmt)}</div>
          )}
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">이체</div>
          <div className="text-base font-bold text-blue-500">{fmtKRW(transfer)}</div>
        </div>
      </div>

      {/* FR-010: 지출 내 적금 분리 요약 */}
      {savingExpense > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="text-xs font-semibold text-gray-500 mb-3">지출 상세 분석</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-red-50 rounded-xl p-3">
              <div className="text-xs text-red-400 mb-0.5">실제 지출</div>
              <div className="text-sm font-bold text-red-500">-{fmtKRW(realExpense)}</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3">
              <div className="text-xs text-blue-400 mb-0.5">적금 (저축)</div>
              <div className="text-sm font-bold text-blue-600">-{fmtKRW(savingExpense)}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-0.5">합계</div>
              <div className="text-sm font-bold text-gray-700">-{fmtKRW(expense)}</div>
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
                        onClick={e => { e.stopPropagation(); deleteTransaction(t.id) }}
                        className="text-xs text-gray-300 hover:text-red-400 px-1.5 py-1 rounded-lg hover:bg-red-50 transition-colors"
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
                  {!(formType === 'refund' && form.paymentMethod === 'card') && (
                    <>
                      {formType === 'refund' && (
                        <label className="text-xs text-gray-500 -mb-1 block">차감할 지출 항목 선택</label>
                      )}
                      {/* FR-004: 검색 가능한 카테고리 선택 */}
                      <div className={`border rounded-xl overflow-hidden ${formType === 'refund' ? 'border-purple-200' : 'border-gray-200'}`}>
                        <div className="flex items-center px-3 py-2 border-b border-gray-100 bg-gray-50">
                          <span className="text-gray-400 text-xs mr-2">🔍</span>
                          <input
                            type="text"
                            value={catSearch}
                            onChange={e => setCatSearch(e.target.value)}
                            placeholder="카테고리 검색..."
                            className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400"
                          />
                          {catSearch && <button onClick={() => setCatSearch('')} className="text-gray-300 hover:text-gray-500 text-xs">×</button>}
                        </div>
                        <select value={form.categoryId}
                          onChange={e => {
                            const newCatId = e.target.value
                            setForm(f => ({
                              ...f,
                              categoryId: newCatId,
                              billingMonth: isCardPaymentCat(newCatId) && !f.billingMonth ? prevMonthStr() : f.billingMonth,
                            }))
                            setCatSearch('')
                            if (!isSavingCat(newCatId)) {
                              setSavingLinks([])
                            } else {
                              // 카테고리에 연동 상품이 설정돼 있으면 자동 선택
                              const cat = categories.find(c => c.id === newCatId)
                              if (cat?.savingId && !savingLinks.some(l => l.savingId === cat.savingId)) {
                                const s = data.savings.find(sv => sv.id === cat.savingId)
                                if (s) setSavingLinks([{ savingId: s.id, amount: s.monthlyAmount ? fmtInput(String(s.monthlyAmount)) : '' }])
                              }
                            }
                          }}
                          size={Math.min(searchedCats.length || 1, 5)}
                          className={`w-full px-3 py-1 text-sm focus:outline-none bg-white ${
                            formType === 'refund' ? 'focus:ring-purple-400' : 'focus:ring-blue-500'
                          }`}>
                          {searchedCats.length === 0
                            ? <option disabled>일치하는 카테고리가 없습니다.</option>
                            : searchedCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)
                          }
                        </select>
                      </div>
                    </>
                  )}

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
                    onClick={() => { deleteTransaction(editingId!); closeModal() }}
                    className="px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-50 transition-colors border border-red-100">
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
    </div>
  )
}
