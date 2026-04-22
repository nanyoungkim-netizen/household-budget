'use client'

import { useState } from 'react'
import { useApp, DEFAULT_CATEGORIES, computeAccountBalance } from '@/lib/AppContext'
import { Account, Card, Category, MappingRule } from '@/types'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function parseAmt(s: string) { return parseInt(s.replace(/[^0-9]/g, '')) || 0 }
function fmtInput(s: string) { const n = parseAmt(s); return n === 0 ? '' : n.toLocaleString('ko-KR') }

const PRESET_COLORS = ['#0064FF','#FFB800','#00B493','#FF6B6B','#4ECDC4','#9B59B6','#E67E22','#1ABC9C','#E74C3C','#0065CC','#E60000','#1A1A1A','#1259AA','#2ECC71','#F39C12']
const PRESET_ICONS = ['🏠','🍽️','🚌','📱','🛡️','💰','🏦','💳','📦','🎁','✈️','🍺','🧴','📺','⚡','💧','🔥','🛍️','📚','❤️','🎵','🏋️','🌿','🎯']

// 은행 약칭 프리셋
const BANK_PRESETS = [
  { name: '토스뱅크',   abbr: '토스',   color: '#0064FF' },
  { name: '카카오뱅크', abbr: '카카오', color: '#FEE500', textColor: '#3D3000' },
  { name: 'KB국민은행', abbr: 'KB',     color: '#FFC500', textColor: '#3D2800' },
  { name: '국민은행',   abbr: 'KB',     color: '#FFC500', textColor: '#3D2800' },
  { name: '신한은행',   abbr: '신한',   color: '#005BAC' },
  { name: '우리은행',   abbr: '우리',   color: '#007BC7' },
  { name: '하나은행',   abbr: '하나',   color: '#008C6E' },
  { name: 'NH농협',     abbr: '농협',   color: '#007B40' },
  { name: '광주은행',   abbr: '광주',   color: '#00B493' },
  { name: '카카오페이', abbr: '카카오', color: '#FEE500', textColor: '#3D3000' },
  { name: '삼성카드',   abbr: '삼성',   color: '#1259AA' },
]
function getBankPreset(bankName: string) {
  return BANK_PRESETS.find(b => b.name === bankName) ?? null
}
function AccIcon({ acc }: { acc: Account }) {
  const preset   = getBankPreset(acc.bank)
  const bg       = preset?.color ?? acc.color
  const textColor = preset?.textColor ?? '#fff'
  // 윗줄: 은행 약칭 → 은행명(직접) → 계좌명 첫글자 순으로 폴백
  const topLabel = preset ? preset.abbr : (acc.bank ? acc.bank.slice(0, 3) : acc.name.charAt(0))
  // 아랫줄: 계좌명 앞 3자 (공백 제거)
  const nameShort = acc.name.replace(/\s/g, '').slice(0, 3)
  return (
    <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold flex-shrink-0 leading-tight"
      style={{ backgroundColor: bg, color: textColor }}>
      <span className={topLabel.length > 2 ? 'text-[9px]' : 'text-[11px]'}>{topLabel}</span>
      {nameShort && (
        <span className="text-[9px] opacity-80 mt-0.5">{nameShort}</span>
      )}
    </div>
  )
}

type TabType = '통장' | '카드' | '카테고리' | '규칙'

