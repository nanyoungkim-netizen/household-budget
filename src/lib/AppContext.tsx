'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { Account, Category, Transaction, Budget, Card, Installment, Saving, Goal, CardBilling, MappingRule } from '@/types'
import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

// ── 기본 카테고리 (대분류/소분류 계층 구조) ───────────────────────────────────
export const DEFAULT_CATEGORIES: Category[] = [
  // 수입 대분류
  { id: 'pg_income',     name: '수입',       type: 'income',  icon: '💰', color: '#00B493', parentId: null },
  // 수입 소분류
  { id: 'salary',        name: '급여',        type: 'income',  icon: '💰', color: '#00B493', parentId: 'pg_income' },
  { id: 'interest',      name: '이자',        type: 'income',  icon: '🏦', color: '#00B493', parentId: 'pg_income' },
  { id: 'saving_return', name: '적금 만기',   type: 'income',  icon: '🎉', color: '#00B493', parentId: 'pg_income' },
  { id: 'other_income',  name: '기타수입',    type: 'income',  icon: '💵', color: '#00B493', parentId: 'pg_income' },
  // 지출 대분류
  { id: 'pg_living',     name: '관리비',      type: 'expense', icon: '🏠', color: '#FF6B6B', parentId: null },
  { id: 'pg_loan',       name: '대출이자',    type: 'expense', icon: '🏦', color: '#EC7063', parentId: null },
  { id: 'pg_saving',     name: '적금',        type: 'expense', icon: '💰', color: '#A8D8EA', parentId: null, role: 'savings' },
  { id: 'pg_transport',  name: '교통비',      type: 'expense', icon: '🚌', color: '#4ECDC4', parentId: null },
  { id: 'pg_comm',       name: '통신비',      type: 'expense', icon: '📱', color: '#45B7D1', parentId: null },
  { id: 'pg_insurance',  name: '보험료',      type: 'expense', icon: '🛡️', color: '#96CEB4', parentId: null },
  { id: 'pg_food',       name: '식비',        type: 'expense', icon: '🍽️', color: '#FF8E53', parentId: null },
  { id: 'pg_etc',        name: '기타지출',    type: 'expense', icon: '📦', color: '#CFD8DC', parentId: null },
  // 지출 소분류
  { id: 'living',        name: '생활비',      type: 'expense', icon: '🏠', color: '#FF6B6B', parentId: 'pg_living' },
  { id: 'gas',           name: '가스',        type: 'expense', icon: '🔥', color: '#FF6B6B', parentId: 'pg_living' },
  { id: 'water',         name: '수도',        type: 'expense', icon: '💧', color: '#4ECDC4', parentId: 'pg_living' },
  { id: 'electricity',   name: '전기',        type: 'expense', icon: '⚡', color: '#FFB800', parentId: 'pg_living' },
  { id: 'loan',          name: '대출이자',    type: 'expense', icon: '🏦', color: '#EC7063', parentId: 'pg_loan' },
  { id: 'saving',        name: '적금',        type: 'expense', icon: '💰', color: '#A8D8EA', parentId: 'pg_saving' },
  { id: 'transport',     name: '교통비',      type: 'expense', icon: '🚌', color: '#4ECDC4', parentId: 'pg_transport' },
  { id: 'communication', name: '통신비',      type: 'expense', icon: '📱', color: '#45B7D1', parentId: 'pg_comm' },
  { id: 'insurance',     name: '보험료',      type: 'expense', icon: '🛡️', color: '#96CEB4', parentId: 'pg_insurance' },
  { id: 'food',          name: '식비',        type: 'expense', icon: '🍽️', color: '#FF8E53', parentId: 'pg_food' },
  { id: 'drink',         name: '술·음료',     type: 'expense', icon: '🍺', color: '#F0B27A', parentId: 'pg_food' },
  { id: 'shopping',      name: '쇼핑·미용',   type: 'expense', icon: '🛍️', color: '#F7DC6F', parentId: 'pg_etc' },
  { id: 'selfdev',       name: '자기계발',    type: 'expense', icon: '📚', color: '#82E0AA', parentId: 'pg_etc' },
  { id: 'gift',          name: '선물·경조',   type: 'expense', icon: '🎁', color: '#F1948A', parentId: 'pg_etc' },
  { id: 'travel',        name: '여행',        type: 'expense', icon: '✈️', color: '#85C1E9', parentId: 'pg_etc' },
  { id: 'daily',         name: '생필품',      type: 'expense', icon: '🧴', color: '#A9CCE3', parentId: 'pg_etc' },
  { id: 'subscription',  name: '구독료',      type: 'expense', icon: '📺', color: '#DDA0DD', parentId: 'pg_etc' },
  { id: 'card',          name: '카드대금',    type: 'expense', icon: '💳', color: '#B0BEC5', parentId: 'pg_etc', role: 'card_payment' },
  { id: 'etc',           name: '기타',        type: 'expense', icon: '📦', color: '#CFD8DC', parentId: 'pg_etc' },
]

