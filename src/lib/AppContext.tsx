'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { Account, Category, Transaction, Budget, Card, Installment, Saving, Goal, CardBilling, MappingRule, Investment, InvestmentTrade, InvestmentAccount, InvestmentDividend, SavingPayment, ConsumptionType, InvestmentAccountType, InvestmentTargetAllocation } from '@/types'
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

// F-03: 투자 계좌 유형 기본값
export const DEFAULT_INVESTMENT_ACCOUNT_TYPES: InvestmentAccountType[] = [
  { id: 'iat_general', name: '일반계좌',    isDefault: true },
  { id: 'iat_isa',     name: 'ISA',         isDefault: true },
  { id: 'iat_pension', name: '연금저축펀드', isDefault: true },
  { id: 'iat_irp',     name: 'IRP',         isDefault: true },
  { id: 'iat_retire',  name: '퇴직연금',     isDefault: true },
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
  cardBillings: CardBilling[]
  mappingRules: MappingRule[]
  investments: Investment[]            // PRD 2.6
  investmentTrades: InvestmentTrade[]  // PRD 2.6
  investmentAccounts: InvestmentAccount[]   // PRD 2.6 계좌
  investmentDividends: InvestmentDividend[] // PRD: 배당금
  investmentAccountTypes: InvestmentAccountType[]  // F-03
  investmentTargetAllocations: InvestmentTargetAllocation[]  // F-05
  savingPayments: SavingPayment[]  // PRD 2.2
  categoryHiddenMonths: Record<string, string[]>   // 월별 카테고리 숨김
  categoryExcludeMonths: Record<string, string[]>  // 월별 실소비 제외 토글
  dashboardWidgetOrder: string[]                   // PRD: 위젯 순서 커스터마이징
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
  investments: [],
  investmentTrades: [],
  investmentAccounts: [],
  investmentDividends: [],
  investmentAccountTypes: DEFAULT_INVESTMENT_ACCOUNT_TYPES,
  investmentTargetAllocations: [],
  savingPayments: [],
  categoryHiddenMonths: {},
  categoryExcludeMonths: {},
  dashboardWidgetOrder: ['card_payment', 'savings_summary', 'budget', 'goals', 'transactions'],
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
  // 카드 청구
  setCardBillings: (billings: CardBilling[]) => void
  // 카테고리
  setCategories: (categories: Category[]) => void
  // 자동 분류 규칙
  setMappingRules: (rules: MappingRule[]) => void
  // PRD 2.6: 투자
  setInvestments: (investments: Investment[]) => void
  setInvestmentTrades: (trades: InvestmentTrade[]) => void
  setInvestmentAccounts: (accounts: InvestmentAccount[]) => void
  setInvestmentDividends: (dividends: InvestmentDividend[]) => void
  setInvestmentAccountTypes: (types: InvestmentAccountType[]) => void
  setInvestmentTargetAllocations: (allocations: InvestmentTargetAllocation[]) => void
  // PRD 2.2: 납입 이력
  setSavingPayments: (payments: SavingPayment[]) => void
  // 월별 카테고리 숨김
  setCategoryHiddenMonths: (map: Record<string, string[]>) => void
  // 월별 실소비 제외 토글
  setCategoryExcludeMonths: (map: Record<string, string[]>) => void
  // 대시보드 위젯 순서
  setDashboardWidgetOrder: (order: string[]) => void
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

  // dividends 마이그레이션: investmentId만 있는 경우 accountId 추가
  function migrateDividends(divs: InvestmentDividend[], investments: Investment[]): InvestmentDividend[] {
    return divs.map(d => {
      if ((d as any).accountId) return d  // 이미 마이그레이션됨
      const inv = investments.find(i => i.id === d.investmentId)
      return { ...d, accountId: inv?.accountId ?? '__none__' }
    })
  }

  // F-03: 기존 InvestmentSubType → typeId 마이그레이션
  function migrateInvestmentAccounts(accs: InvestmentAccount[]): InvestmentAccount[] {
    const subTypeMap: Record<string, string> = {
      pension_savings:    'iat_pension',
      retirement_pension: 'iat_retire',
      general_investment: 'iat_general',
    }
    return accs.map(acc => {
      if (acc.typeId) return acc  // 이미 마이그레이션됨
      const legacyType = acc.type as string | undefined
      const typeId = (legacyType && subTypeMap[legacyType]) ? subTypeMap[legacyType] : 'iat_general'
      return { ...acc, typeId }
    })
  }

  function hydrateData(raw: Partial<AppData>): AppData {
    const rawCats = (raw.categories && raw.categories.length > 0) ? raw.categories : DEFAULT_CATEGORIES
    return {
      ...INITIAL_DATA,
      ...raw,
      categories: migrateCategories(rawCats),
      investments: raw.investments ?? [],
      investmentTrades: raw.investmentTrades ?? [],
      investmentAccounts: migrateInvestmentAccounts(raw.investmentAccounts ?? []),
      investmentDividends: migrateDividends(raw.investmentDividends ?? [], raw.investments ?? []),
      investmentAccountTypes: raw.investmentAccountTypes ?? DEFAULT_INVESTMENT_ACCOUNT_TYPES,
      investmentTargetAllocations: raw.investmentTargetAllocations ?? [],
      savingPayments: raw.savingPayments ?? [],
      categoryHiddenMonths: raw.categoryHiddenMonths ?? {},
      categoryExcludeMonths: raw.categoryExcludeMonths ?? {},
      dashboardWidgetOrder: raw.dashboardWidgetOrder ?? ['card_payment', 'savings_summary', 'budget', 'goals', 'transactions'],
    }
  }

  // ── 최초 초기화 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cleanupFn: (() => void) | undefined

    async function init() {
      let localData: AppData | null = null
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) localData = hydrateData(JSON.parse(stored) as Partial<AppData>)
      } catch { /* ignore */ }

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
            if (remoteRow?.data) remoteData = hydrateData(remoteRow.data as Partial<AppData>)

            const winner = mergeData(localData, remoteData)
            setData(winner)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(winner))
            if (!remoteData || (localData && winner === localData)) {
              await syncToSupabase(session.user.id, winner)
            }
          } else {
            if (localData) setData(localData)
          }

          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            setUser(session?.user ?? null)
            userRef.current = session?.user ?? null

            if (event === 'SIGNED_OUT') {
              // localStorage는 보존 — 재로그인 시 데이터 복구 가능하도록
              setData(INITIAL_DATA)
            }
            if (event === 'SIGNED_IN' && session?.user) {
              const { data: remoteRow } = await supabase!
                .from('user_data')
                .select('data')
                .eq('user_id', session.user.id)
                .single()

              let remoteData: AppData | null = null
              if (remoteRow?.data) remoteData = hydrateData(remoteRow.data as Partial<AppData>)

              let currentLocal: AppData | null = null
              try {
                const stored = localStorage.getItem(STORAGE_KEY)
                if (stored) currentLocal = hydrateData(JSON.parse(stored) as Partial<AppData>)
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
        if (localData) setData(localData)
      }

      setHydrated(true)
      setIsLoading(false)
    }

    init().then(() => {
      setHydrated(true)
      setIsLoading(false)
    })

    const handlePageHide = () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
        syncTimerRef.current = null
        try {
          const stored = localStorage.getItem(STORAGE_KEY)
          if (stored && userRef.current) {
            const d = JSON.parse(stored) as AppData
            syncToSupabase(userRef.current.id, d)
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

  const setInvestments = useCallback((investments: Investment[]) => {
    update(d => ({ ...d, investments, lastModified: now() }))
  }, [update])

  const setInvestmentTrades = useCallback((investmentTrades: InvestmentTrade[]) => {
    update(d => ({ ...d, investmentTrades, lastModified: now() }))
  }, [update])

  const setInvestmentAccounts = useCallback((investmentAccounts: InvestmentAccount[]) => {
    update(d => ({ ...d, investmentAccounts, lastModified: now() }))
  }, [update])

  const setInvestmentDividends = useCallback((investmentDividends: InvestmentDividend[]) => {
    update(d => ({ ...d, investmentDividends, lastModified: now() }))
  }, [update])

  const setInvestmentAccountTypes = useCallback((investmentAccountTypes: InvestmentAccountType[]) => {
    update(d => ({ ...d, investmentAccountTypes, lastModified: now() }))
  }, [update])

  const setInvestmentTargetAllocations = useCallback((investmentTargetAllocations: InvestmentTargetAllocation[]) => {
    update(d => ({ ...d, investmentTargetAllocations, lastModified: now() }))
  }, [update])

  const setSavingPayments = useCallback((savingPayments: SavingPayment[]) => {
    update(d => ({ ...d, savingPayments, lastModified: now() }))
  }, [update])

  const setCategoryHiddenMonths = useCallback((categoryHiddenMonths: Record<string, string[]>) => {
    update(d => ({ ...d, categoryHiddenMonths, lastModified: now() }))
  }, [update])

  const setCategoryExcludeMonths = useCallback((categoryExcludeMonths: Record<string, string[]>) => {
    update(d => ({ ...d, categoryExcludeMonths, lastModified: now() }))
  }, [update])

  const setDashboardWidgetOrder = useCallback((dashboardWidgetOrder: string[]) => {
    update(d => ({ ...d, dashboardWidgetOrder, lastModified: now() }))
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
      setInvestments,
      setInvestmentTrades,
      setInvestmentAccounts,
      setInvestmentDividends,
      setInvestmentAccountTypes,
      setInvestmentTargetAllocations,
      setSavingPayments,
      setCategoryHiddenMonths,
      setCategoryExcludeMonths,
      setDashboardWidgetOrder,
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

// ── PRD 2.1: 실소비 필터링 헬퍼 ────────────────────────────────────────────────
export function getConsumptionType(tx: Transaction, categories: Category[]): 'normal' | 'savings_transfer' | 'card_payment' {
  // 명시적으로 지정된 경우 우선
  if (tx.consumptionType) return tx.consumptionType
  const cat = categories.find(c => c.id === tx.categoryId)
  if (!cat) return 'normal'
  if (cat.role === 'card_payment') return 'card_payment'
  if (cat.role === 'savings') return 'savings_transfer'
  const parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
  if (parent?.role === 'savings') return 'savings_transfer'
  if (cat.savingId) return 'savings_transfer'
  return 'normal'
}

export function isRealConsumption(
  tx: Transaction,
  categories: Category[],
  categoryExcludeMonths?: Record<string, string[]>,
  month?: string
): boolean {
  if (tx.type !== 'expense') return false
  if (getConsumptionType(tx, categories) !== 'normal') return false
  // 월별 실소비 제외 체크
  if (categoryExcludeMonths && month) {
    const cat = categories.find(c => c.id === tx.categoryId)
    if (!cat) return true
    const catExcluded = (categoryExcludeMonths[cat.id] ?? []).includes(month)
    if (catExcluded) return false
    const parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
    if (parent) {
      const parentExcluded = (categoryExcludeMonths[parent.id] ?? []).includes(month)
      if (parentExcluded) return false
    }
  }
  return true
}

// 편의 함수
export function getMonthlyStats(transactions: Transaction[], month: string) {
  const txs = transactions.filter(t => t.date.startsWith(month))
  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const refund  = txs.filter(t => t.type === 'refund' && t.paymentMethod !== 'card').reduce((s, t) => s + t.amount, 0)
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const netExpense = Math.max(0, expense - refund)
  return { income, expense: netExpense, refund, balance: income - netExpense }
}

export function computeAccountBalance(
  accountId: string,
  baseBalance: number,
  transactions: Transaction[]
): number {
  return transactions.reduce((bal, tx) => {
    if (tx.type === 'income' && tx.accountId === accountId) return bal + tx.amount
    if (tx.type === 'refund' && tx.paymentMethod !== 'card' && tx.accountId === accountId) return bal + tx.amount
    if (tx.type === 'expense' && tx.accountId === accountId && tx.paymentMethod === 'account') return bal - tx.amount
    if (tx.type === 'transfer') {
      if (tx.accountId === accountId)   return bal - tx.amount
      if (tx.toAccountId === accountId) return bal + tx.amount
    }
    return bal
  }, baseBalance)
}

export function getCategoryExpenses(transactions: Transaction[], month: string) {
  const map: Record<string, number> = {}
  transactions.filter(t => t.date.startsWith(month) && (t.type === 'expense' || (t.type === 'refund' && t.paymentMethod !== 'card')))
    .forEach(t => {
      const delta = t.type === 'refund' ? -t.amount : t.amount
      map[t.categoryId] = (map[t.categoryId] || 0) + delta
    })
  Object.keys(map).forEach(k => { if (map[k] < 0) map[k] = 0 })
  return map
}

// PRD 2.1: 실소비만 집계하는 카테고리 지출 (카드대금·적금이체 제외, 통장환급 차감)
export function getRealCategoryExpenses(
  transactions: Transaction[],
  categories: Category[],
  month: string,
  categoryExcludeMonths?: Record<string, string[]>
) {
  const map: Record<string, number> = {}
  transactions
    .filter(t => {
      if (!t.date.startsWith(month)) return false
      const ct = getConsumptionType(t, categories)
      if (ct === 'savings_transfer') return false  // 저축이체만 자동 제외, card_payment는 수동 제외
      // 월별 실소비 제외 체크
      if (categoryExcludeMonths) {
        const cat = categories.find(c => c.id === t.categoryId)
        if (cat) {
          const catExcluded = (categoryExcludeMonths[cat.id] ?? []).includes(month)
          if (catExcluded) return false
          const parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
          if (parent) {
            const parentExcluded = (categoryExcludeMonths[parent.id] ?? []).includes(month)
            if (parentExcluded) return false
          }
        }
      }
      if (t.type === 'expense') return true
      // 카드 환급은 카드 청구 쪽에서 처리되므로 제외, 통장 환급만 차감
      if (t.type === 'refund' && t.paymentMethod !== 'card') return true
      return false
    })
    .forEach(t => {
      const delta = t.type === 'refund' ? -t.amount : t.amount
      map[t.categoryId] = (map[t.categoryId] || 0) + delta
    })
  Object.keys(map).forEach(k => { if (map[k] < 0) map[k] = 0 })
  return map
}