export default function SettingsPage() {
  const { data, user, signOut, setAccounts, setCards, setCategories, setMappingRules, resetAll } = useApp()
  const { accounts, cards, categories, transactions, mappingRules } = data
  const [tab, setTab] = useState<TabType>('통장')

  // ── 통장 상태 ──────────────────────────────────────────────────────────────
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [editAccountId, setEditAccountId] = useState<string | null>(null)   // null=추가, string=수정
  const [editBalances, setEditBalances] = useState<Record<string, string>>({})
  const [editingAccount, setEditingAccount] = useState<string | null>(null)
  const [accountForm, setAccountForm] = useState({ name: '', bank: '', color: '#0064FF', balance: '' })

  // FR-006: 잔액 검증
  const [verifyInputs, setVerifyInputs] = useState<Record<string, string>>({})
  const [verifyOpen, setVerifyOpen] = useState<Record<string, boolean>>({})

  // ── 카드 상태 ──────────────────────────────────────────────────────────────
  const [showCardModal, setShowCardModal] = useState(false)
  const [cardForm, setCardForm] = useState({ name: '', bank: '', billingDate: '15', color: '#0065CC' })

  // ── 카테고리 상태 ──────────────────────────────────────────────────────────
  const [catModal, setCatModal] = useState<'child' | 'parent' | 'edit' | null>(null)
  const [catParentId, setCatParentId] = useState('')
  const [newCat, setNewCat] = useState({ name: '', icon: '📦', color: '#CFD8DC', savingId: '' })
  const [newParent, setNewParent] = useState({ name: '', icon: '📦', color: '#CFD8DC', type: 'expense' as 'expense' | 'income' })
  const [confirmReset, setConfirmReset] = useState(false)

  // ── FR-08: 자동 분류 규칙 상태 ────────────────────────────────────────────
  const [ruleKeyword, setRuleKeyword]   = useState('')
  const [ruleCatId,   setRuleCatId]     = useState('')

  // 수정 모달용
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [editCatForm, setEditCatForm] = useState({ name: '', icon: '📦', color: '#CFD8DC', parentId: null as string | null, type: 'expense' as 'expense' | 'income', savingId: '' })

  function openEditCat(cat: Category) {
    setEditingCat(cat)
    setEditCatForm({ name: cat.name, icon: cat.icon, color: cat.color, parentId: cat.parentId ?? null, type: (cat.type === 'income' ? 'income' : 'expense'), savingId: cat.savingId || '' })
    setCatModal('edit')
  }

  function saveEditCat() {
    if (!editingCat || !editCatForm.name) return
    const isParent = editingCat.parentId === null
    setCategories(categories.map(c => {
      if (c.id !== editingCat.id) return c
      if (isParent) {
        return { ...c, name: editCatForm.name, icon: editCatForm.icon, color: editCatForm.color, type: editCatForm.type }
      } else {
        const newParentCat = categories.find(p => p.id === editCatForm.parentId)
        return { ...c, name: editCatForm.name, icon: editCatForm.icon, color: editCatForm.color, parentId: editCatForm.parentId, type: newParentCat?.type || c.type, savingId: editCatForm.savingId || undefined }
      }
    }))
    setCatModal(null)
    setEditingCat(null)
  }

  // ── 통장 함수 ──────────────────────────────────────────────────────────────
  function saveBalance(id: string) {
    const val = parseAmt(editBalances[id] ?? '')
    setAccounts(accounts.map(a => a.id === id ? { ...a, balance: val } : a))
    setEditingAccount(null)
  }

  function openAddAccount() {
    setEditAccountId(null)
    setAccountForm({ name: '', bank: '', color: '#0064FF', balance: '' })
    setShowAccountModal(true)
  }

  function openEditAccount(acc: Account) {
    setEditAccountId(acc.id)
    setAccountForm({ name: acc.name, bank: acc.bank, color: acc.color, balance: acc.balance === 0 ? '' : fmtInput(String(acc.balance)) })
    setShowAccountModal(true)
  }

  function saveAccount() {
    if (!accountForm.name || !accountForm.bank) return
    if (editAccountId) {
      // 수정
      setAccounts(accounts.map(a => a.id === editAccountId
        ? { ...a, name: accountForm.name, bank: accountForm.bank, color: accountForm.color, balance: parseAmt(accountForm.balance) }
        : a
      ))
    } else {
      // 추가
      const newAcc: Account = {
        id: `acc_${Date.now()}`,
        name: accountForm.name,
        bank: accountForm.bank,
        balance: parseAmt(accountForm.balance),
        color: accountForm.color,
      }
      setAccounts([...accounts, newAcc])
    }
    setShowAccountModal(false)
    setEditAccountId(null)
    setAccountForm({ name: '', bank: '', color: '#0064FF', balance: '' })
  }

  function deleteAccount(id: string) {
    setAccounts(accounts.filter(a => a.id !== id))
  }

  // ── 카드 함수 ──────────────────────────────────────────────────────────────
  function addCard() {
    if (!cardForm.name) return
    const newCard: Card = {
      id: `card_${Date.now()}`,
      name: cardForm.name,
      bank: cardForm.bank || cardForm.name,
      billingDate: Number(cardForm.billingDate) || 15,
      color: cardForm.color,
    }
    setCards([...cards, newCard])
    setShowCardModal(false)
    setCardForm({ name: '', bank: '', billingDate: '15', color: '#0065CC' })
  }

  function deleteCard(id: string) {
    setCards(cards.filter(c => c.id !== id))
  }

  // ── 카테고리 함수 ──────────────────────────────────────────────────────────
  const expenseParents = categories.filter(c => c.parentId === null && c.type === 'expense')
  const incomeParents = categories.filter(c => c.parentId === null && c.type === 'income')

  function getChildren(parentId: string) {
    return categories.filter(c => c.parentId === parentId)
  }

  function addChild() {
    if (!newCat.name || !catParentId) return
    const parent = categories.find(c => c.id === catParentId)
    const child: Category = {
      id: `cat_${Date.now()}`,
      name: newCat.name,
      type: parent?.type || 'expense',
      icon: newCat.icon,
      color: newCat.color,
      parentId: catParentId,
      savingId: newCat.savingId || undefined,
    }
    setCategories([...categories, child])
    setCatModal(null)
    setNewCat({ name: '', icon: '📦', color: '#CFD8DC', savingId: '' })
  }

  function addParent() {
    if (!newParent.name) return
    const parent: Category = {
      id: `pg_${Date.now()}`,
      name: newParent.name,
      type: newParent.type,
      icon: newParent.icon,
      color: newParent.color,
      parentId: null,
    }
    setCategories([...categories, parent])
    setCatModal(null)
    setNewParent({ name: '', icon: '📦', color: '#CFD8DC', type: 'expense' })
  }

  function deleteCategory(id: string) {
    const childIds = categories.filter(c => c.parentId === id).map(c => c.id)
    const toDelete = new Set([id, ...childIds])
    setCategories(categories.filter(c => !toDelete.has(c.id)))
  }

  function resetCategories() {
    setCategories(DEFAULT_CATEGORIES)
    setConfirmReset(false)
  }

  // ── FR-08: 자동 분류 규칙 함수 ────────────────────────────────────────────
  const allLeaf = categories.filter(c => c.parentId && c.parentId !== null)

  function addMappingRule() {
    const kw = ruleKeyword.trim()
    if (!kw || !ruleCatId) return
    const rule: MappingRule = { id: `rule_${Date.now()}`, keyword: kw, categoryId: ruleCatId }
    setMappingRules([...mappingRules, rule])
    setRuleKeyword('')
    setRuleCatId('')
  }

  function deleteMappingRule(id: string) {
    setMappingRules(mappingRules.filter(r => r.id !== id))
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">기초 설정</h1>
        <p className="text-sm text-gray-500 mt-1">통장, 카드, 카테고리를 관리하세요</p>
      </div>

      {/* 계정 정보 */}
      <div className="bg-blue-50 rounded-2xl p-4 mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white text-sm font-bold">
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">{user?.email}</div>
            <div className="text-xs text-blue-600">☁️ 클라우드 동기화 중</div>
          </div>
        </div>
        <button onClick={signOut}
          className="text-xs text-gray-500 hover:text-red-500 transition-colors font-medium px-3 py-1.5 rounded-lg hover:bg-red-50">
          로그아웃
        </button>
      </div>

      {/* 탭 */}
      <div className="flex bg-white rounded-2xl p-1 shadow-sm mb-5 gap-1">
        {(['통장', '카드', '카테고리', '규칙'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── 통장 탭 ──────────────────────────────────────────────────────── */}
      {tab === '통장' && (
        <div className="space-y-3">
          {accounts.map(acc => {
            const computed = computeAccountBalance(acc.id, acc.balance, transactions)
            const diff = computed - acc.balance
            return (
              <div key={acc.id} className="bg-white rounded-2xl p-5 shadow-sm" style={{ borderLeft: `4px solid ${acc.color}` }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <AccIcon acc={acc} />
                    <div>
                      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{acc.bank}</div>
                      <div className="font-semibold text-gray-900">{acc.name}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEditAccount(acc)}
                      className="text-xs text-blue-400 hover:text-blue-600 transition-colors font-medium">수정</button>
                    <button onClick={() => deleteAccount(acc.id)}
                      className="text-xs text-gray-300 hover:text-red-400 transition-colors">삭제</button>
                  </div>
                </div>

                {/* 실시간 잔액 */}
                <div className="bg-gray-50 rounded-xl px-4 py-3 mb-3">
                  <div className="text-xs text-gray-400 mb-0.5">현재 잔액 (거래 반영)</div>
                  <div className="text-lg font-bold text-gray-900 tabular-nums">{computed.toLocaleString('ko-KR')}원</div>
                  {diff !== 0 && (
                    <div className={`text-xs mt-0.5 ${diff >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                      기초 대비 {diff >= 0 ? '+' : ''}{diff.toLocaleString('ko-KR')}원
                    </div>
                  )}
                </div>

                {/* FR-006: 잔액 검증 */}
                <div className="mb-3">
                  {verifyOpen[acc.id] ? (
                    <div className="bg-blue-50 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-blue-700">실제 잔액 검증</span>
                        <button onClick={() => setVerifyOpen(v => ({ ...v, [acc.id]: false }))} className="text-gray-400 text-xs hover:text-gray-600">닫기</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white rounded-lg p-2">
                          <div className="text-gray-400 mb-0.5">시스템 계산 잔액</div>
                          <div className="font-bold text-gray-900">{computed.toLocaleString('ko-KR')}원</div>
                        </div>
                        <div className="bg-white rounded-lg p-2">
                          <div className="text-gray-400 mb-0.5">앱/실제 잔액 입력</div>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={verifyInputs[acc.id] ?? ''}
                            onChange={e => setVerifyInputs(v => ({ ...v, [acc.id]: fmtInput(e.target.value) }))}
                            placeholder="직접 입력"
                            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 font-bold"
                          />
                        </div>
                      </div>
                      {verifyInputs[acc.id] && (
                        (() => {
                          const actual = parseAmt(verifyInputs[acc.id])
                          const diff2 = actual - computed
                          const ok = diff2 === 0
                          return (
                            <div className={`rounded-lg px-3 py-2 text-xs font-medium ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {ok ? '✅ 검증 완료 — 잔액 일치' : `⚠️ 불일치 — 오차 ${diff2 >= 0 ? '+' : ''}${diff2.toLocaleString('ko-KR')}원 확인 필요`}
                            </div>
                          )
                        })()
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setVerifyOpen(v => ({ ...v, [acc.id]: true }))}
                      className="text-xs text-blue-500 hover:text-blue-700 font-medium">
                      🔍 잔액 검증하기
                    </button>
                  )}
                </div>

                {/* 기초 잔액 편집 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">기초 잔액</span>
                  {editingAccount === acc.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editBalances[acc.id] ?? ''}
                        onChange={e => setEditBalances(prev => ({ ...prev, [acc.id]: fmtInput(e.target.value) }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveBalance(acc.id); if (e.key === 'Escape') setEditingAccount(null) }}
                        className="flex-1 border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <button onClick={() => saveBalance(acc.id)} className="text-xs text-blue-600 font-semibold">저장</button>
                      <button onClick={() => setEditingAccount(null)} className="text-xs text-gray-400">취소</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingAccount(acc.id); setEditBalances(prev => ({ ...prev, [acc.id]: String(acc.balance) })) }}
                      className="text-sm text-gray-500 hover:text-blue-600 transition-colors tabular-nums">
                      {fmtKRW(acc.balance)} <span className="text-xs text-gray-300">(수정)</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          <button onClick={openAddAccount}
            className="w-full bg-white rounded-2xl shadow-sm py-4 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors border-2 border-dashed border-blue-200 flex items-center justify-center gap-2">
            <span className="text-xl">+</span> 통장 추가
          </button>
        </div>
      )}

      {/* ── 카드 탭 ──────────────────────────────────────────────────────── */}
      {tab === '카드' && (
        <div className="space-y-3">
          {cards.map(card => (
            <div key={card.id} className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: card.color }}>
                    {/* FR-13: 은행명 약칭 표시 */}
                    {(card.bank || card.name).slice(0, 2)}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{card.name}</div>
                    <div className="text-xs text-gray-400">{card.bank || card.name} · 매월 {card.billingDate}일 결제</div>
                  </div>
                </div>
                <button onClick={() => deleteCard(card.id)}
                  className="text-xs text-gray-300 hover:text-red-400 transition-colors">삭제</button>
              </div>
            </div>
          ))}

          <button onClick={() => setShowCardModal(true)}
            className="w-full bg-white rounded-2xl shadow-sm py-4 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors border-2 border-dashed border-blue-200 flex items-center justify-center gap-2">
            <span className="text-xl">+</span> 카드 추가
          </button>
        </div>
      )}

      {/* ── 카테고리 탭 ──────────────────────────────────────────────────── */}
      {tab === '카테고리' && (
        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">지출 카테고리</div>
            <div className="space-y-2">
              {expenseParents.map(parent => {
                const children = getChildren(parent.id)
                return (
                  <div key={parent.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3" style={{ borderLeft: `4px solid ${parent.color}` }}>
                      <div className="flex items-center gap-2">
                        <span>{parent.icon}</span>
                        <span className="text-sm font-bold text-gray-900">{parent.name}</span>
                        <span className="text-xs text-gray-400">({children.length})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setCatParentId(parent.id); setCatModal('child') }}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ 소분류</button>
                        <button onClick={() => openEditCat(parent)}
                          className="text-xs text-gray-400 hover:text-blue-500">수정</button>
                        <button onClick={() => deleteCategory(parent.id)}
                          className="text-xs text-gray-300 hover:text-red-400">삭제</button>
                      </div>
                    </div>
                    {children.length > 0 && (
                      <div className="border-t border-gray-50 divide-y divide-gray-50">
                        {children.map(child => (
                          <div key={child.id} className="flex items-center justify-between px-5 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{child.icon}</span>
                              <span className="text-sm text-gray-700">{child.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => openEditCat(child)}
                                className="text-xs text-gray-400 hover:text-blue-500">수정</button>
                              <button onClick={() => deleteCategory(child.id)}
                                className="text-xs text-gray-300 hover:text-red-400">삭제</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">수입 카테고리</div>
            <div className="space-y-2">
              {incomeParents.map(parent => {
                const children = getChildren(parent.id)
                return (
                  <div key={parent.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3" style={{ borderLeft: `4px solid ${parent.color}` }}>
                      <div className="flex items-center gap-2">
                        <span>{parent.icon}</span>
                        <span className="text-sm font-bold text-gray-900">{parent.name}</span>
                        <span className="text-xs text-gray-400">({children.length})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setCatParentId(parent.id); setCatModal('child') }}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ 소분류</button>
                        <button onClick={() => openEditCat(parent)}
                          className="text-xs text-gray-400 hover:text-blue-500">수정</button>
                        <button onClick={() => deleteCategory(parent.id)}
                          className="text-xs text-gray-300 hover:text-red-400">삭제</button>
                      </div>
                    </div>
                    {children.length > 0 && (
                      <div className="border-t border-gray-50 divide-y divide-gray-50">
                        {children.map(child => (
                          <div key={child.id} className="flex items-center justify-between px-5 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{child.icon}</span>
                              <span className="text-sm text-gray-700">{child.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => openEditCat(child)}
                                className="text-xs text-gray-400 hover:text-blue-500">수정</button>
                              <button onClick={() => deleteCategory(child.id)}
                                className="text-xs text-gray-300 hover:text-red-400">삭제</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <button onClick={() => setCatModal('parent')}
            className="w-full bg-white rounded-2xl shadow-sm py-4 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors border-2 border-dashed border-blue-200 flex items-center justify-center gap-2">
            <span className="text-xl">+</span> 대분류 추가
          </button>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="text-sm font-semibold text-gray-700 mb-1">카테고리 초기화</div>
            <div className="text-xs text-gray-400 mb-3">기본 카테고리로 되돌립니다.</div>
            {confirmReset ? (
              <div className="flex gap-2">
                <button onClick={resetCategories} className="flex-1 bg-red-500 text-white text-sm font-medium py-2 rounded-xl hover:bg-red-600">확인</button>
                <button onClick={() => setConfirmReset(false)} className="flex-1 bg-gray-100 text-gray-600 text-sm font-medium py-2 rounded-xl">취소</button>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors">기본값으로 초기화</button>
            )}
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-red-100">
            <div className="text-sm font-semibold text-red-600 mb-1">⚠️ 전체 데이터 초기화</div>
            <div className="text-xs text-gray-400 mb-3">모든 거래내역, 예산, 설정이 삭제됩니다.</div>
            <button onClick={resetAll}
              className="text-xs text-red-400 hover:text-red-600 transition-colors">전체 초기화</button>
          </div>
        </div>
      )}

      {/* ── FR-08: 자동 분류 규칙 탭 ────────────────────────────────────── */}
      {tab === '규칙' && (
        <div className="space-y-4">
          <div className="bg-blue-50 rounded-2xl px-4 py-3 text-xs text-blue-700">
            💡 가맹점명 키워드를 입력하면 거래 내역 업로드 시 카테고리를 자동으로 제안합니다.<br/>
            여러 규칙이 매칭될 경우 더 긴 키워드 규칙이 우선 적용됩니다.
          </div>

          {/* 규칙 추가 폼 */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="text-sm font-semibold text-gray-700 mb-3">새 규칙 추가</div>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="가맹점 키워드 (예: 스타벅스)"
                value={ruleKeyword}
                onChange={e => setRuleKeyword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addMappingRule() }}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={ruleCatId}
                onChange={e => setRuleCatId(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">카테고리 선택</option>
                <optgroup label="── 지출">
                  {allLeaf.filter(c => c.type === 'expense').map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </optgroup>
                <optgroup label="── 수입">
                  {allLeaf.filter(c => c.type === 'income').map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </optgroup>
              </select>
              <button
                onClick={addMappingRule}
                disabled={!ruleKeyword.trim() || !ruleCatId}
                className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition-colors text-sm disabled:opacity-40"
              >
                규칙 추가
              </button>
            </div>
          </div>

          {/* 규칙 목록 */}
          {mappingRules.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-8">
              등록된 규칙이 없습니다
            </div>
          ) : (
            <div className="space-y-2">
              {mappingRules.map(rule => {
                const cat = categories.find(c => c.id === rule.categoryId)
                return (
                  <div key={rule.id} className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-base">{cat?.icon || '📦'}</div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          &quot;{rule.keyword}&quot;
                        </div>
                        <div className="text-xs text-gray-400">
                          → {cat?.name || '알 수 없는 카테고리'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteMappingRule(rule.id)}
                      className="text-xs text-gray-300 hover:text-red-400 transition-colors ml-2"
                    >
                      삭제
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 통장 추가 모달 ─────────────────────────────────────────────── */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editAccountId ? '통장 수정' : '통장 추가'}</h2>
              <button onClick={() => { setShowAccountModal(false); setEditAccountId(null) }} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="계좌 이름" value={accountForm.name}
                  onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" placeholder="은행명" value={accountForm.bank}
                  onChange={e => setAccountForm(f => ({ ...f, bank: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <input type="text" inputMode="numeric" placeholder="현재 잔액 (원)" value={accountForm.balance}
                onChange={e => setAccountForm(f => ({ ...f, balance: fmtInput(e.target.value) }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div>
                <div className="text-xs text-gray-400 mb-1.5">색상</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setAccountForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-lg transition-transform ${accountForm.color === c ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : ''}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <button onClick={saveAccount}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm">
                {editAccountId ? '저장하기' : '추가하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 카드 추가 모달 ─────────────────────────────────────────────── */}
      {showCardModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">카드 추가</h2>
              <button onClick={() => setShowCardModal(false)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="카드 이름" value={cardForm.name}
                  onChange={e => setCardForm(f => ({ ...f, name: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" placeholder="은행명 (예: 신한)" value={cardForm.bank}
                  onChange={e => setCardForm(f => ({ ...f, bank: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-0.5">결제일</label>
                <input type="number" min="1" max="31" placeholder="15" value={cardForm.billingDate}
                  onChange={e => setCardForm(f => ({ ...f, billingDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1.5">색상</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setCardForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-lg transition-transform ${cardForm.color === c ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : ''}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <button onClick={addCard}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm">추가하기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 소분류 추가 모달 ────────────────────────────────────────────── */}
      {catModal === 'child' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">소분류 추가</h2>
              <button onClick={() => setCatModal(null)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <input type="text" placeholder="항목 이름" value={newCat.name}
                onChange={e => setNewCat(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
              {/* 적금 대분류 하위일 때: 상품 연동 선택 */}
              {catParentId === 'pg_saving' && data.savings.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">연동 적금·예금 상품 <span className="text-gray-300">(선택)</span></label>
                  <select
                    value={newCat.savingId}
                    onChange={e => setNewCat(f => ({ ...f, savingId: e.target.value }))}
                    className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50/30">
                    <option value="">연동 안 함</option>
                    {data.savings.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.bank})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <div className="text-xs text-gray-400 mb-1.5">아이콘</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_ICONS.map(icon => (
                    <button key={icon} onClick={() => setNewCat(f => ({ ...f, icon }))}
                      className={`w-8 h-8 rounded-lg text-base flex items-center justify-center ${newCat.icon === icon ? 'bg-blue-100 ring-2 ring-blue-400' : 'bg-gray-100'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1.5">색상</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setNewCat(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-lg ${newCat.color === c ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : ''}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <button onClick={addChild}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm">추가하기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 대분류 추가 모달 ────────────────────────────────────────────── */}
      {catModal === 'parent' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">대분류 추가</h2>
              <button onClick={() => setCatModal(null)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <div className="flex bg-gray-100 rounded-xl p-1">
                {(['expense', 'income'] as const).map(t => (
                  <button key={t} onClick={() => setNewParent(f => ({ ...f, type: t }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${newParent.type === t ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
                    {t === 'expense' ? '지출' : '수입'}
                  </button>
                ))}
              </div>
              <input type="text" placeholder="대분류 이름" value={newParent.name}
                onChange={e => setNewParent(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
              <div>
                <div className="text-xs text-gray-400 mb-1.5">아이콘</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_ICONS.map(icon => (
                    <button key={icon} onClick={() => setNewParent(f => ({ ...f, icon }))}
                      className={`w-8 h-8 rounded-lg text-base flex items-center justify-center ${newParent.icon === icon ? 'bg-blue-100 ring-2 ring-blue-400' : 'bg-gray-100'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1.5">색상</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setNewParent(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-lg ${newParent.color === c ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : ''}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <button onClick={addParent}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm">추가하기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 카테고리 수정 모달 ───────────────────────────────────────────── */}
      {catModal === 'edit' && editingCat && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">
                {editingCat.parentId === null ? '대분류' : '소분류'} 수정
              </h2>
              <button onClick={() => setCatModal(null)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              {/* 대분류: 지출/수입 전환 */}
              {editingCat.parentId === null && (
                <div className="flex bg-gray-100 rounded-xl p-1">
                  {(['expense', 'income'] as const).map(t => (
                    <button key={t} onClick={() => setEditCatForm(f => ({ ...f, type: t }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${editCatForm.type === t ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
                      {t === 'expense' ? '지출' : '수입'}
                    </button>
                  ))}
                </div>
              )}

              {/* 소분류: 상위분류 이동 */}
              {editingCat.parentId !== null && (
                <div>
                  <label className="text-xs text-gray-400 block mb-1">상위 분류</label>
                  <select
                    value={editCatForm.parentId || ''}
                    onChange={e => setEditCatForm(f => ({ ...f, parentId: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {categories
                      .filter(c => c.parentId === null)
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.icon} {p.name} ({p.type === 'expense' ? '지출' : '수입'})</option>
                      ))
                    }
                  </select>
                </div>
              )}

              <input type="text" placeholder="이름" value={editCatForm.name}
                onChange={e => setEditCatForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />

              {/* 소분류이고 적금 대분류 하위일 때: 상품 연동 선택 */}
              {editingCat?.parentId !== null && (editCatForm.parentId === 'pg_saving' || editCatForm.savingId) && data.savings.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1">연동 적금·예금 상품 <span className="text-gray-300">(선택)</span></label>
                  <select
                    value={editCatForm.savingId}
                    onChange={e => setEditCatForm(f => ({ ...f, savingId: e.target.value }))}
                    className="w-full border border-blue-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50/30">
                    <option value="">연동 안 함</option>
                    {data.savings.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.bank})</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <div className="text-xs text-gray-400 mb-1.5">아이콘</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_ICONS.map(icon => (
                    <button key={icon} onClick={() => setEditCatForm(f => ({ ...f, icon }))}
                      className={`w-8 h-8 rounded-lg text-base flex items-center justify-center ${editCatForm.icon === icon ? 'bg-blue-100 ring-2 ring-blue-400' : 'bg-gray-100'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-400 mb-1.5">색상</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setEditCatForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-lg ${editCatForm.color === c ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : ''}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>

              <button onClick={saveEditCat}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm">저장하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
