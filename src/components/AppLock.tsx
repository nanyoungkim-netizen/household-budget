'use client'

import { useState, useEffect, useCallback } from 'react'

const PASSWORD_KEY = 'hb_lock_password'
const SESSION_KEY = 'hb_unlocked'

export function useAppLock() {
  const [password, setPasswordState] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setPasswordState(localStorage.getItem(PASSWORD_KEY))
    setHydrated(true)
  }, [])

  const setPassword = useCallback((pw: string) => {
    if (pw) {
      localStorage.setItem(PASSWORD_KEY, pw)
      sessionStorage.setItem(SESSION_KEY, 'true')
    } else {
      localStorage.removeItem(PASSWORD_KEY)
      sessionStorage.removeItem(SESSION_KEY)
    }
    setPasswordState(pw || null)
  }, [])

  const isLocked = hydrated && !!password && sessionStorage.getItem(SESSION_KEY) !== 'true'

  return { password, setPassword, isLocked, hydrated }
}

interface AppLockProps {
  children: React.ReactNode
}

export default function AppLock({ children }: AppLockProps) {
  const { password, isLocked, hydrated } = useAppLock()
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  function unlock() {
    if (input === password) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      setError(false)
      // 강제 re-render
      window.location.reload()
    } else {
      setError(true)
      setShake(true)
      setInput('')
      setTimeout(() => setShake(false), 500)
    }
  }

  if (!hydrated) return null

  if (!isLocked) return <>{children}</>

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-3xl shadow-lg p-8 w-full max-w-sm text-center transition-all ${shake ? 'animate-shake' : ''}`}>
        {/* 로고 */}
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-5">
          가
        </div>
        <h1 className="text-lg font-bold text-gray-900 mb-1">가계부</h1>
        <p className="text-sm text-gray-400 mb-8">비밀번호를 입력하세요</p>

        {/* 비밀번호 입력 */}
        <input
          type="password"
          value={input}
          onChange={e => { setInput(e.target.value); setError(false) }}
          onKeyDown={e => e.key === 'Enter' && unlock()}
          placeholder="비밀번호"
          className={`w-full border-2 rounded-2xl px-4 py-3 text-center text-lg tracking-widest focus:outline-none transition-colors ${
            error ? 'border-red-400 bg-red-50' : 'border-gray-200 focus:border-blue-500'
          }`}
          autoFocus
        />

        {error && (
          <p className="text-sm text-red-500 mt-2">비밀번호가 틀렸어요</p>
        )}

        <button
          onClick={unlock}
          className="w-full mt-4 bg-blue-600 text-white font-semibold py-3 rounded-2xl hover:bg-blue-700 transition-colors"
        >
          잠금 해제
        </button>
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  )
}
