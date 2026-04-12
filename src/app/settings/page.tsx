'use client'

import { useState } from 'react'
import { useApp, DEFAULT_CATEGORIES } from '@/lib/AppContext'
import { Account, Card, Category } from '@/types'
import { supabase } from '@/lib/supabase'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }

const PRESET_COLORS = ['#0064FF','#FFB800','#00B493','#FF6B6B','#4ECDC4','#9B59B6','#E67E22','#1ABC9C','#E74C3C','#0065CC','#E60000','#1A1A1A','#1259AA','#2ECC71','#F39C12']
const PRESET_ICONS = ['🏠','🍽️','🚌','📱','🛡️','💰','🏦','💳','📦','🎁','✈️','🍺','🧴','📺','⚡','💧','🔥','🛍️','📚','❤️','🎵','🏋️','🌿','🎯']

type TabType = '통장' | '카드' | '카테고리'

export default function SettingsPage() {
  const { data, user, signOut, setAccounts, setCards, setCategories, resetAll } = useApp()
  const { accounts, cards, categories } = data
  const [tab, setTab] = useState<TabType>('통장')

  // ── 통장 상태 ──────────────────────────────────────────────────────────────
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [editBalances, setEditBalances] = useState<Record<string, string>>({})
  const [editingAccount, setEditingAccount] = useState<string | null>(null)
  const [accountForm, setAccountForm] = useState({ name: '', bank: '', color: '#0064FF', balance: '' })

  // ── 카드 상태 ──────────────────────────────────────────────────────────────
  const [showCardModal, setShowCardModal] = useState(false)
  const [cardForm, setCardForm] = useState({ name: '', bank: '', billingDate: '15', color: '#0065CC' })

  // ── 카테고리 상태 ──────────────────────────────────────────────────────────
  const [catModal, setCatModal] = useState<'child' | 'parent' | null>(null)
  const [catParentId, setCatParentId] = useState('')
  const [newCat, setNewCat] = useState({ name: '', icon: '📦', color: '#CFD8DC' })
  const [newParent, setNewParent] = useState({ name: '', icon: '📦', color: '#CFD8DC', type: 'expense' as 'expense' | 'income' })
  const [confirmReset, setConfirmReset] = useState(false)

  // ── 통장 함수 ──────────────────────────────────────────────────────────────
  function saveBalance(id: string) {
    const val = Number(editBalances[id] ?? '')
    if (!isNaN(val)) {
      setAccounts(accounts.map(a => a.id === id ? { ...a, balance: val } : a))
    }
    setEditingAccount(null)
  }

  function addAccount() {
    if (!accountForm.name || !accountForm.bank) return
    const newAcc: Account = {
      id: `acc_${Date.now()}`,
      name: accountForm.name,
      bank: accountForm.bank,
      balance: Number(accountForm.balance) || 0,
      color: accountForm.color,
    }
    setAccounts([...accounts, newAcc])
    setShowAccountModal(false)
    setAccountForm({ name: '', bank: '', color: '#0064FF', balance: '' })
  }

  function deleteAccount(id: string) {
    setAccounts(accounts.filter(a => a.id !== id))
  }

  // ── 카드 함수 ──────────────────────────────────────────────────────────────
  function addCard() {
    if (!cardForm.name || !cardForm.bank) return
    const newCard: Card = {
      id: `card_${Date.now()}`,
      name: cardForm.name,
      bank: cardForm.bank,
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
    }
    setCategories([...categories, child])
    setCatModal(null)
    setNewCat({ name: '', icon: '📦', color: '#CFD8DC' })
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

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">기초 설정</h1>
        <p className="text-sm text-gray-500 mt-1">통장, 카드, 카테고리를 관리하세요</p>
      </div>

      {/* 계정 정보 (Supabase 연결된 경우) */}
      {user && (
        <div className="bg-blue-50 rounded-2xl p-4 mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white text-sm font-bold">
              {user.email?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">{user.email}</div>
              <div className="text-xs text-blue-600">☁️ 클라우드 동기화 중</div>
            </div>
          </div>
          <button onClick={signOut}
            className="text-xs text-gray-500 hover:text-red-500 transition-colors font-medium">
            로그아웃
          </button>
        </div>
      )}

      {!user && supabase && (
        <div className="bg-amber-50 rounded-2xl p-4 mb-5 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">로그인하지 않은 상태</div>
            <div className="text-xs text-amber-600">데이터가 이 기기에만 저장됩니다</div>
          </div>
          <a href="/login" className="text-xs text-blue-600 font-semibold hover:underline">로그인 →</a>
        </div>
      )}

      {/* 탭 */}
      <div className="flex bg-white rounded-2xl p-1 shadow-sm mb-5 w-fit gap-1">
        {(['통장', '카드', '카테고리'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── 통장 탭 ──────────────────────────────────────────────────────── */}
      {tab === '통장' && (
        <div className="space-y-3">
          {accounts.map(acc => (
            <div key={acc.id} className="bg-white rounded-2xl p-5 shadow-sm" style={{ borderLeft: `4px solid ${acc.color}` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: acc.color }}>
                    {acc.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{acc.name}</div>
                    <div className="text-xs text-gray-400">{acc.bank}</div>
                  </div>
                </div>
                <button onClick={() => deleteAccount(acc.id)}
                  className="text-xs text-gray-300 hover:text-red-400 transition-colors">삭제</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">잔액</span>
                {editingAccount === acc.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="number"
                      value={editBalances[acc.id] ?? ''}
                      onChange={e => setEditBalances(prev => ({ ...prev, [acc.id]: e.target.value }))}
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
                    className="font-bold text-gray-900 hover:text-blue-600 transition-colors">
                    {fmtKRW(acc.balance)}
                  </button>
                )}
              </div>
            </div>
          ))}

          <button onClick={() => setShowAccountModal(true)}
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
                    {card.name.slice(0, 2)}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{card.name}</div>
                    <div className="text-xs text-gray-400">{card.bank} · 매월 {card.billingDate}일 결제</div>
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
          {/* 지출 카테고리 */}
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
                        <button
                          onClick={() => { setCatParentId(parent.id); setCatModal('child') }}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ 소분류</button>
                        <button
                          onClick={() => deleteCategory(parent.id)}
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
                            <button onClick={() => deleteCategory(child.id)}
                              className="text-xs text-gray-300 hover:text-red-400">삭제</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 수입 카테고리 */}
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
                        <button
                          onClick={() => { setCatParentId(parent.id); setCatModal('child') }}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium">+ 소분류</button>
                        <button
                          onClick={() => deleteCategory(parent.id)}
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
                            <button onClick={() => deleteCategory(child.id)}
                              className="text-xs text-gray-300 hover:text-red-400">삭제</button>
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

          {/* 카테고리 초기화 */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="text-sm font-semibold text-gray-700 mb-1">카테고리 초기화</div>
            <div className="text-xs text-gray-400 mb-3">기본 카테고리로 되돌립니다. 예산 데이터는 유지됩니다.</div>
            {confirmReset ? (
              <div className="flex gap-2">
                <button onClick={resetCategories} className="flex-1 bg-red-500 text-white text-sm font-medium py-2 rounded-xl hover:bg-red-600">확인</button>
                <button onClick={() => setConfirmReset(false)} className="flex-1 bg-gray-100 text-gray-600 text-sm font-medium py-2 rounded-xl hover:bg-gray-200">취소</button>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors">기본값으로 초기화</button>
            )}
          </div>

          {/* 전체 데이터 초기화 */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-red-100">
            <div className="text-sm font-semibold text-red-600 mb-1">⚠️ 전체 데이터 초기화</div>
            <div className="text-xs text-gray-400 mb-3">모든 거래내역, 예산, 설정이 삭제됩니다.</div>
            <button onClick={resetAll}
              className="text-xs text-red-400 hover:text-red-600 transition-colors">전체 초기화</button>
          </div>
        </div>
      )}

      {/* ── 통장 추가 모달 ─────────────────────────────────────────────── */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">통장 추가</h2>
              <button onClick={() => setShowAccountModal(false)} className="text-gray-400 text-xl leading-none">×</button>
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
              <input type="number" placeholder="현재 잔액 (원)" value={accountForm.balance}
                onChange={e => setAccountForm(f => ({ ...f, balance: e.target.value }))}
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
              <button onClick={addAccount}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm">추가하기</button>
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
                <input type="text" placeholder="카드사" value={cardForm.bank}
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
    </div>
  )
}
