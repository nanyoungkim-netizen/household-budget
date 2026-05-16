'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useApp, BudgetMeta } from '@/lib/AppContext'
import { useState, useRef, useEffect } from 'react'

const navItems = [
  { href: '/', icon: '🏠', label: '대시보드' },
  { href: '/transactions', icon: '📋', label: '거래내역' },
  { href: '/budget', icon: '📊', label: '예산 관리' },
  { href: '/statistics', icon: '📈', label: '통계 & 차트' },
  { href: '/savings', icon: '💰', label: '적금·예금' },
  { href: '/goals', icon: '🎯', label: '재무 목표' },
  { href: '/investments', icon: '📈', label: '투자 내역' },
  { href: '/history', icon: '📚', label: '이전 가계부' },
  { href: '/backup', icon: '💾', label: '백업 & 복구' },
  { href: '/settings', icon: '⚙️', label: '기초 설정' },
]

const mobileNavItems = navItems.slice(0, 4)

// ── 가계부 전환 드롭다운 ─────────────────────────────────────────────────────
function BudgetSwitcher() {
  const { budgetList, activeBudgetId, createBudget, switchBudget, deleteBudget, renameBudget } = useApp()

  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const activeMeta = budgetList.find(m => m.id === activeBudgetId)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setRenamingId(null)
        setConfirmDeleteId(null)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  function handleCreate() {
    const name = newName.trim()
    if (!name) return
    createBudget(name)
    setNewName('')
    setCreating(false)
    setOpen(false)
  }

  function handleRename(id: string) {
    if (renameValue.trim()) renameBudget(id, renameValue.trim())
    setRenamingId(null)
    setRenameValue('')
  }

  function startRename(meta: BudgetMeta) {
    setRenamingId(meta.id)
    setRenameValue(meta.name)
    setConfirmDeleteId(null)
  }

  function handleDelete(id: string) {
    deleteBudget(id)
    setConfirmDeleteId(null)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* 토글 버튼 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span>📒</span>
          <span className="text-sm font-semibold text-blue-700 truncate">{activeMeta?.name ?? '가계부'}</span>
        </div>
        <span className="text-blue-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-2xl shadow-xl z-[100] overflow-hidden">

          {/* 가계부 목록 */}
          <div className="p-1.5 space-y-0.5 max-h-64 overflow-y-auto">
            {budgetList.map(meta => {
              if (confirmDeleteId === meta.id) {
                return (
                  <div key={meta.id} className="px-3 py-2.5 bg-red-50 rounded-xl">
                    <p className="text-xs text-red-600 font-medium mb-2">
                      "{meta.name}" 가계부를 삭제하면<br />모든 데이터가 영구 삭제됩니다.
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleDelete(meta.id)}
                        className="flex-1 text-xs bg-red-500 text-white rounded-lg py-1.5 font-semibold"
                      >
                        삭제
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="flex-1 text-xs bg-gray-100 text-gray-600 rounded-lg py-1.5"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )
              }

              if (renamingId === meta.id) {
                return (
                  <div key={meta.id} className="flex items-center gap-1 px-2 py-1.5 bg-blue-50 rounded-xl">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(meta.id)
                        if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') }
                      }}
                      className="flex-1 text-sm border border-blue-300 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-200 min-w-0"
                    />
                    <button
                      onClick={() => handleRename(meta.id)}
                      className="text-xs text-white bg-blue-500 rounded-lg px-2 py-1 font-semibold shrink-0"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => { setRenamingId(null); setRenameValue('') }}
                      className="text-xs text-gray-400 px-1 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                )
              }

              const isActive = meta.id === activeBudgetId
              return (
                <div
                  key={meta.id}
                  className={`flex items-center gap-1 rounded-xl px-2 py-1.5 ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  {/* 선택 */}
                  <button
                    onClick={() => { switchBudget(meta.id); setOpen(false) }}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                  >
                    <span className="text-sm">📒</span>
                    <span className={`text-sm truncate ${isActive ? 'font-semibold text-blue-700' : 'text-gray-700'}`}>
                      {meta.name}
                    </span>
                    {isActive && <span className="text-blue-500 text-xs ml-auto shrink-0">✓</span>}
                  </button>
                  {/* 이름변경 */}
                  <button
                    onClick={() => startRename(meta)}
                    className="text-gray-300 hover:text-blue-500 text-sm px-1 shrink-0 transition-colors"
                    title="이름 변경"
                  >
                    ✏️
                  </button>
                  {/* 삭제 (마지막 가계부는 숨김) */}
                  {budgetList.length > 1 && (
                    <button
                      onClick={() => { setConfirmDeleteId(meta.id); setRenamingId(null) }}
                      className="text-gray-300 hover:text-red-500 text-sm px-1 shrink-0 transition-colors"
                      title="삭제"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* 새 가계부 만들기 */}
          <div className="border-t border-gray-100 p-1.5">
            {creating ? (
              <div className="flex items-center gap-1 px-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') { setCreating(false); setNewName('') }
                  }}
                  placeholder="가계부 이름"
                  className="flex-1 text-sm border border-blue-300 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 min-w-0"
                />
                <button
                  onClick={handleCreate}
                  className="text-xs text-white bg-blue-500 rounded-lg px-2.5 py-1.5 font-semibold shrink-0"
                >
                  추가
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName('') }}
                  className="text-xs text-gray-400 px-1 shrink-0"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setCreating(true); setRenamingId(null); setConfirmDeleteId(null) }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-blue-600 hover:bg-blue-50 transition-colors font-medium"
              >
                <span className="text-base font-bold">+</span>
                <span>새 가계부 만들기</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 사이드바 ─────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const pathname = usePathname()
  const { user, signOut } = useApp()
  const isSettingsArea = ['/settings', '/accounts', '/cards'].includes(pathname)

  return (
    <>
      {/* 데스크탑 사이드바 */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-56 bg-white border-r border-gray-100 z-30 shadow-sm">
        <div className="p-5 pb-3 border-b border-gray-100 space-y-3">
          <button onClick={() => window.location.reload()} className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-lg">🌰</div>
            <div className="text-left">
              <div className="font-bold text-sm text-gray-900">밤티부</div>
              <div className="text-xs text-gray-400">스마트 재무 관리</div>
            </div>
          </button>
          <BudgetSwitcher />
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map(item => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 mx-3 px-3 py-2.5 rounded-xl mb-0.5 text-sm font-medium transition-all ${
                  isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-100 space-y-2">
          <div className="text-xs text-gray-400 truncate text-center">☁️ {user?.email}</div>
          <button
            onClick={signOut}
            className="w-full text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 py-2 rounded-xl transition-colors"
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* 모바일 상단 가계부 전환바 */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-100 z-30 px-4 py-2">
        <BudgetSwitcher />
      </div>

      {/* 모바일 하단 탭바 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-30">
        <div className="flex items-center justify-around px-2 py-1">
          {mobileNavItems.map(item => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl transition-colors ${
                  isActive ? 'text-blue-600' : 'text-gray-400'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
          <Link
            href="/settings"
            className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl transition-colors ${
              isSettingsArea ? 'text-blue-600' : 'text-gray-400'
            }`}
          >
            <span className="text-xl">⚙️</span>
            <span className="text-[10px] font-medium">설정</span>
          </Link>
        </div>
      </nav>
    </>
  )
}
