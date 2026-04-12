'use client'

import { useState } from 'react'
import { useApp } from '@/lib/AppContext'
import { Budget, Category } from '@/types'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function fmtShort(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(0) + '만'
  return n.toLocaleString()
}
const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

const PRESET_ICONS = ['🏠','🍽️','🚌','📱','🛡️','💰','🏦','💳','📦','🎁','✈️','🍺','🧴','📺','⚡','💧','🔥','🛍️','📚','❤️','🎵','🏋️']
const PRESET_COLORS = ['#FF6B6B','#FF8E53','#4ECDC4','#45B7D1','#96CEB4','#F7DC6F','#DDA0DD','#82E0AA','#F1948A','#85C1E9','#F0B27A','#A9CCE3','#EC7063','#A8D8EA','#B0BEC5','#CFD8DC']

type ModalType = 'addChild' | 'addParent' | null

export default function BudgetPage() {
  const { data, categories, setBudgets, setCategories } = useApp()
  const { budgets, transactions } = data
  const [month, setMonth] = useState(currentMonth)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalType>(null)
  const [modalParentId, setModalParentId] = useState<string>('')
  const [newCat, setNewCat] = useState({ name: '', icon: '📦', color: '#CFD8DC' })
  const [newParent, setNewParent] = useState({ name: '', icon: '📦', color: '#CFD8DC', type: 'expense' as 'expense' | 'income' })

  // ── 카테고리 분류 ─────────────────────────────────────────────────────────
  const expenseParents = categories.filter(c => c.parentId === null && c.type === 'expense')
  const monthTx = transactions.filter(t => t.date.startsWith(month) && t.type === 'expense')

  function getChildren(parentId: string) {
    return categories.filter(c => c.parentId === parentId)
  }
  function getActual(catId: string) {
    return monthTx.filter(t => t.categoryId === catId).reduce((s, t) => s + t.amount, 0)
  }
  function getBudget(catId: string) {
    return budgets.find(b => b.categoryId === catId && b.month === month)?.amount || 0
  }
  function saveBudget(catId: string) {
    const amount = Number(editValue)
    if (isNaN(amount) || amount < 0) { setEditing(null); return }
    const next = budgets.filter(b => !(b.categoryId === catId && b.month === month))
    if (amount > 0) next.push({ id: `b${Date.now()}`, categoryId: catId, month, amount } as Budget)
    setBudgets(next)
    setEditing(null)
  }

  // ── 대분류 집계 ─────────────────────────────────────────────────────────
  function groupTotal(parentId: string) {
    const children = getChildren(parentId)
    return {
      budget: children.reduce((s, c) => s + getBudget(c.id), 0),
      actual: children.reduce((s, c) => s + getActual(c.id), 0),
    }
  }

  // ── 전체 합계 ────────────────────────────────────────────────────────────
  const allLeaf = categories.filter(c => c.parentId !== null && c.type === 'expense')
  const totalBudget = allLeaf.reduce((s, c) => s + getBudget(c.id), 0)
  const totalActual = allLeaf.reduce((s, c) => s + getActual(c.id), 0)

  // ── 카테고리 CRUD ────────────────────────────────────────────────────────
  function addChild() {
    if (!newCat.name || !modalParentId) return
    const parent = categories.find(c => c.id === modalParentId)
    const child: Category = {
      id: `cat_${Date.now()}`,
      name: newCat.name,
      type: parent?.type || 'expense',
      icon: newCat.icon,
      color: newCat.color,
      parentId: modalParentId,
    }
    setCategories([...categories, child])
    setModal(null)
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
    setModal(null)
    setNewParent({ name: '', icon: '📦', color: '#CFD8DC', type: 'expense' })
  }

  function deleteCategory(id: string) {
    const childIds = categories.filter(c => c.parentId === id).map(c => c.id)
    const toDelete = new Set([id, ...childIds])
    setCategories(categories.filter(c => !toDelete.has(c.id)))
    setBudgets(budgets.filter(b => !toDelete.has(b.categoryId)))
  }

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">예산 관리</h1>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* 총계 카드 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">총 예산</div>
          <div className="text-base font-bold text-gray-900">{fmtKRW(totalBudget)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">실제 지출</div>
          <div className={`text-base font-bold ${totalActual > totalBudget && totalBudget > 0 ? 'text-red-500' : 'text-gray-900'}`}>{fmtKRW(totalActual)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-gray-500 mb-1">절약 가능</div>
          <div className={`text-base font-bold ${totalBudget - totalActual >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {totalBudget > 0 ? fmtKRW(Math.abs(totalBudget - totalActual)) : '-'}
          </div>
        </div>
      </div>

      {/* 전체 진행바 */}
      {totalBudget > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm mb-5">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>전체 예산 사용률</span>
            <span>{Math.min(totalActual / totalBudget * 100, 100).toFixed(1)}%</span>
          </div>
          <div className="bg-gray-100 rounded-full h-3">
            <div className={`h-3 rounded-full transition-all ${totalActual > totalBudget ? 'bg-red-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(totalActual / totalBudget * 100, 100)}%` }} />
          </div>
        </div>
      )}

      {/* 대분류별 테이블 */}
      <div className="space-y-3">
        {expenseParents.map(parent => {
          const children = getChildren(parent.id)
          const { budget: grpBudget, actual: grpActual } = groupTotal(parent.id)
          const isCollapsed = collapsed.has(parent.id)
          const grpDiff = grpBudget - grpActual
          const grpOver = grpBudget > 0 && grpActual > grpBudget

          return (
            <div key={parent.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* 대분류 헤더 */}
              <button
                onClick={() => toggleCollapse(parent.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                style={{ borderLeft: `4px solid ${parent.color}` }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{parent.icon}</span>
                  <span className="text-sm font-bold text-gray-900">{parent.name}</span>
                  <span className="text-xs text-gray-400">({children.length}개 항목)</span>
                </div>
                <div className="flex items-center gap-3">
                  {grpBudget > 0 && (
                    <span className={`text-xs font-medium ${grpOver ? 'text-red-500' : 'text-emerald-600'}`}>
                      {grpOver ? '▲' : '▼'} {fmtShort(Math.abs(grpDiff))}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{fmtShort(grpActual)} / {grpBudget > 0 ? fmtShort(grpBudget) : '-'}</span>
                  <span className={`text-xs text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}>▲</span>
                  <button
                    onClick={e => { e.stopPropagation(); deleteCategory(parent.id) }}
                    className="text-gray-300 hover:text-red-400 text-xs ml-1">✕</button>
                </div>
              </button>

              {/* 소분류 리스트 */}
              {!isCollapsed && (
                <div>
                  {/* 헤더 */}
                  <div className="grid grid-cols-4 px-4 py-1.5 bg-gray-50 border-t border-b border-gray-100 text-xs font-semibold text-gray-400">
                    <span>소분류</span>
                    <span className="text-right">예산</span>
                    <span className="text-right">실제</span>
                    <span className="text-right">차액</span>
                  </div>

                  {children.length === 0 && (
                    <div className="px-4 py-3 text-xs text-gray-400 text-center">항목을 추가하세요</div>
                  )}

                  {children.map(cat => {
                    const budgetAmt = getBudget(cat.id)
                    const actual = getActual(cat.id)
                    const diff = budgetAmt - actual
                    const pct = budgetAmt > 0 ? Math.min(actual / budgetAmt * 100, 100) : 0
                    const isOver = budgetAmt > 0 && actual > budgetAmt

                    return (
                      <div key={cat.id} className="border-b border-gray-50 last:border-0 group">
                        <div className="grid grid-cols-4 px-4 py-2.5 items-center hover:bg-gray-50 transition-colors">
                          {/* 소분류명 */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{cat.icon}</span>
                            <span className="text-sm text-gray-700">{cat.name}</span>
                            <button
                              onClick={() => deleteCategory(cat.id)}
                              className="text-gray-200 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity ml-1">✕</button>
                          </div>
                          {/* 예산 (클릭 편집) */}
                          <div className="text-right">
                            {editing === cat.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveBudget(cat.id); if (e.key === 'Escape') setEditing(null) }}
                                  onBlur={() => saveBudget(cat.id)}
                                  className="w-20 text-right text-xs border border-blue-300 rounded-lg px-2 py-1 focus:outline-none"
                                  autoFocus
                                />
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditing(cat.id); setEditValue(String(budgetAmt)) }}
                                className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                                {budgetAmt > 0 ? fmtKRW(budgetAmt) : <span className="text-gray-300 text-xs">설정</span>}
                              </button>
                            )}
                          </div>
                          {/* 실제 */}
                          <div className={`text-right text-sm ${actual > 0 ? 'font-medium text-gray-900' : 'text-gray-300'}`}>
                            {actual > 0 ? fmtKRW(actual) : '-'}
                          </div>
                          {/* 차액 */}
                          <div className={`text-right text-sm font-medium ${isOver ? 'text-red-500' : diff > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {budgetAmt > 0 ? (isOver ? '+' + fmtKRW(Math.abs(diff)) : diff > 0 ? '-' + fmtKRW(diff) : '±0') : '-'}
                          </div>
                        </div>
                        {/* 진행바 */}
                        {budgetAmt > 0 && (
                          <div className="px-4 pb-2">
                            <div className="bg-gray-100 rounded-full h-1">
                              <div className={`h-1 rounded-full transition-all ${isOver ? 'bg-red-500' : pct > 80 ? 'bg-amber-400' : 'bg-blue-500'}`}
                                style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* 합계 행 */}
                  {children.length > 0 && (
                    <div className="grid grid-cols-4 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 border-t border-gray-100">
                      <span>소계</span>
                      <span className="text-right">{grpBudget > 0 ? fmtKRW(grpBudget) : '-'}</span>
                      <span className="text-right">{grpActual > 0 ? fmtKRW(grpActual) : '-'}</span>
                      <span className={`text-right ${grpOver ? 'text-red-500' : grpDiff > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {grpBudget > 0 ? (grpOver ? '+' + fmtKRW(Math.abs(grpDiff)) : grpDiff > 0 ? '-' + fmtKRW(grpDiff) : '±0') : '-'}
                      </span>
                    </div>
                  )}

                  {/* + 소분류 추가 */}
                  <button
                    onClick={() => { setModalParentId(parent.id); setModal('addChild') }}
                    className="w-full px-4 py-2.5 text-xs text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1.5 border-t border-gray-50">
                    <span className="text-base leading-none">+</span> 소분류 추가
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* + 대분류 추가 버튼 */}
      <button
        onClick={() => setModal('addParent')}
        className="mt-4 w-full bg-white rounded-2xl shadow-sm py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors border-2 border-dashed border-blue-200 flex items-center justify-center gap-2">
        <span className="text-lg">+</span> 대분류 추가
      </button>

      {/* ── 소분류 추가 모달 ──────────────────────────────────────── */}
      {modal === 'addChild' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">소분류 추가</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="항목 이름 (예: 케이패스, 가스비)"
                value={newCat.name}
                onChange={e => setNewCat(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div>
                <div className="text-xs text-gray-400 mb-1.5">아이콘</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_ICONS.map(icon => (
                    <button key={icon} onClick={() => setNewCat(f => ({ ...f, icon }))}
                      className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all ${newCat.icon === icon ? 'bg-blue-100 ring-2 ring-blue-400' : 'bg-gray-100 hover:bg-gray-200'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1.5">색상</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(color => (
                    <button key={color} onClick={() => setNewCat(f => ({ ...f, color }))}
                      className={`w-7 h-7 rounded-lg transition-transform ${newCat.color === color ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : ''}`}
                      style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
              <button onClick={addChild}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm">
                추가하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 대분류 추가 모달 ──────────────────────────────────────── */}
      {modal === 'addParent' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">대분류 추가</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 text-xl leading-none">×</button>
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
              <input
                type="text"
                placeholder="대분류 이름 (예: 여행통장, 의료비)"
                value={newParent.name}
                onChange={e => setNewParent(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div>
                <div className="text-xs text-gray-400 mb-1.5">아이콘</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_ICONS.map(icon => (
                    <button key={icon} onClick={() => setNewParent(f => ({ ...f, icon }))}
                      className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-all ${newParent.icon === icon ? 'bg-blue-100 ring-2 ring-blue-400' : 'bg-gray-100 hover:bg-gray-200'}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1.5">색상</div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map(color => (
                    <button key={color} onClick={() => setNewParent(f => ({ ...f, color }))}
                      className={`w-7 h-7 rounded-lg transition-transform ${newParent.color === color ? 'scale-125 ring-2 ring-offset-1 ring-blue-400' : ''}`}
                      style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
              <button onClick={addParent}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm">
                추가하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