// 기존 데이터에 role 자동 부여 (이름/ID 기반 → 1회 마이그레이션)
export function migrateCategories(cats: Category[]): Category[] {
  return cats.map(cat => {
    if (cat.role !== undefined) return cat  // 이미 설정된 경우 절대 덮어쓰지 않음
    if (cat.id === 'card' || /카드대금/.test(cat.name)) return { ...cat, role: 'card_payment' as const }
    if (cat.parentId === null && /적금|예금|저축/.test(cat.name)) return { ...cat, role: 'savings' as const }
    if (cat.savingId) return { ...cat, role: 'savings' as const }
    return cat
  })
}

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'toss',    name: '토스뱅크', bank: '토스뱅크', balance: 0, color: '#0064FF', assetType: 'cash' },
  { id: 'kb',      name: '국민은행', bank: '국민은행', balance: 0, color: '#FFB800', assetType: 'cash' },
  { id: 'gwangju', name: '광주은행', bank: '광주은행', balance: 0, color: '#00B493', assetType: 'cash' },
]

export const DEFAULT_CARDS: Card[] = [
  { id: 'card1', name: '신한카드', bank: '신한은행', billingDate: 15, color: '#0065CC' },
  { id: 'card2', name: '롯데카드', bank: '롯데은행', billingDate: 25, color: '#E60000' },
  { id: 'card3', name: '현대카드', bank: '현대카드', billingDate: 10, color: '#1A1A1A' },
  { id: 'card4', name: '삼성카드', bank: '삼성카드', billingDate: 20, color: '#1259AA' },
]

// ── 앱 데이터 타입 ────────────────────────────────────────────────────────────
interface AppData {
  categories: Category[]
  accounts: Account[]
  transactions: Transaction[]
  budgets: Budget[]
  cards: Card[]
  installments: Installment[]
  savings: Saving[]
  goals: Goal[]
  cardBillings: CardBilling[]   // FR-009
  mappingRules: MappingRule[]   // FR-08: 가맹점-카테고리 매핑 규칙
  lastModified: string | null
  isSetupComplete: boolean
}

const INITIAL_DATA: AppData = {
  categories: DEFAULT_CATEGORIES,
  accounts: DEFAULT_ACCOUNTS,
  transactions: [],
  budgets: [],
  cards: DEFAULT_CARDS,
  installments: [],
  savings: [],
  goals: [],
  cardBillings: [],
  mappingRules: [],
  lastModified: null,
  isSetupComplete: false,
}

const STORAGE_KEY = 'household_budget_v1'

