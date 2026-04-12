'use client'

import { useState, useCallback } from 'react'
import { useApp, computeAccountBalance } from '@/lib/AppContext'
import { Transaction, PaymentMethod } from '@/types'
import TransactionImport from '@/components/TransactionImport'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }

const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`
type PaymentTab = 'all' | 'account' | 'card'
type TxFormType = 'expense' | 'income' | 'transfer'

interface FormState {
  date: string
  description: string
  amount: string
  accountId: string
  toAccountId: string
  categoryId: string
  paymentMethod: PaymentMethod
  cardId: string
}

export default function TransactionsPage() {
  const { data, categories, addTransaction, updateTransaction, deleteTransaction } = useApp()
  const { accounts, transactions, cards } = data

  const [month, setMonth] = useState(currentMonth)
  const [filterAccount, setFilterAccount] = useState('all')
  const [filterCard, setFilterCard] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [paymentTab, setPaymentTab] = useState<PaymentTab>('all')

  // 모달 상태 — editingId가 있으면 수정 모드
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [formType, setFormType] = useState<TxFormType>('expense')

  const defaultForm = useCallback((): FormState => ({
    date: today.toISOString().slice(0, 10),
    description: '',
    amount: '',
    accountId: accounts[0]?.id || '',
    toAccountId: accounts[1]?.id || accounts[0]?.id || '',
    categoryId: categories.find(c => c.type === 'expense' && c.parentId !== null)?.id || '',
    paymentMethod: 'account',
    cardId: cards[0]?.id || '',
  }), [accounts, cards, categories])

  const [form, setForm] = useState<FormState>(defaultForm)

  // ── 필터링 ──────────────────────────────────────────────────────────────────
  const filtered = transactions
    .filter(t => t.date.startsWith(month))
    .filter(t => filterAccount === 'all' || t.accountId === filterAccount || t.toAccountId === filterAccount)
    .filter(t => filterType === 'all' || t.type === filterType)
    .filter(t => paymentTab === 'all' || (t.type !== 'transfer' && t.paymentMethod === paymentTab))
    .filter(t => filterCard === 'all' || (t.paymentMethod === 'card' && t.cardId === filterCard))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))

  const income   = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense  = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const transfer = filtered.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0)

  // 계좌별 실시간 잔액 (전체 거래 기준, 월 필터 없음)
  const accountBalances = accounts.map(acc => ({
    acc,
    balance: computeAccountBalance(acc.id, acc.balance, transactions),
  }))

  // 카드별 이번 달 누적 (월 필터 적용)
  const cardMonthlyTotals = cards.map(card => ({
    card,
    total: transactions
      .filter(t => t.date.startsWith(month) && t.paymentMethod === 'card' && t.cardId === card.id && t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0),
  }))

  const grouped = filtered.reduce<Record<string, Transaction[]>>((acc, t) => {
    if (!acc[t.date]) acc[t.date] = []
    acc[t.date].push(t)
    return acc
  }, {})

  // ── 모달 열기 ────────────────────────────────────────────────────────────────
  function openAdd() {
    setEditingId(null)
    setFormType('expense')
    setForm(defaultForm())
    setShowModal(true)
  }

  function openEdit(t: Transaction) {
    setEditingId(t.id)
    const type = t.type as TxFormType
    setFormType(type)
    setForm({
      date: t.date,
      description: t.description,
      amount: String(t.amount),
      accountId: t.accountId,
      toAccountId: t.toAccountId || accounts[1]?.id || accounts[0]?.id || '',
      categoryId: t.categoryId,
      paymentMethod: t.paymentMethod,
      cardId: t.cardId || cards[0]?.id || '',
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingId(null)
  }

  // ── 저장 ─────────────────────────────────────────────────────────────────────
  function handleSave() {
    if (!form.amount) return

    let tx: Transaction

    if (formType === 'transfer') {
      if (!form.accountId || !form.toAccountId) return
      if (form.accountId === form.toAccountId) return alert('보내는 계좌와 받는 계좌가 같습니다.')
      tx = {
        id: editingId || `t${Date.now()}`,
        date: form.date,
        description: form.description || '계좌 이체',
        amount: Number(form.amount),
        type: 'transfer',
        accountId: form.accountId,
        toAccountId: form.toAccountId,
        categoryId: 'transfer',
        paymentMethod: 'account',
      }
    } else {
      if (!form.description) return
      tx = {
        id: editingId || `t${Date.now()}`,
        date: form.date,
        description: form.description,
        amount: Number(form.amount),
        type: formType,
        accountId: form.accountId,
        categoryId: form.categoryId,
        paymentMethod: form.paymentMethod,
        cardId: form.paymentMethod === 'card' ? form.cardId : undefined,
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
    if (t !== 'transfer') {
      setForm(f => ({
        ...f,
        categoryId: categories.find(c => c.type === t && c.parentId !== null)?.id || ''
      }))
    }
  }

  const filteredCats = categories.filter(c => c.type === formType && c.parentId !== null)
  const isEditing = !!editingId

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
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
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setFilterAccount('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
              filterAccount === 'all'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}>
            전체
          </button>
          {accountBalances.map(({ acc, balance }) => (
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

      {/* 필터 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 flex flex-wrap gap-2">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
        </select>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">수입</div>
          <div className="text-base font-bold text-emerald-600">+{fmtKRW(income)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">지출</div>
          <div className="text-base font-bold text-red-500">-{fmtKRW(expense)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">이체</div>
          <div className="text-base font-bold text-blue-500">{fmtKRW(transfer)}</div>
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
              const toAcc = accounts.find(a => a.id === t.toAccountId)
              const usedCard = t.paymentMethod === 'card' ? cards.find(c => c.id === t.cardId) : null
              const isTransfer = t.type === 'transfer'

              return (
                <div key={t.id}
                  className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 group hover:bg-gray-50/50 transition-colors cursor-pointer"
                  onClick={() => openEdit(t)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${isTransfer ? 'bg-blue-50' : 'bg-gray-50'}`}>
                      {isTransfer ? '↔️' : cat?.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{t.description}</div>
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
                    <div className={`text-sm font-semibold ${
                      isTransfer ? 'text-blue-500' :
                      t.type === 'income' ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {isTransfer ? '' : t.type === 'income' ? '+' : '-'}{fmtKRW(t.amount)}
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

              {/* 유형 탭 — 수정 모드에서는 변경 불가 */}
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {([
                  ['expense', '지출', 'bg-red-500'],
                  ['income',  '수입', 'bg-emerald-500'],
                  ['transfer','이체', 'bg-blue-500'],
                ] as const).map(([type, label, activeColor]) => (
                  <button key={type}
                    onClick={() => !isEditing && switchFormType(type)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      formType === type ? `${activeColor} text-white` : 'text-gray-500'
                    } ${isEditing ? 'cursor-default' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── 이체 ── */}
              {formType === 'transfer' ? (
                <>
                  <input type="date" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="number" placeholder="이체 금액" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
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
                        { acc: accounts.find(a => a.id === form.accountId), delta: -Number(form.amount) },
                        { acc: accounts.find(a => a.id === form.toAccountId), delta: +Number(form.amount) },
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
                /* ── 수입 / 지출 ── */
                <>
                  <div className="flex bg-gray-100 rounded-xl p-1">
                    {(['account','card'] as const).map(method => (
                      <button key={method}
                        onClick={() => setForm(f => ({ ...f, paymentMethod: method }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${form.paymentMethod === method ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
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
                  <input type="number" placeholder="금액" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <select value={form.accountId}
                    onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  {form.paymentMethod === 'card' && (
                    <select value={form.cardId}
                      onChange={e => setForm(f => ({ ...f, cardId: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  <select value={form.categoryId}
                    onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {filteredCats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
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
                                             'bg-red-500 hover:bg-red-600'
                  }`}>
                  {isEditing ? '수정 완료' : formType === 'transfer' ? '이체하기' : '추가하기'}
                </button>
              </div>
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
