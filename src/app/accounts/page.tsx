'use client'

import { useState } from 'react'
import { useApp } from '@/lib/AppContext'
import { Account } from '@/types'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function parseAmt(s: string) { return parseInt(s.replace(/[^0-9]/g, '')) || 0 }
function fmtInput(s: string) { const n = parseAmt(s); return n === 0 ? '' : n.toLocaleString('ko-KR') }

const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`

// FR-012: 은행 프리셋 (브랜드 색상 + 약칭)
const BANK_PRESETS = [
  { name: '토스뱅크',   abbr: '토스',  color: '#0064FF' },
  { name: '카카오뱅크', abbr: '카카오', color: '#FEE500', textColor: '#3D3000' },
  { name: 'KB국민은행', abbr: 'KB',    color: '#FFC500', textColor: '#3D2800' },
  { name: '국민은행',   abbr: 'KB',    color: '#FFC500', textColor: '#3D2800' },   // alias
  { name: '신한은행',   abbr: '신한',  color: '#005BAC' },
  { name: '우리은행',   abbr: '우리',  color: '#007BC7' },
  { name: '하나은행',   abbr: '하나',  color: '#008C6E' },
  { name: 'NH농협',     abbr: '농협',  color: '#007B40' },
  { name: '광주은행',   abbr: '광주',  color: '#00B493' },
  { name: '기타',       abbr: '기타',  color: '#888888' },
]

function getBankPreset(bankName: string) {
  return BANK_PRESETS.find(b => b.name === bankName) ?? null
}

// 계좌 아이콘: 은행명이 프리셋에 있으면 약칭+브랜드색, 없으면 첫 글자
function AccountIcon({ account }: { account: Account }) {
  const preset = getBankPreset(account.bank)
  const bg     = preset?.color ?? account.color
  const text   = preset ? (preset.textColor ?? '#fff') : '#fff'
  const label  = preset ? preset.abbr : account.name.charAt(0)
  const isLong = label.length > 2

  return (
    <div
      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold flex-shrink-0 ${isLong ? 'text-xs' : 'text-sm'}`}
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </div>
  )
}

const EMPTY_FORM = { name: '', bank: '토스뱅크', balance: '', color: '#0064FF' }

export default function AccountsPage() {
  const { data, setAccounts } = useApp()
  const { accounts, transactions } = data

  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm]     = useState(EMPTY_FORM)

  function getMonthlyIncome(id: string) {
    return transactions.filter(t => t.accountId === id && t.date.startsWith(currentMonth) && t.type === 'income').reduce((s,t) => s+t.amount, 0)
  }
  function getMonthlyExpense(id: string) {
    return transactions.filter(t => t.accountId === id && t.date.startsWith(currentMonth) && t.type === 'expense').reduce((s,t) => s+t.amount, 0)
  }
  function getRecentTx(id: string) {
    return transactions.filter(t => t.accountId === id).sort((a,b) => new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,3)
  }

  // 은행 선택 시 색상 자동 적용
  function handleBankChange(bankName: string) {
    const preset = getBankPreset(bankName)
    setForm(f => ({ ...f, bank: bankName, color: preset?.color ?? f.color }))
  }

  function openAdd() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(acc: Account) {
    setEditId(acc.id)
    setForm({ name: acc.name, bank: acc.bank, balance: acc.balance === 0 ? '' : fmtInput(String(acc.balance)), color: acc.color })
    setShowModal(true)
  }

  function handleSave() {
    if (!form.name || !form.bank) return
    const preset = getBankPreset(form.bank)
    const color  = preset?.color ?? form.color
    const balance = parseAmt(form.balance)

    if (editId) {
      setAccounts(accounts.map(a =>
        a.id === editId ? { ...a, name: form.name, bank: form.bank, balance, color } : a
      ))
    } else {
      setAccounts([...accounts, {
        id: `acc${Date.now()}`, name: form.name, bank: form.bank, balance, color,
      } as Account])
    }
    setShowModal(false)
    setEditId(null)
    setForm(EMPTY_FORM)
  }

  function handleDelete(id: string) { setAccounts(accounts.filter(a => a.id !== id)) }
  function handleBalanceEdit(id: string, val: string) {
    setAccounts(accounts.map(a => a.id === id ? { ...a, balance: parseAmt(val) } : a))
  }

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">계좌 관리</h1>
        <button onClick={openAdd} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">
          + 계좌 추가
        </button>
      </div>

      <div className="bg-blue-600 text-white rounded-2xl p-5 mb-5">
        <div className="text-sm opacity-80 mb-1">전체 잔액</div>
        <div className="text-3xl font-bold">{fmtKRW(totalBalance)}</div>
        <div className="text-sm opacity-70 mt-1">계좌 {accounts.length}개</div>
      </div>

      <div className="space-y-3">
        {accounts.map(acc => {
          const income   = getMonthlyIncome(acc.id)
          const expense  = getMonthlyExpense(acc.id)
          const recentTx = getRecentTx(acc.id)

          return (
            <div key={acc.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {/* FR-012: 브랜드 아이콘 */}
                    <AccountIcon account={acc} />
                    <div>
                      <div className="font-semibold text-gray-900">{acc.name}</div>
                      <div className="text-xs text-gray-400">{acc.bank}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      <input type="text" inputMode="numeric"
                        value={acc.balance === 0 ? '' : acc.balance.toLocaleString('ko-KR')}
                        onChange={e => handleBalanceEdit(acc.id, e.target.value)}
                        className="text-xl font-bold text-gray-900 text-right w-36 border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none transition-colors bg-transparent" />
                      <span className="text-sm text-gray-400">원</span>
                    </div>
                    <div className="flex gap-3 justify-end mt-0.5">
                      {/* FR-012: 수정 버튼 */}
                      <button onClick={() => openEdit(acc)} className="text-xs text-blue-400 hover:text-blue-600">수정</button>
                      <button onClick={() => handleDelete(acc.id)} className="text-xs text-gray-300 hover:text-red-400">삭제</button>
                    </div>
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

      {/* 추가/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editId ? '계좌 수정' : '계좌 추가'}</h2>
              <button onClick={() => { setShowModal(false); setEditId(null) }} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <input type="text" placeholder="계좌명" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

              {/* FR-012: 은행 선택 드롭다운 */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">은행 선택</label>
                <select value={form.bank} onChange={e => handleBankChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {BANK_PRESETS.map(b => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* FR-012: 선택 은행 미리보기 */}
              {form.bank && (
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-2.5">
                  {(() => {
                    const preset = getBankPreset(form.bank)
                    const bg     = preset?.color ?? form.color
                    const txtClr = preset?.textColor ?? '#fff'
                    const label  = preset ? preset.abbr : form.name.charAt(0) || '?'
                    return (
                      <>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: bg, color: txtClr }}>
                          {label}
                        </div>
                        <span className="text-sm text-gray-600">{form.bank} 아이콘 미리보기</span>
                      </>
                    )
                  })()}
                </div>
              )}

              <input type="text" inputMode="numeric" placeholder="현재 잔액 (원)" value={form.balance}
                onChange={e => setForm(f => ({ ...f, balance: fmtInput(e.target.value) }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

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