// ── 컨텍스트 타입 ─────────────────────────────────────────────────────────────
interface AppContextType {
  data: AppData
  categories: Category[]
  user: User | null
  isLoading: boolean
  // Auth
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  // 계좌
  setAccounts: (accounts: Account[]) => void
  // 거래
  addTransaction: (tx: Transaction) => void
  updateTransaction: (id: string, tx: Transaction) => void
  deleteTransaction: (id: string) => void
  setTransactions: (txs: Transaction[]) => void
  // 예산
  setBudgets: (budgets: Budget[]) => void
  // 카드
  setCards: (cards: Card[]) => void
  // 할부
  setInstallments: (inst: Installment[]) => void
  // 적금
  setSavings: (savings: Saving[]) => void
  // 목표
  setGoals: (goals: Goal[]) => void
  // 카드 청구 (FR-009)
  setCardBillings: (billings: CardBilling[]) => void
  // 카테고리
  setCategories: (categories: Category[]) => void
  // 자동 분류 규칙 (FR-08)
  setMappingRules: (rules: MappingRule[]) => void
  // 초기 설정 완료
  completeSetup: (setupData: Partial<AppData>) => void
  // 전체 초기화
  resetAll: () => void
}

const AppContext = createContext<AppContextType | null>(null)

// ── AppProvider ───────────────────────────────────────────────────────────────
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(INITIAL_DATA)
  const [user, setUser] = useState<User | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userRef = useRef<User | null>(null)

  userRef.current = user

  // ── localStorage → Supabase 동기화 ─────────────────────────────────────────
  async function syncToSupabase(userId: string, nextData: AppData) {
    if (!supabase) return
    try {
      await supabase.from('user_data').upsert(
        { user_id: userId, data: nextData, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    } catch { /* ignore */ }
  }

  // ── 저장: localStorage 즉시 + Supabase debounce 500ms ───────────────────────
  function saveToStorage(next: AppData) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch { /* ignore */ }
    if (supabase && userRef.current) {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      syncTimerRef.current = setTimeout(() => {
        if (userRef.current) syncToSupabase(userRef.current.id, next)
      }, 500)
    }
  }

  // ── 데이터 병합: lastModified 기준으로 더 새로운 쪽 선택 ─────────────────────
  function mergeData(localData: AppData | null, remoteData: AppData | null): AppData {
    if (!localData && !remoteData) return INITIAL_DATA
    if (!localData) return remoteData!
    if (!remoteData) return localData

    const localTime = localData.lastModified ? new Date(localData.lastModified).getTime() : 0
    const remoteTime = remoteData.lastModified ? new Date(remoteData.lastModified).getTime() : 0
    return localTime >= remoteTime ? localData : remoteData
  }

  // ── 최초 초기화 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cleanupFn: (() => void) | undefined

    async function init() {
      // 1. localStorage 먼저 읽기
      let localData: AppData | null = null
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<AppData>
          const rawCats = (parsed.categories && parsed.categories.length > 0)
            ? parsed.categories
            : DEFAULT_CATEGORIES
          localData = {
            ...INITIAL_DATA,
            ...parsed,
            categories: migrateCategories(rawCats),
          }
        }
      } catch { /* ignore */ }

      // 2. Supabase auth 확인
      if (supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            setUser(session.user)
            userRef.current = session.user

            const { data: remoteRow } = await supabase
              .from('user_data')
              .select('data')
              .eq('user_id', session.user.id)
              .single()

            let remoteData: AppData | null = null
            if (remoteRow?.data) {
              remoteData = {
                ...INITIAL_DATA,
                ...remoteRow.data,
                categories: migrateCategories(
                  remoteRow.data.categories?.length > 0 ? remoteRow.data.categories : DEFAULT_CATEGORIES
                ),
              }
            }

            // ✅ 더 최신 데이터를 사용 (새로고침해도 로컬 데이터 보존)
            const winner = mergeData(localData, remoteData)
            setData(winner)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(winner))
            // Supabase에 없거나 로컬이 더 새로우면 Supabase에 즉시 동기화
            if (!remoteData || (localData && winner === localData)) {
              await syncToSupabase(session.user.id, winner)
            }
          } else {
            if (localData) setData(localData)
          }

          // auth 상태 변화 구독
          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            setUser(session?.user ?? null)
            userRef.current = session?.user ?? null

            if (event === 'SIGNED_OUT') {
              setData(INITIAL_DATA)
              localStorage.removeItem(STORAGE_KEY)
            }
            // TOKEN_REFRESHED는 데이터를 덮어쓰지 않음 (세션만 갱신)
            if (event === 'SIGNED_IN' && session?.user) {
              const { data: remoteRow } = await supabase!
                .from('user_data')
                .select('data')
                .eq('user_id', session.user.id)
                .single()

              let remoteData: AppData | null = null
              if (remoteRow?.data) {
                remoteData = {
                  ...INITIAL_DATA,
                  ...remoteRow.data,
                  categories: migrateCategories(
                    remoteRow.data.categories?.length > 0 ? remoteRow.data.categories : DEFAULT_CATEGORIES
                  ),
                }
              }

              // 현재 로컬 데이터와 비교해서 더 새로운 것 사용
              let currentLocal: AppData | null = null
              try {
                const stored = localStorage.getItem(STORAGE_KEY)
                if (stored) currentLocal = { ...INITIAL_DATA, ...JSON.parse(stored) }
              } catch { /* ignore */ }

              const winner = mergeData(currentLocal, remoteData)
              if (winner) {
                setData(winner)
                localStorage.setItem(STORAGE_KEY, JSON.stringify(winner))
                if (currentLocal && winner === currentLocal) {
                  await syncToSupabase(session.user.id, winner)
                }
              }
            }
          })

          cleanupFn = () => subscription.unsubscribe()
        } catch { /* ignore */ }
      } else {
        // Supabase 미설정: localStorage만 사용
        if (localData) setData(localData)
      }

      setHydrated(true)
      setIsLoading(false)
    }

    init().then(() => {
      setHydrated(true)
      setIsLoading(false)
    })

    // pagehide: 탭 닫거나 새로고침할 때 pending 타이머를 즉시 실행
    const handlePageHide = () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
        syncTimerRef.current = null
        try {
          const stored = localStorage.getItem(STORAGE_KEY)
          if (stored && userRef.current) {
            const data = JSON.parse(stored) as AppData
            syncToSupabase(userRef.current.id, data)
          }
        } catch { /* ignore */ }
      }
    }
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      cleanupFn?.()
    }
  }, [])

  // ── 상태 업데이트 헬퍼 ─────────────────────────────────────────────────────
  const update = useCallback((updater: (d: AppData) => AppData) => {
    setData(d => {
      const next = updater(d)
      saveToStorage(next)
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const now = () => new Date().toISOString()

  // ── Auth ────────────────────────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'Supabase가 설정되지 않았습니다. 환경변수를 확인하세요.'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }, [])

  const signUp = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!supabase) return 'Supabase가 설정되지 않았습니다. 환경변수를 확인하세요.'
    const { error } = await supabase.auth.signUp({ email, password })
    return error ? error.message : null
  }, [])

  const signOut = useCallback(async () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    if (supabase) await supabase.auth.signOut()
    setUser(null)
    userRef.current = null
    setData(INITIAL_DATA)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  // ── Data Actions ────────────────────────────────────────────────────────────
  const setAccounts = useCallback((accounts: Account[]) => {
    update(d => ({ ...d, accounts, lastModified: now() }))
  }, [update])

  const addTransaction = useCallback((tx: Transaction) => {
    update(d => ({ ...d, transactions: [...d.transactions, tx], lastModified: now() }))
  }, [update])

  const updateTransaction = useCallback((id: string, tx: Transaction) => {
    update(d => ({ ...d, transactions: d.transactions.map(t => t.id === id ? { ...tx, id } : t), lastModified: now() }))
  }, [update])

  const deleteTransaction = useCallback((id: string) => {
    update(d => ({ ...d, transactions: d.transactions.filter(t => t.id !== id), lastModified: now() }))
  }, [update])

  const setTransactions = useCallback((transactions: Transaction[]) => {
    update(d => ({ ...d, transactions, lastModified: now() }))
  }, [update])

  const setBudgets = useCallback((budgets: Budget[]) => {
    update(d => ({ ...d, budgets, lastModified: now() }))
  }, [update])

  const setCards = useCallback((cards: Card[]) => {
    update(d => ({ ...d, cards, lastModified: now() }))
  }, [update])

  const setInstallments = useCallback((installments: Installment[]) => {
    update(d => ({ ...d, installments, lastModified: now() }))
  }, [update])

  const setSavings = useCallback((savings: Saving[]) => {
    update(d => ({ ...d, savings, lastModified: now() }))
  }, [update])

  const setGoals = useCallback((goals: Goal[]) => {
    update(d => ({ ...d, goals, lastModified: now() }))
  }, [update])

  const setCardBillings = useCallback((cardBillings: CardBilling[]) => {
    update(d => ({ ...d, cardBillings, lastModified: now() }))
  }, [update])

  const setCategories = useCallback((categories: Category[]) => {
    update(d => ({ ...d, categories, lastModified: now() }))
  }, [update])

  const setMappingRules = useCallback((mappingRules: MappingRule[]) => {
    update(d => ({ ...d, mappingRules, lastModified: now() }))
  }, [update])

  const completeSetup = useCallback((setupData: Partial<AppData>) => {
    update(d => ({ ...d, ...setupData, isSetupComplete: true, lastModified: now() }))
  }, [update])

  const resetAll = useCallback(() => {
    const reset = { ...INITIAL_DATA }
    setData(reset)
    saveToStorage(reset)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!hydrated) return null

  return (
    <AppContext.Provider value={{
      data,
      categories: data.categories,
      user,
      isLoading,
      signIn,
      signUp,
      signOut,
      setAccounts,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      setTransactions,
      setBudgets,
      setCards,
      setInstallments,
      setSavings,
      setGoals,
      setCardBillings,
      setCategories,
      setMappingRules,
      completeSetup,
      resetAll,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

// 편의 함수
export function getMonthlyStats(transactions: Transaction[], month: string) {
  const txs = transactions.filter(t => t.date.startsWith(month))
  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  // 카드 환급은 예산에 반영 안 함 (통장 환급만 차감)
  const refund  = txs.filter(t => t.type === 'refund' && t.paymentMethod !== 'card').reduce((s, t) => s + t.amount, 0)
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const netExpense = Math.max(0, expense - refund)   // 환급 차감 후 실지출
  return { income, expense: netExpense, refund, balance: income - netExpense }
}

/**
 * 계좌의 실시간 잔액을 계산합니다.
 * 기초잔액 (account.balance) + 수입 - 통장결제 지출 + 이체 수신 - 이체 송신
 *
 * account.balance 는 사용자가 수동으로 설정한 기준일 잔액이며,
 * 기록된 모든 거래가 자동으로 반영됩니다.
 */
export function computeAccountBalance(
  accountId: string,
  baseBalance: number,
  transactions: Transaction[]
): number {
  return transactions.reduce((bal, tx) => {
    if (tx.type === 'income' && tx.accountId === accountId) {
      return bal + tx.amount
    }
    if (tx.type === 'refund' && tx.paymentMethod !== 'card' && tx.accountId === accountId) {
      return bal + tx.amount   // 통장 환급 = 통장 입금 (카드 환급은 잔액 미반영)
    }
    if (tx.type === 'expense' && tx.accountId === accountId && tx.paymentMethod === 'account') {
      return bal - tx.amount
    }
    if (tx.type === 'transfer') {
      if (tx.accountId === accountId)   return bal - tx.amount   // 보낸 계좌
      if (tx.toAccountId === accountId) return bal + tx.amount   // 받은 계좌
    }
    return bal
  }, baseBalance)
}

export function getCategoryExpenses(transactions: Transaction[], month: string) {
  const map: Record<string, number> = {}
  // 카드 환급은 카테고리 차감 안 함 (통장 환급만 차감)
  transactions.filter(t => t.date.startsWith(month) && (t.type === 'expense' || (t.type === 'refund' && t.paymentMethod !== 'card')))
    .forEach(t => {
      const delta = t.type === 'refund' ? -t.amount : t.amount
      map[t.categoryId] = (map[t.categoryId] || 0) + delta
    })
  // 음수 방지
  Object.keys(map).forEach(k => { if (map[k] < 0) map[k] = 0 })
  return map
}
