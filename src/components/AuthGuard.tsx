'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useApp } from '@/lib/AppContext'
import Sidebar from './Sidebar'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useApp()
  const router = useRouter()
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  useEffect(() => {
    if (!isLoading && !user && !isLoginPage) {
      router.replace('/login')
    }
  }, [user, isLoading, isLoginPage, router])

  // 로그인 페이지는 사이드바 없이 그냥 렌더
  if (isLoginPage) {
    return <>{children}</>
  }

  // 인증 확인 중
  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-lg">가</div>
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // 로그인 완료 → 사이드바 + 컨텐츠
  return (
    <>
      <Sidebar />
      <main className="md:ml-56 min-h-screen pb-20 md:pb-0">
        {children}
      </main>
    </>
  )
}
