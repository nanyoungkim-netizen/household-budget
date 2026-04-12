'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/AppContext'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const { user, signIn, signUp, isLoading } = useApp()
  const router = useRouter()
  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (user) router.replace('/')
  }, [user, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) { setError('이메일과 비밀번호를 입력하세요'); return }
    setLoading(true)
    setError('')
    setSuccess('')

    const err = tab === 'login'
      ? await signIn(email, password)
      : await signUp(email, password)

    if (err) {
      setError(err)
    } else if (tab === 'signup') {
      setSuccess('가입 완료! 이메일을 확인해서 인증 후 로그인하세요.')
    } else {
      router.replace('/')
    }
    setLoading(false)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Supabase 미설정 시 안내
  if (!supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚙️</div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Supabase 설정 필요</h1>
          <p className="text-sm text-gray-500 mb-6">
            로그인 기능을 사용하려면 Supabase 환경변수를 설정해야 합니다.
          </p>
          <div className="bg-gray-50 rounded-xl p-4 text-left text-xs font-mono text-gray-700 mb-6 space-y-1">
            <div>NEXT_PUBLIC_SUPABASE_URL=your-url</div>
            <div>NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key</div>
          </div>
          <a href="https://supabase.com" target="_blank" rel="noopener noreferrer"
            className="text-blue-600 text-sm hover:underline block mb-4">
            → supabase.com 에서 프로젝트 생성하기
          </a>
          <button onClick={() => router.replace('/')}
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm">
            로그인 없이 계속하기 (기기 저장)
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full">
        {/* 로고 */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold">가</div>
          <div>
            <div className="font-bold text-gray-900">가계부</div>
            <div className="text-xs text-gray-400">스마트 재무 관리</div>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          {(['login', 'signup'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError(''); setSuccess('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
              {t === 'login' ? '로그인' : '회원가입'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {error && (
            <div className="bg-red-50 text-red-600 text-xs rounded-xl px-4 py-3">{error}</div>
          )}
          {success && (
            <div className="bg-emerald-50 text-emerald-600 text-xs rounded-xl px-4 py-3">{success}</div>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm disabled:opacity-50">
            {loading ? '처리 중...' : tab === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <button onClick={() => router.replace('/')}
            className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1">
            로그인 없이 이 기기에서만 사용하기
          </button>
        </div>
      </div>
    </div>
  )
}
