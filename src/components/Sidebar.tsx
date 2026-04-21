'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useApp } from '@/lib/AppContext'

const navItems = [
  { href: '/', icon: '🏠', label: '대시보드' },
  { href: '/transactions', icon: '📋', label: '거래내역' },
  { href: '/budget', icon: '📊', label: '예산 관리' },
  { href: '/statistics', icon: '📈', label: '통계 & 차트' },
  { href: '/savings', icon: '💰', label: '적금·예금' },
  { href: '/goals', icon: '🎯', label: '재무 목표' },
  { href: '/history', icon: '📚', label: '이전 가계부' },
  { href: '/settings', icon: '⚙️', label: '기초 설정' },
]

const mobileNavItems = navItems.slice(0, 4)

export default function Sidebar() {
  const pathname = usePathname()
  const { user, signOut } = useApp()

  const isSettingsArea = ['/settings', '/accounts', '/cards'].includes(pathname)

  return (
    <>
      {/* 데스크탑 사이드바 */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-56 bg-white border-r border-gray-100 z-30 shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-lg">🌰</div>
            <div>
              <div className="font-bold text-sm text-gray-900">밤티부</div>
              <div className="text-xs text-gray-400">스마트 재무 관리</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map(item => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 mx-3 px-3 py-2.5 rounded-xl mb-0.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* 하단: 계정 정보 + 로그아웃 */}
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

      {/* 모바일 하단 탭바 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-30 safe-area-inset-bottom">
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
