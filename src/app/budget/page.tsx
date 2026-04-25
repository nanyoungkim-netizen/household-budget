'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/AppContext'
import { Budget, Category } from '@/types'
import DeleteConfirmModal from '@/components/DeleteConfirmModal'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
// FR-007
function parseAmt(s: string): number { return parseInt(s.replace(/[^0-9]/g, '')) || 0 }
function fmtInput(s: string): string { const n = parseAmt(s); return n === 0 ? '' : n.toLocaleString('ko-KR') }
function fmtShort(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(0) + '만'
  return n.toLocaleString()
}
const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

function prevMonth(month: string) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

const PRESET_ICONS = ['🏠','🍽️','🚌','📱','🛡️','💰','🏦','💳','📦','🎁','✈️','🍺','🧴','📺','⚡','💧','🔥','🛍️','📚','❤️','🎵','🏋️']
const PRESET_COLORS = ['#FF6B6B','#FF8E53','#4ECDC4','#45B7D1','#96CEB4','#F7DC6F','#DDA0DD','#82E0AA','#F1948A','#85C1E9','#F0B27A','#A9CCE3','#EC7063','#A8D8EA','#B0BEC5','#CFD8DC']

type ModalType = 'addChild' | 'addParent' | null

export default function BudgetPage() {
  const { data, categories, setBudgets, setCategories, setCategoryHiddenMonths } = useApp()
  const { budgets, transactions, categoryHiddenMonths } = data

  function isCardPaymentCat(categoryId: string): boolean {
    const cat = categories.find(c => c.id === categoryId)
    return cat?.role === 'card_payment'
  }
  function isExcludedFromReal(categoryId: string): boolean {
    const cat = categories.find(c => c.id === categoryId)
    if (!cat) return false
    if (cat.role === 'card_payment' || cat.role === 'savings') return true
    const parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
    return parent?.role === 'savings' || parent?.role === 'card_payment' || false
  }
  const [month, setMonth] = useState(currentMonth)
  const router = useRouter()

  // 예산 편집
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // 이름 편집
  const [editingName, setEditingName] = useState<string | null>(null)
  const [editNameValue, setEditNameValue] = useState('')

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalType>(null)
  const [modalParentId, setModalParentId] = useState<string>('')
  const [newCat, setNewCat] = useState({ name: '', icon: '📦', color: '#CFD8DC' })
  const [newParent, setNewParent] = useState({ name: '', icon: '📦', color: '#CFD8DC', type: 'expense' as 'expense' | 'income' })

  // 이월 확인 모달
  const [showCarryOver, setShowCarryOver] = useState(false)

  // 월이 바뀌면 진행 중인 편집 즉시 취소 (stale-closure 방지)
  useEffect(() => {
    setEditing(null)
    setEditingName(null)
  }, [month])

  // 현재달 이전 → 잠금 (수정 불가)
  const isPastMonth = month < currentMonth

  // 삭제 확인 모달
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null)

  // ── 카테고리 분류 ─────────────────────────────────────────────────────────
  const expenseParents = categories.filter(c => c.parentId === null && c.type === 'expense')
  // 실제지출 합계용 (대시보드와 동일): 카드대금·적금 제외
  const monthTx = transactions.filter(t =>
    t.date.startsWith(month) &&
    !isExcludedFromReal(t.categoryId) &&
    (t.type === 'expense' || (t.type === 'refund' && t.paymentMethod !== 'card'))
  )
  // 카테고리별 예산 실적용: 적금 포함, 카드대금만 제외 (카드 사용과 이중계산 방지)
  const budgetTx = transactions.filter(t =>
    t.date.startsWith(month) &&
    !isCardPaymentCat(t.categoryId) &&
    (t.type === 'expense' || (t.type === 'refund' && t.paymentMethod !== 'card'))
  )

  // ── 지출 방식 분석 ─────────────────────────────────────────────────────────
  const allMonthExpense = transactions.filter(t => t.date.startsWith(month) && t.type === 'expense')
  const accountExpense = allMonthExpense
    .filter(t => t.paymentMethod === 'account' && !isCardPaymentCat(t.categoryId))
    .reduce((s, t) => s + t.amount, 0)
  const cardExpense = allMonthExpense
    .filter(t => t.paymentMethod === 'card')
    .reduce((s, t) => s + t.amount, 0)
  const cardPayment = allMonthExpense
    .filter(t => isCardPaymentCat(t.categoryId))
    .reduce((s, t) => s + t.amount, 0)

  // ── 카드별 청구 예정 ────────────────────────────────────────────────────────
  const { cards } = data
  const prev = prevMonth(month)

  // 이달 카드 사용 (→ 다음달 청구 예정) — 환급 차감
  const cardBreakdown = cards
    .map(card => {
      const charged = allMonthExpense
        .filter(t => t.paymentMethod === 'card' && t.cardId === card.id)
        .reduce((s, t) => s + t.amount, 0)
      const refunded = transactions
        .filter(t => t.date.startsWith(month) && t.type === 'refund' && t.paymentMethod === 'card' && t.cardId === card.id)
        .reduce((s, t) => s + t.amount, 0)
      return { ...card, amount: Math.max(0, charged - refunded) }
    })
    .filter(c => c.amount > 0)

  // 전달 카드 사용액 → 이달 납부 예정 — 환급 차감
  const prevCardBreakdown = cards
    .map(card => {
      const charged = transactions
        .filter(t => t.date.startsWith(prev) && t.type === 'expense' && t.paymentMethod === 'card' && t.cardId === card.id)
        .reduce((s, t) => s + t.amount, 0)
      const refunded = transactions
        .filter(t => t.date.startsWith(prev) && t.type === 'refund' && t.paymentMethod === 'card' && t.cardId === card.id)
        .reduce((s, t) => s + t.amount, 0)
      const netCharged = Math.max(0, charged - refunded)
      const paid = transactions
        .filter(t => t.date.startsWith(month) && isCardPaymentCat(t.categoryId) && t.billingMonth === prev)
        .reduce((s, t) => s + t.amount, 0)
      return { ...card, charged: netCharged, paid, isPaid: paid >= netCharged && netCharged > 0 }
    })
    .filter(c => c.charged > 0)

  // billingMonth 없이 납부한 카드대금 합계 (구분 불가)
  const untaggedCardPayment = transactions
    .filter(t => t.date.startsWith(month) && isCardPaymentCat(t.categoryId) && !t.billingMonth)
    .reduce((s, t) => s + t.amount, 0)

  function getChildren(parentId: string) {
    return categories.filter(c => c.parentId === parentId)
  }
  function getActual(catId: string) {
    return budgetTx
      .filter(t => t.categoryId === catId)
      .reduce((s, t) => t.type === 'refund' ? s - t.amount : s + t.amount, 0)
  }
  function getBudget(catId: string) {
    return budgets.find(b => b.categoryId === catId && b.month === month)?.amount || 0
  }

  // ── 예산 저장 ────────────────────────────────────────────────────────────
  function saveBudget(catId: string) {
    if (month < currentMonth) { setEditing(null); return }
    const amount = parseAmt(editValue)
    if (isNaN(amount) || amount < 0) { setEditing(null); return }
    const next = budgets.filter(b => !(b.categoryId === catId && b.month === month))
    if (amount > 0) next.push({ id: `b${Date.now()}`, categoryId: catId, month, amount } as Budget)
    setBudgets(next)
    setEditing(null)
  }

  // ── 이름 저장 ────────────────────────────────────────────────────────────
  function saveName(catId: string) {
    const name = editNameValue.trim()
    if (name) {
      setCategories(categories.map(c => c.id === catId ? { ...c, name } : c))
    }
    setEditingName(null)
    setEditNameValue('')
  }

  function startEditName(cat: Category) {
    setEditingName(cat.id)
    setEditNameValue(cat.name)
    setEditing(null) // 예산 편집 중이면 닫기
  }

  // ── 이전달 이월 ──────────────────────────────────────────────────────────
  function doCarryOver() {
    const prev = prevMonth(month)
    const prevBudgets = budgets.filter(b => b.month === prev)
    if (prevBudgets.length === 0) {
      setShowCarryOver(false)
      return
    }
    // 현재 달 기존 예산 제거 후 이전 달 예산을 현재 달로 복사
    const kept = budgets.filter(b => b.month !== month)
    const copied = prevBudgets.map(b => ({
      ...b,
      id: `b${Date.now()}_${b.categoryId}`,
      month,
    }))
    setBudgets([...kept, ...copied])
    setShowCarryOver(false)
  }

  function handleCarryOverClick() {
    const prev = prevMonth(month)
    const prevBudgets = budgets.filter(b => b.month === prev)
    if (prevBudgets.length === 0) {
      alert(`${prev} 예산이 없습니다.`)
      return
    }
    setShowCarryOver(true)
  }

  // ── 대분류 집계 ─────────────────────────────────────────────────────────
  function groupTotal(parentId: string) {
    const children = getChildren(parentId)
    return {
      budget: children.reduce((s, c) => s + getBudget(c.id), 0),
      actual: children.reduce((s, c) => s + getActual(c.id), 0),
    }
  }

  // 소분류가 실소비 제외 대상인지 (role=savings 또는 부모/자신의 excludeFromReal)
  function isExcludedCat(categoryId: string): boolean {
    const cat = categories.find(c => c.id === categoryId)
    if (!cat) return false
    if (cat.role === 'savings' || cat.excludeFromReal) return true
    const parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
    return parent?.role === 'savings' || parent?.excludeFromReal || false
  }

  function toggleExcludeFromReal(catId: string) {
    setCategories(categories.map(c => c.id === catId ? { ...c, excludeFromReal: !c.excludeFromReal } : c))
  }

  // ── 전체 합계 ────────────────────────────────────────────────────────────
  const allLeaf = categories.filter(c => c.parentId !== null && c.type === 'expense')
  const totalBudget = allLeaf.reduce((s, c) => s + getBudget(c.id), 0)
  const totalActual = allLeaf.reduce((s, c) => s + getActual(c.id), 0)

  // 제외 그룹: 대분류 전체 제외 OR 소분류 개별 제외 모두 처리
  const excludedGroups = expenseParents
    .map(p => {
      const isParentExcluded = p.role === 'savings' || p.excludeFromReal
      const allChildren = getChildren(p.id)
      const excChildren = isParentExcluded
        ? allChildren
        : allChildren.filter(c => c.excludeFromReal)
      if (excChildren.length === 0) return null
      const isPartial = !isParentExcluded
      return {
        id: p.id, name: p.name, icon: p.icon,
        isSavings: p.role === 'savings',
        isPartial,
        actual: excChildren.reduce((s, c) => s + getActual(c.id), 0),
        budget: excChildren.reduce((s, c) => s + getBudget(c.id), 0),
      }
    })
    .filter((g): g is NonNullable<typeof g> => g !== null)

  const totalExcludedActual = excludedGroups.reduce((s, g) => s + g.actual, 0)
  const totalExcludedBudget = excludedGroups.reduce((s, g) => s + g.budget, 0)
  const totalActualReal = totalActual - totalExcludedActual
  const totalBudgetReal = totalBudget - totalExcludedBudget

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

  function deleteMonthBudget(id: string) {
    // 이번 달 예산 삭제 + 이번 달 숨김 처리 — 카테고리·다른달 예산은 유지
    const childIds = categories.filter(c => c.parentId === id).map(c => c.id)
    const toHide = [id, ...childIds]
    setBudgets(budgets.filter(b => !(toHide.includes(b.categoryId) && b.month === month)))
    const next = { ...categoryHiddenMonths }
    toHide.forEach(cid => {
      next[cid] = Array.from(new Set([...(next[cid] ?? []), month]))
    })
    setCategoryHiddenMonths(next)
  }

  function isHiddenThisMonth(catId: string) {
    return (categoryHiddenMonths[catId] ?? []).includes(month)
  }

  function deleteCategoryGlobal(id: string) {
    // 카테고리 자체 + 모든 달 예산 + 숨김 기록 완전 삭제
    const childIds = categories.filter(c => c.parentId === id).map(c => c.id)
    const toDelete = new Set([id, ...childIds])
    setCategories(categories.filter(c => !toDelete.has(c.id)))
    setBudgets(budgets.filter(b => !toDelete.has(b.categoryId)))
    const next = { ...categoryHiddenMonths }
    toDelete.forEach(cid => delete next[cid])
    setCategoryHiddenMonths(next)
  }

  function toggleCollapse(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const prevM = prevMonth(month)
  const hasPrevBudget = budgets.some(b => b.month === prevM)
  const hasCurrentBudget = budgets.some(b => b.month === month)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900">예산 관리</h1>
        <div className="flex items-center gap-2">
          {/* 이전달 이월 버튼 */}
          <button
            onClick={handleCarryOverClick}
            disabled={!hasPrevBudget}
            className={`text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors ${
              hasPrevBudget
                ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                : 'border-gray-100 text-gray-300 cursor-not-allowed'
            }`}
            title={hasPrevBudget ? `${prevM} 예산을 이월합니다` : '이전 달 예산 없음'}
          >
            ← 이전달 이월
          </button>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {isPastMonth && (
        <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-700">
          <span>🔒</span>
          <span>지난 달 예산은 수정이 잠겨 있습니다. 현재 달 이후만 편집할 수 있어요.</span>
        </div>
      )}

      {/* 총계 카드 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {/* 총 예산 */}
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">실소비 예산</div>
          <div className="text-base font-bold text-gray-900 tabular-nums leading-tight">{totalBudgetReal > 0 ? fmtKRW(totalBudgetReal) : '-'}</div>
          {excludedGroups.filter(g => g.budget > 0).length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-gray-100 space-y-0.5">
              {excludedGroups.filter(g => g.budget > 0).map(g => (
                <div key={g.id} className="flex items-center justify-between">
                  <span className="text-[10px] text-blue-400">{g.icon} {g.name}{g.isPartial ? ' (일부)' : ''}</span>
                  <span className="text-[11px] font-semibold text-blue-500 tabular-nums">{fmtKRW(g.budget)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 실소비 — 실소비만 메인, 제외 항목·카드대금은 구분 표시 */}
        <div className="bg-white rounded-xl p-3 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">실소비</div>
          <div className="text-base font-bold tabular-nums leading-tight text-gray-900">
            {fmtKRW(totalActualReal)}
          </div>
          {(excludedGroups.filter(g => g.actual > 0).length > 0 || cardPayment > 0) && (
            <div className="mt-1.5 pt-1.5 border-t border-gray-100 space-y-0.5">
              {excludedGroups.filter(g => g.actual > 0).map(g => (
                <div key={g.id} className="flex items-center justify-between">
                  <span className="text-[10px] text-blue-400">{g.icon} {g.name}{g.isPartial ? ' (일부)' : ''}</span>
                  <span className="text-[11px] font-semibold text-blue-500 tabular-nums">{fmtKRW(g.actual)}</span>
                </div>
              ))}
              {cardPayment > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-purple-400">💳 카드대금 납부</span>
                  <span className="text-[11px] font-semibold text-purple-500 tabular-nums">{fmtKRW(cardPayment)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 남은 실소비 예산 / 초과 사용 */}
        {(() => {
          const isOver = totalBudgetReal > 0 && totalActualReal > totalBudgetReal
          const diff = totalBudgetReal - totalActualReal
          return (
            <div className={`rounded-xl p-3 shadow-sm ${isOver ? 'bg-red-50' : 'bg-white'}`}>
              <div className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${isOver ? 'text-red-400' : 'text-gray-400'}`}>
                {isOver ? '⚠️ 초과 사용' : '남은 예산'}
              </div>
              <div className={`text-base font-bold tabular-nums leading-tight ${diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {totalBudgetReal > 0 ? fmtKRW(Math.abs(diff)) : '-'}
              </div>
              {isOver && (
                <div className="text-[10px] text-red-400 mt-0.5">실소비 예산 대비 {((totalActualReal / totalBudgetReal - 1) * 100).toFixed(0)}% 초과</div>
              )}
            </div>
          )
        })()}
      </div>

      {/* 전체 진행바 — 실소비 기준 */}
      {totalBudgetReal > 0 && (
        <div className="bg-white rounded-xl px-4 py-3 shadow-sm mb-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-gray-500">실소비 예산 사용률</span>
            <span className={`text-sm font-bold tabular-nums ${totalActualReal > totalBudgetReal ? 'text-red-500' : 'text-blue-600'}`}>
              {Math.min(totalActualReal / totalBudgetReal * 100, 100).toFixed(1)}%
            </span>
          </div>
          <div className="bg-gray-100 rounded-full h-2.5">
            <div className={`h-2.5 rounded-full transition-all ${totalActualReal > totalBudgetReal ? 'bg-red-500' : totalActualReal / totalBudgetReal > 0.8 ? 'bg-amber-400' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(totalActualReal / totalBudgetReal * 100, 100)}%` }} />
          </div>
        </div>
      )}

      {/* 지출 방식 분석 */}
      <div className="bg-white rounded-xl p-3 shadow-sm mb-3">
        <div className="text-xs font-semibold text-gray-500 mb-2">이달 지출 분석</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="bg-blue-50 rounded-lg p-2">
            <div className="text-xs text-blue-500 mb-0.5">통장 직접 결제</div>
            <div className="text-sm font-bold text-blue-700">{fmtKRW(accountExpense)}</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-2">
            <div className="text-xs text-purple-500 mb-0.5">카드 사용</div>
            <div className="text-sm font-bold text-purple-700">{fmtKRW(cardExpense)}</div>
          </div>
        </div>
        {/* 이달 납부 예정 (전달 카드 사용분) */}
        <div className="border-t border-gray-100 pt-2 mb-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-700">
              {fmtMonthLabel(prev)} 카드대금 납부 예정
            </span>
            {untaggedCardPayment > 0 && (
              <span className="text-xs text-gray-400">기타 납부 {fmtKRW(untaggedCardPayment)}</span>
            )}
          </div>
          {prevCardBreakdown.length > 0 ? (
            <div className="space-y-1.5">
              {prevCardBreakdown.map(card => (
                <div key={card.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: card.color }} />
                    <span className="text-gray-700 font-medium">{card.name}</span>
                    <span className="text-gray-300">결제일 {card.billingDate}일</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{fmtKRW(card.charged)}</span>
                    {card.isPaid
                      ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-600 font-medium">납부완료</span>
                      : <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">미납</span>
                    }
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-100">
                <span className="text-gray-400">합계</span>
                <span className="font-bold text-purple-700">{fmtKRW(prevCardBreakdown.reduce((s, c) => s + c.charged, 0))}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400">{fmtMonthLabel(prev)} 카드 사용 내역 없음</div>
          )}
        </div>

        {/* 이달 카드 사용 → 다음달 청구 예정 */}
        <div className="border-t border-gray-100 pt-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-500">이달 카드 사용 <span className="text-gray-300 font-normal">(다음달 청구 예정)</span></span>
          </div>
          {cardBreakdown.length > 0 ? (
            <div className="space-y-1.5">
              {cardBreakdown.map(card => (
                <div key={card.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: card.color }} />
                    <span className="text-gray-700 font-medium">{card.name}</span>
                  </div>
                  <span className="font-semibold text-gray-800">{fmtKRW(card.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100">
                <span className="text-gray-400">합계</span>
                <span className="font-bold text-purple-700">{fmtKRW(cardExpense)}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400">이달 카드 사용 내역 없음</div>
          )}
        </div>
      </div>

      {/* 대분류별 테이블 */}
      <div className="space-y-2">
        {expenseParents.filter(p => !isHiddenThisMonth(p.id)).map(parent => {
          const children = getChildren(parent.id).filter(c => !isHiddenThisMonth(c.id))
          const { budget: grpBudget, actual: grpActual } = groupTotal(parent.id)
          const isCollapsed = collapsed.has(parent.id)
          const grpDiff = grpBudget - grpActual
          const grpOver = grpBudget > 0 && grpActual > grpBudget

          return (
            <div key={parent.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* 대분류 헤더 */}
              <div
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors"
                style={{ borderLeft: `3px solid ${parent.color}` }}
              >
                <button onClick={() => toggleCollapse(parent.id)} className="flex items-center gap-2 flex-1 text-left">
                  <span className="text-base">{parent.icon}</span>
                  {/* 대분류 이름 인라인 편집 */}
                  {editingName === parent.id ? (
                    <input
                      value={editNameValue}
                      onChange={e => setEditNameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveName(parent.id); if (e.key === 'Escape') setEditingName(null) }}
                      onBlur={() => saveName(parent.id)}
                      onClick={e => e.stopPropagation()}
                      className="text-sm font-bold text-gray-900 border-b-2 border-blue-400 bg-transparent outline-none w-32"
                      autoFocus
                    />
                  ) : (
                    <span className="text-sm font-bold text-gray-900">{parent.name}</span>
                  )}
                  <span className="text-xs text-gray-400">({children.length}개)</span>
                </button>
                <div className="flex items-center gap-2">
                  {grpBudget > 0 && (
                    <span className={`text-xs font-bold tabular-nums ${grpOver ? 'text-red-500' : 'text-emerald-600'}`}>
                      {(grpActual / grpBudget * 100).toFixed(0)}%
                    </span>
                  )}
                  <span className="text-xs text-gray-500 tabular-nums">{fmtShort(grpActual)} / {grpBudget > 0 ? fmtShort(grpBudget) : '-'}</span>
                  {/* 실소비 제외 토글 */}
                  {parent.role !== 'savings' ? (
                    <button
                      onClick={e => { e.stopPropagation(); toggleExcludeFromReal(parent.id) }}
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border transition-all ${
                        parent.excludeFromReal
                          ? 'bg-blue-100 border-blue-300 text-blue-600'
                          : 'bg-gray-50 border-gray-200 text-gray-300 hover:border-gray-300 hover:text-gray-400'
                      }`}
                      title={parent.excludeFromReal ? '실소비 제외 중 (클릭 시 포함)' : '실소비에서 제외하기'}>
                      {parent.excludeFromReal ? '제외중' : '제외'}
                    </button>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-400 font-medium">적금</span>
                  )}
                  {/* 이름 편집 버튼 */}
                  <button
                    onClick={e => { e.stopPropagation(); startEditName(parent) }}
                    className="text-gray-300 hover:text-blue-400 text-xs transition-colors"
                    title="이름 수정">✏️</button>
                  <button
                    onClick={e => { e.stopPropagation(); toggleCollapse(parent.id) }}
                    className={`text-xs text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}>▲</button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteCatId(parent.id) }}
                    className="text-red-400 hover:text-red-600 text-xs">✕</button>
                </div>
              </div>

              {/* 소분류 리스트 */}
              {!isCollapsed && (
                <div>
                  {/* 컬럼 헤더 */}
                  <div className="grid grid-cols-4 px-3 py-1.5 bg-gray-50 border-t border-b border-gray-200 text-[11px] font-semibold text-gray-500 tracking-wide">
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
                      <div key={cat.id} className={`border-b border-gray-50 last:border-0 group ${isExcludedCat(cat.id) && !parent.excludeFromReal ? 'bg-blue-50/40' : ''}`}>
                        <div className="grid grid-cols-4 px-3 py-1.5 items-center hover:bg-gray-50 transition-colors">
                          {/* 소분류명 */}
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm flex-shrink-0">{cat.icon}</span>
                            {editingName === cat.id ? (
                              <input
                                value={editNameValue}
                                onChange={e => setEditNameValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveName(cat.id); if (e.key === 'Escape') setEditingName(null) }}
                                onBlur={() => saveName(cat.id)}
                                className="text-sm text-gray-700 border-b-2 border-blue-400 bg-transparent outline-none w-20"
                                autoFocus
                              />
                            ) : (
                              <span className="text-sm text-gray-700 truncate">{cat.name}</span>
                            )}
                            {/* hover 시 표시: 제외 토글 + 편집/삭제 */}
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              {/* 부모가 전체 제외 중이 아닐 때만 소분류 개별 토글 표시 */}
                              {parent.role !== 'savings' && !parent.excludeFromReal && (
                                <button
                                  onClick={() => toggleExcludeFromReal(cat.id)}
                                  className={`text-[9px] px-1 py-0.5 rounded-full font-medium border transition-all ${
                                    cat.excludeFromReal
                                      ? 'bg-blue-100 border-blue-300 text-blue-600'
                                      : 'bg-gray-50 border-gray-200 text-gray-300 hover:text-gray-500'
                                  }`}
                                  title={cat.excludeFromReal ? '제외 중 (클릭 시 포함)' : '실소비에서 제외'}>
                                  {cat.excludeFromReal ? '제외중' : '제외'}
                                </button>
                              )}
                              <button
                                onClick={() => startEditName(cat)}
                                className="text-gray-300 hover:text-blue-400 text-xs"
                                title="이름 수정">✏️</button>
                              <button
                                onClick={() => setDeleteCatId(cat.id)}
                                className="text-red-400 hover:text-red-600 text-xs">✕</button>
                            </div>
                          </div>
                          {/* 예산 (클릭 편집) */}
                          <div className="text-right">
                            {editing === cat.id && !isPastMonth ? (
                              <input
                                type="text"
                                inputMode="numeric"
                                value={editValue}
                                onChange={e => setEditValue(fmtInput(e.target.value))}
                                onKeyDown={e => { if (e.key === 'Enter') saveBudget(cat.id); if (e.key === 'Escape') setEditing(null) }}
                                onBlur={() => saveBudget(cat.id)}
                                className="w-24 text-right text-xs border border-blue-300 rounded-lg px-2 py-1 focus:outline-none"
                                autoFocus
                              />
                            ) : isPastMonth ? (
                              <span className="text-sm text-gray-400 tabular-nums">
                                {budgetAmt > 0 ? fmtKRW(budgetAmt) : <span className="text-gray-300 text-xs">-</span>}
                              </span>
                            ) : (
                              <button
                                onClick={() => { setEditing(cat.id); setEditValue(fmtInput(String(budgetAmt))); setEditingName(null) }}
                                className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                                {budgetAmt > 0 ? fmtKRW(budgetAmt) : <span className="text-gray-300 text-xs">설정</span>}
                              </button>
                            )}
                          </div>
                          {/* 실제 — 클릭 시 거래내역으로 이동 (FR-003) */}
                          <div
                            onClick={() => actual > 0 && router.push(`/transactions?category=${cat.id}&month=${month}&catLabel=${encodeURIComponent(cat.name)}`)}
                            className={`text-right text-sm ${actual > 0 ? 'font-medium text-gray-900 cursor-pointer hover:text-blue-600 hover:underline' : 'text-gray-300'}`}
                            title={actual > 0 ? `${cat.name} 거래내역 보기` : undefined}>
                            {actual > 0 ? fmtKRW(actual) : '-'}
                          </div>
                          {/* 차액 */}
                          <div className={`text-right text-sm font-medium ${isOver ? 'text-red-500' : diff > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {budgetAmt > 0 ? (isOver ? '+' + fmtKRW(Math.abs(diff)) : diff > 0 ? '-' + fmtKRW(diff) : '±0') : '-'}
                          </div>
                        </div>
                        {/* 진행바 */}
                        {budgetAmt > 0 && (
                          <div className="px-3 pb-1">
                            <div className="bg-gray-100 rounded-full h-0.5">
                              <div className={`h-0.5 rounded-full transition-all ${isOver ? 'bg-red-500' : pct > 80 ? 'bg-amber-400' : 'bg-blue-500'}`}
                                style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* 합계 행 */}
                  {children.length > 0 && (
                    <div className="grid grid-cols-4 px-3 py-1.5 bg-gray-50 text-xs font-semibold text-gray-500 border-t border-gray-100">
                      <span>소계</span>
                      <span className="text-right">{grpBudget > 0 ? fmtKRW(grpBudget) : '-'}</span>
                      <span className="text-right">{grpActual > 0 ? fmtKRW(grpActual) : '-'}</span>
                      <span className={`text-right ${grpOver ? 'text-red-500' : grpDiff > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {grpBudget > 0 ? (grpOver ? '+' + fmtKRW(Math.abs(grpDiff)) : grpDiff > 0 ? '-' + fmtKRW(grpDiff) : '±0') : '-'}
                      </span>
                    </div>
                  )}

                  {/* + 소분류 추가 */}
                  {!isPastMonth && (
                    <button
                      onClick={() => { setModalParentId(parent.id); setModal('addChild') }}
                      className="w-full px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1 border-t border-gray-50">
                      <span className="text-sm leading-none">+</span> 소분류 추가
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* + 대분류 추가 버튼 */}
      {!isPastMonth && (
        <button
          onClick={() => setModal('addParent')}
          className="mt-3 w-full bg-white rounded-xl shadow-sm py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors border-2 border-dashed border-blue-200 flex items-center justify-center gap-1.5">
          <span className="text-base">+</span> 대분류 추가
        </button>
      )}

      {/* ── 이전달 이월 확인 모달 ─────────────────────────────────── */}
      {showCarryOver && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="text-center mb-5">
              <div className="text-3xl mb-3">📋</div>
              <h2 className="text-base font-bold text-gray-900 mb-1">이전달 예산 이월</h2>
              <p className="text-sm text-gray-500">
                <span className="font-medium text-blue-600">{prevM}</span>의 예산을{' '}
                <span className="font-medium text-blue-600">{month}</span>으로 복사합니다.
              </p>
              {hasCurrentBudget && (
                <p className="text-xs text-amber-600 mt-2 bg-amber-50 rounded-xl px-3 py-2">
                  ⚠️ {month}에 이미 설정된 예산은 덮어씌워집니다.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCarryOver(false)}
                className="flex-1 bg-gray-100 text-gray-600 font-semibold py-3 rounded-xl hover:bg-gray-200 transition-colors text-sm">
                취소
              </button>
              <button onClick={doCarryOver}
                className="flex-1 bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm">
                이월하기
              </button>
            </div>
          </div>
        </div>
      )}

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

      {deleteCatId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDeleteCatId(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-base font-semibold text-gray-900 mb-2">카테고리 삭제</div>
            <p className="text-sm text-gray-500 mb-5">
              이번 달 예산만 삭제할 수 있습니다.<br />
              카테고리 자체를 완전히 삭제하면 <span className="text-red-600 font-medium">모든 달의 예산과 거래 내역 분류</span>가 사라집니다.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => { deleteMonthBudget(deleteCatId); setDeleteCatId(null) }}
                className="w-full py-2.5 rounded-xl bg-blue-50 text-blue-600 font-medium text-sm hover:bg-blue-100 transition-colors"
              >
                이번 달 예산만 삭제
              </button>
              <button
                onClick={() => { deleteCategoryGlobal(deleteCatId); setDeleteCatId(null) }}
                className="w-full py-2.5 rounded-xl bg-red-50 text-red-600 font-medium text-sm hover:bg-red-100 transition-colors"
              >
                카테고리 완전 삭제 (전체 달 적용)
              </button>
              <button
                onClick={() => setDeleteCatId(null)}
                className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-500 font-medium text-sm hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
