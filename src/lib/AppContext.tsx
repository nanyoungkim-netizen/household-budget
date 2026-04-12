'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { Account, Category, Transaction, Budget, Card, Installment, Saving, Goal } from '@/types'

// ── 기본 카테고리 (변경 불필요) ───────────────────────────────────────────────
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'salary',       name: '급여',     type: 'income',  icon: '💰', color: '#00B493' },
  { id: 'interest',     name: '이자',     type: 'income',  icon: '🏦', color: '#00B493' },
  { id: 'saving_return',name: '적금 만기',type: 'income',  icon: '🎉', color: '#00B493' },
  { id: 'other_income', name: '기타수입', type: 'income',  icon: '💵', color: '#00B493' },
  { id: 'living',       name: '생활비',   type: 'expense', icon: '🏠', color: '#FF6B6B' },
  { id: 'food',         name: '식비',     type: 'expense', icon: '🍽️', color: '#FF8E53' },
  { id: 'transport',    name: '교통비',   type: 'expense', icon: '🚌', color: '#4ECDC4' },
  { id: 'communication',name: '통신비',   type: 'expense', icon: '📱', color: '#45B7D1' },
  { id: 'insurance',    name: '보험료',   type: 'expense', icon: '🛡️', color: '#96CEB4' },
  { id: 'subscription', name: '구독료',   type: 'expense', icon: '📺', color: '#DDA0DD' },
  { id: 'shopping',     name: '쇼핑·미용',type: 'expense', icon: '🛍️', color: '#F7DC6F' },
  { id: 'selfdev',      name: '자기계발', type: 'expense', icon: '📚', color: '#82E0AA' },
  { id: 'gift',         name: '선물·경조',type: 'expense', icon: '🎁', color: '#F1948A' },
  { id: 'travel',       name: '여행',     type: 'expense', icon: '✈️', color: '#85C1E9' },
  { id: 'drink',        name: '술·음료',  type: 'expense', icon: '🍺', color: '#F0B27A' },
  { id: 'daily',        name: '생필품',   type: 'expense', icon: '🧴', color: '#A9CCE3' },
  { id: 'loan',         name: '대출이자', type: 'expense', icon: '🏦', color: '#EC7063' },
  { id: 'saving',       name: '적금',     type: 'expense', icon: '💰', color: '#A8D8EA' },
  { id: 'card',         name: '카드대금', type: 'expense', icon: '💳', color: '#B0BEC5' },
  { id: 'etc',          name: '기타',     type: 'expense', icon: '📦', color: '#CFD8DC' },
]

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'toss',    name: '토스뱅크', bank: '토스뱅크', balance: 0, color: '#0064FF' },
  { id: 'kb',      name: '국민은행', bank: '국민은행', balance: 0, color: '#FFB800' },
  { id: 'gwangju', name: '광주은행', bank: '광주은행', balance: 0, color: '#00B493' },
]

export const DEFAULT_CARDS: Card[] = [
  { id: 'card1', name: '신한카드', bank: '신한은행', billingDate: 15, color: '#0065CC' },
  { id: 'card2', name: '롯데카드', bank: '롯데은행', billingDate: 25, color: '#E60000' },
  { id: 'card3', name: '현대카드', bank: '현대카드', billingDate: 10, color: '#1A1A1A' },
  { id: 'card4', name: '삼성카드', bank: '삼성카드', billingDate: 20, color: '#1259AA' },
]

// ── 앱 데이터 타입 ────────────────────────────────────────────────────────────
interface AppData {
  accounts: Account[]
  transactions: Transaction[]
  budgets: Budget[]
  cards: Card[]
  installments: Installment[]
  savings: Saving[]
  goals: Goal[]
  lastModified: string | null
  isSetupComplete: boolean
}

const INITIAL_DATA: AppData = {
  accounts: DEFAULT_ACCOUNTS,
  transactions: [],
  budgets: [],
  cards: DEFAULT_CARDS,
  installments: [],
  savings: [],
  goals: [],
  lastModified: null,
  isSetupComplete: false,
}

const STORAGE_KEY = 'household_budget_v1'

// ── 컨텍스트 타입 ─────────────────────────────────────────────────────────────
interface AppContextType {
  data: AppData
  categories: Category[]
  // 계좌
  setAccounts: (accounts: Account[]) => void
  // 거래
  addTransaction: (tx: Transaction) => void
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
  // 초기 설정 완료
  completeSetup: (setupData: Partial<AppData>) => void
  // 전체 초기화
  resetAll: () => void
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(INITIAL_DATA)
  const [hydrated, setHydrated] = useState(false)

  // localStorage에서 불러오기
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as AppData
        setData(parsed)
      }
    } catch {
      // ignore
    }
    setHydrated(true)
  }, [])

  // 변경 시 localStorage에 저장
  const save = useCallback((next: AppData) => {
    setData(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }, [])

  const now = () => new Date().toISOString()

  const setAccounts = useCallback((accounts: Account[]) => {
    setData(d => { const n = { ...d, accounts, lastModified: now() }; save(n); return n })
  }, [save])

  const addTransaction = useCallback((tx: Transaction) => {
    setData(d => {
      const n = { ...d, transactions: [...d.transactions, tx], lastModified: now() }
      save(n); return n
    })
  }, [save])

  const deleteTransaction = useCallback((id: string) => {
    setData(d => {
      const n = { ...d, transactions: d.transactions.filter(t => t.id !== id), lastModified: now() }
      save(n); return n
    })
  }, [save])

  const setTransactions = useCallback((transactions: Transaction[]) => {
    setData(d => { const n = { ...d, transactions, lastModified: now() }; save(n); return n })
  }, [save])

  const setBudgets = useCallback((budgets: Budget[]) => {
    setData(d => { const n = { ...d, budgets, lastModified: now() }; save(n); return n })
  }, [save])

  const setCards = useCallback((cards: Card[]) => {
    setData(d => { const n = { ...d, cards, lastModified: now() }; save(n); return n })
  }, [save])

  const setInstallments = useCallback((installments: Installment[]) => {
    setData(d => { const n = { ...d, installments, lastModified: now() }; save(n); return n })
  }, [save])

  const setSavings = useCallback((savings: Saving[]) => {
    setData(d => { const n = { ...d, savings, lastModified: now() }; save(n); return n })
  }, [save])

  const setGoals = useCallback((goals: Goal[]) => {
    setData(d => { const n = { ...d, goals, lastModified: now() }; save(n); return n })
  }, [save])

  const completeSetup = useCallback((setupData: Partial<AppData>) => {
    setData(d => {
      const n = { ...d, ...setupData, isSetupComplete: true, lastModified: now() }
      save(n); return n
    })
  }, [save])

  const resetAll = useCallback(() => {
    save(INITIAL_DATA)
  }, [save])

  if (!hydrated) return null

  return (
    <AppContext.Provider value={{
      data,
      categories: DEFAULT_CATEGORIES,
      setAccounts,
      addTransaction,
      deleteTransaction,
      setTransactions,
      setBudgets,
      setCards,
      setInstallments,
      setSavings,
      setGoals,
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
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  return { income, expense, balance: income - expense }
}

export function getCategoryExpenses(transactions: Transaction[], month: string) {
  const map: Record<string, number> = {}
  transactions.filter(t => t.date.startsWith(month) && t.type === 'expense')
    .forEach(t => { map[t.categoryId] = (map[t.categoryId] || 0) + t.amount })
  return map
}
