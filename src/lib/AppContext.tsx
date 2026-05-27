'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { Account, Category, Transaction, Budget, Card, Installment, Saving, Goal, GoalPayment, CardBilling, MappingRule, Investment, InvestmentTrade, InvestmentAccount, InvestmentDividend, InvestmentCashDeposit, SavingPayment, ConsumptionType, InvestmentAccountType, InvestmentTargetAllocation, PortfolioPlan, WatchlistItem } from '@/types'
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
    if (cat.role !== undefined) return cat
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
  goalPayments: GoalPayment[]
  cardBillings: CardBilling[]
  mappingRules: MappingRule[]
  investments: Investment[]
  investmentTrades: InvestmentTrade[]
  investmentAccounts: InvestmentAccount[]
  investmentDividends: InvestmentDividend[]
  investmentCashDeposits: InvestmentCashDeposit[]
  investmentAccountTypes: InvestmentAccountType[]
  investmentTargetAllocations: InvestmentTargetAllocation[]
  portfolioPlans: PortfolioPlan[]
  savingPayments: SavingPayment[]
  categoryHiddenMonths: Record<string, string[]>
  categoryExcludeMonths: Record<string, string[]>
  dashboardWidgetOrder: string[]
  budgetCarriedMonths: string[]
  dashboardMemo: string
  dismissedNotificationIds: string[]
  investmentExchangeRates: Record<string, number>
  watchlist: WatchlistItem[]
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
  goalPayments: [],
  cardBillings: [],
  mappingRules: [],
  investments: [],
  investmentTrades: [],
  investmentAccounts: [],
  investmentDividends: [],
  investmentCashDeposits: [],
  investmentAccountTypes: DEFAULT_INVESTMENT_ACCOUNT_TYPES,
  investmentTargetAllocations: [],
  portfolioPlans: [],
  savingPayments: [],
  categoryHiddenMonths: {},
  categoryExcludeMonths: {},
  dashboardWidgetOrder: ['cash_accounts', 'investment_accounts', 'card_payment', 'savings_summary', 'budget', 'goals', 'transactions'],
  budgetCarriedMonths: [],
  dashboardMemo: '',
  dismissedNotificationIds: [],
  investmentExchangeRates: {},
  watchlist: [],
  lastModified: null,
  isSetupComplete: false,
}

// ── 멀티 가계부 타입 ──────────────────────────────────────────────────────────
export interface BudgetMeta {
  id: string
  name: string
  createdAt: string
}

export interface MultiData {
  budgetList: BudgetMeta[]
  budgets: Record<string, AppData>
  activeBudgetId: string
}

const DEFAULT_BUDGET_ID = 'budget_default'

function makeDefaultMeta(): BudgetMeta {
  return { id: DEFAULT_BUDGET_ID, name: '내 가계부', createdAt: new Date().toISOString() }
}

const INITIAL_MULTI_DATA: MultiData = {
  budgetList: [makeDefaultMeta()],
  budgets: { [DEFAULT_BUDGET_ID]: INITIAL_DATA },
  activeBudgetId: DEFAULT_BUDGET_ID,
}

const STORAGE_KEY_V1 = 'household_budget_v1'
const STORAGE_KEY    = 'household_budget_v2'

// ── 컨텍스트 타입 ─────────────────────────────────────────────────────────────
interface AppContextType {
  data: AppData
  multiData: MultiData          // 전체 가계부 데이터 (백업용)
  categories: Category[]
  user: User | null
  isLoading: boolean
  // 멀티 가계부
  budgetList: BudgetMeta[]
  activeBudgetId: string
  createBudget: (name: string) => void
  switchBudget: (id: string) => void
  deleteBudget: (id: string) => void
  renameBudget: (id: string, name: string) => void
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
  setGoalPayments: (payments: GoalPayment[]) => void
  // 카드 청구
  setCardBillings: (billings: CardBilling[]) => void
  // 카테고리
  setCategories: (categories: Category[]) => void
  // 자동 분류 규칙
  setMappingRules: (rules: MappingRule[]) => void
  // 투자
  setInvestments: (investments: Investment[]) => void
  setInvestmentTrades: (trades: InvestmentTrade[]) => void
  setInvestmentAccounts: (accounts: InvestmentAccount[]) => void
  setInvestmentDividends: (dividends: InvestmentDividend[]) => void
  setInvestmentCashDeposits: (deposits: InvestmentCashDeposit[]) => void
  setInvestmentAccountTypes: (types: InvestmentAccountType[]) => void
  setInvestmentTargetAllocations: (allocations: InvestmentTargetAllocation[]) => void
  setPortfolioPlans: (plans: PortfolioPlan[]) => void
  // 납입 이력
  setSavingPayments: (payments: SavingPayment[]) => void
  // 월별 카테고리 숨김
  setCategoryHiddenMonths: (map: Record<string, string[]>) => void
  // 월별 실소비 제외 토글
  setCategoryExcludeMonths: (map: Record<string, string[]>) => void
  // 대시보드 위젯 순서
  setDashboardWidgetOrder: (order: string[]) => void
  // 예산 이월 완료 월 목록
  setBudgetCarriedMonths: (months: string[]) => void
  // 대시보드 메모
  setDashboardMemo: (memo: string) => void
  // 계정별 알림 dismiss
  setDismissedNotificationIds: (ids: string[]) => void
  // 투자 환율 캐시
  setInvestmentExchangeRates: (rates: Record<string, number>) => void
  setWatchlist: (items: WatchlistItem[]) => void
  // 수동 저장
  forceSyncNow: () => Promise<void>
  lastSyncedAt: string | null
  isSyncingNow: boolean
  // 초기 설정 완료
  completeSetup: (setupData: Partial<AppData>) => void
  // 전체 초기화
  resetAll: () => void
  // 백업에서 현재 가계부만 복원
  restoreBudgetData: (raw: Partial<AppData>) => void
  // 백업에서 전체 가계부 복원 (모든 가계부 포함)
  restoreAllData: (raw: MultiData) => void
}

const AppContext = createContext<AppContextType | null>(null)

// ── 헬퍼: 구 AppData 포맷인지 판별 ──────────────────────────────────────────
function isMultiData(obj: unknown): obj is MultiData {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    Array.isArray((obj as MultiData).budgetList) &&
    typeof (obj as MultiData).budgets === 'object' &&
    typeof (obj as MultiData).activeBudgetId === 'string'
  )
}

// ── AppProvider ───────────────────────────────────────────────────────────────
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [multiData, setMultiData] = useState<MultiData>(INITIAL_MULTI_DATA)
  const [user, setUser] = useState<User | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userRef = useRef<User | null>(null)
  const multiDataRef = useRef<MultiData>(INITIAL_MULTI_DATA)
  const sessionTokenRef = useRef<string | null>(null)   // keepalive sync 용 JWT 캐시
  const isExplicitSignOutRef = useRef(false)            // 의도적 로그아웃 여부

  userRef.current = user
  multiDataRef.current = multiData

  // 현재 활성 가계부 데이터
  const data: AppData = multiData.budgets[multiData.activeBudgetId] ?? INITIAL_DATA

  // ── Supabase 동기화 ─────────────────────────────────────────────────────────
  // dirty flag: 저장됐지만 Supabase 미동기화 상태를 표시 — 다음 init 시 로컬 우선 보장
  const NEEDS_SYNC_KEY = 'hb_needs_sync'
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [isSyncingNow, setIsSyncingNow] = useState(false)

  async function syncToSupabase(userId: string, next: MultiData) {
    if (!supabase) return
    try {
      await Promise.race([
        supabase.from('user_data').upsert(
          { user_id: userId, data: next, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('supabase_timeout')), 15000)
        ),
      ])
      localStorage.removeItem(NEEDS_SYNC_KEY)  // 성공 시 dirty flag 해제
      setLastSyncedAt(new Date().toISOString())
    } catch { /* ignore — dirty flag 유지돼서 다음 로드 시 재시도됨 */ }
  }

  // 수동 즉시 저장 — 버튼 클릭 시 호출
  const forceSyncNow = useCallback(async () => {
    if (!supabase || !userRef.current) return
    setIsSyncingNow(true)
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return
      const current = JSON.parse(stored) as MultiData
      // 10초 타임아웃: Supabase가 응답 없이 멈춰도 "저장 중" 무한 대기 방지
      await Promise.race([
        syncToSupabase(userRef.current.id, current),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('sync_timeout')), 10000)
        ),
      ])
    } catch { /* ignore — 실패해도 dirty flag가 다음 로그인 시 재시도 보장 */ } finally {
      setIsSyncingNow(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 페이지 이탈 직전 keepalive fetch로 Supabase REST API에 직접 기록
  // → 브라우저가 비동기 완료를 보장 (일반 async 호출로는 보장 안 됨)
  function syncBeforeUnload(userId: string, next: MultiData) {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const token = sessionTokenRef.current
    if (!url || !key || !token) return
    try {
      fetch(`${url}/rest/v1/user_data`, {
        method: 'POST',
        keepalive: true,   // 페이지 언로드 후에도 브라우저가 요청 완료 보장
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal',
          'apikey': key,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userId, data: next, updated_at: new Date().toISOString() }),
      })
    } catch { /* ignore */ }
  }

  function saveToStorage(next: MultiData) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      if (supabase && userRef.current) {
        localStorage.setItem(NEEDS_SYNC_KEY, '1')  // dirty flag 설정
      }
    } catch { /* ignore */ }
    if (supabase && userRef.current) {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      // 500ms → 200ms: 빠른 연속 입력은 묶고, 이탈 전 누락 가능성을 줄임
      syncTimerRef.current = setTimeout(() => {
        if (userRef.current) syncToSupabase(userRef.current.id, next)
      }, 200)
    }
  }

  // ── 구 AppData → MultiData 래핑 ─────────────────────────────────────────────
  function wrapLegacy(raw: Partial<AppData>): MultiData {
    return {
      budgetList: [makeDefaultMeta()],
      budgets: { [DEFAULT_BUDGET_ID]: hydrateData(raw) },
      activeBudgetId: DEFAULT_BUDGET_ID,
    }
  }

  // ── MultiData 병합 (로컬 vs 리모트) ─────────────────────────────────────────
  function mergeMultiData(local: MultiData | null, remote: MultiData | null): MultiData {
    if (!local && !remote) return INITIAL_MULTI_DATA
    if (!local) return remote!
    if (!remote) return local

    // 각 가계부별로 lastModified가 더 최신인 쪽 선택
    const allIds = new Set([...Object.keys(local.budgets), ...Object.keys(remote.budgets)])
    const mergedBudgets: Record<string, AppData> = {}
    for (const id of allIds) {
      const l = local.budgets[id]
      const r = remote.budgets[id]
      if (!l) { mergedBudgets[id] = r; continue }
      if (!r) { mergedBudgets[id] = l; continue }
      const lt = l.lastModified ? new Date(l.lastModified).getTime() : 0
      const rt = r.lastModified ? new Date(r.lastModified).getTime() : 0
      mergedBudgets[id] = lt >= rt ? l : r
    }

    // 가계부 목록은 합집합 (현존하는 id만)
    const metaMap = new Map<string, BudgetMeta>()
    ;[...local.budgetList, ...remote.budgetList].forEach(m => metaMap.set(m.id, m))
    const budgetList = Array.from(metaMap.values()).filter(m => mergedBudgets[m.id])

    // activeBudgetId는 로컬 우선, 없으면 첫 번째
    const activeId = mergedBudgets[local.activeBudgetId]
      ? local.activeBudgetId
      : budgetList[0]?.id ?? DEFAULT_BUDGET_ID

    return { budgetList, budgets: mergedBudgets, activeBudgetId: activeId }
  }

  // ── dividends 마이그레이션 ──────────────────────────────────────────────────
  function migrateDividends(divs: InvestmentDividend[], investments: Investment[]): InvestmentDividend[] {
    return divs.map(d => {
      if ((d as any).accountId) return d
      const inv = investments.find(i => i.id === d.investmentId)
      return { ...d, accountId: inv?.accountId ?? '__none__' }
    })
  }

  function migrateInvestmentAccounts(accs: InvestmentAccount[]): InvestmentAccount[] {
    const subTypeMap: Record<string, string> = {
      pension_savings:    'iat_pension',
      retirement_pension: 'iat_retire',
      general_investment: 'iat_general',
    }
    return accs.map(acc => {
      if (acc.typeId) return acc
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
      investmentCashDeposits: raw.investmentCashDeposits ?? [],
      investmentAccountTypes: raw.investmentAccountTypes ?? DEFAULT_INVESTMENT_ACCOUNT_TYPES,
      investmentTargetAllocations: raw.investmentTargetAllocations ?? [],
      portfolioPlans: raw.portfolioPlans ?? [],
      savingPayments: raw.savingPayments ?? [],
      categoryHiddenMonths: raw.categoryHiddenMonths ?? {},
      categoryExcludeMonths: raw.categoryExcludeMonths ?? {},
      budgetCarriedMonths: raw.budgetCarriedMonths ?? [],
      dashboardMemo: raw.dashboardMemo ?? '',
      dismissedNotificationIds: raw.dismissedNotificationIds ?? [],
      investmentExchangeRates: raw.investmentExchangeRates ?? {},
      dashboardWidgetOrder: (() => {
        const stored = raw.dashboardWidgetOrder ?? null
        const assetWidgets = ['cash_accounts', 'investment_accounts']
        const legacyWidgets = ['card_payment', 'savings_summary', 'budget', 'goals', 'transactions']
        if (!stored) return [...assetWidgets, ...legacyWidgets]
        const hasAssetWidgets = stored.some(id => assetWidgets.includes(id))
        if (!hasAssetWidgets) return [...assetWidgets, ...stored]
        return stored
      })(),
    }
  }

  function hydrateMultiData(raw: unknown): MultiData {
    if (isMultiData(raw)) {
      const budgets: Record<string, AppData> = {}
      for (const [id, d] of Object.entries(raw.budgets)) {
        budgets[id] = hydrateData(d as Partial<AppData>)
      }
      const budgetList = (raw.budgetList ?? []).filter((m: BudgetMeta) => budgets[m.id])
      const activeBudgetId = budgets[raw.activeBudgetId]
        ? raw.activeBudgetId
        : budgetList[0]?.id ?? DEFAULT_BUDGET_ID
      return { budgetList, budgets, activeBudgetId }
    }
    // 구 형식 (AppData) → 자동 마이그레이션
    return wrapLegacy(raw as Partial<AppData>)
  }

  // ── 최초 초기화 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cleanupFn: (() => void) | undefined

    async function init() {
      // 1) 로컬에서 v2 로드, 없으면 v1 마이그레이션
      let localMulti: MultiData | null = null
      try {
        const v2 = localStorage.getItem(STORAGE_KEY)
        if (v2) {
          localMulti = hydrateMultiData(JSON.parse(v2))
        } else {
          const v1 = localStorage.getItem(STORAGE_KEY_V1)
          if (v1) {
            localMulti = wrapLegacy(JSON.parse(v1) as Partial<AppData>)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(localMulti))
          }
        }
      } catch { /* ignore */ }

      if (supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            setUser(session.user)
            userRef.current = session.user
            sessionTokenRef.current = session.access_token  // JWT 캐시

            // dirty flag: 이전 세션에서 미동기 데이터가 있으면 로컬을 Supabase에 먼저 push
            const hasPendingSync = localStorage.getItem(NEEDS_SYNC_KEY) === '1'
            if (hasPendingSync && localMulti) {
              await syncToSupabase(session.user.id, localMulti)
            }

            const { data: remoteRow } = await supabase
              .from('user_data')
              .select('data')
              .eq('user_id', session.user.id)
              .single()

            let remoteMulti: MultiData | null = null
            if (remoteRow?.data) remoteMulti = hydrateMultiData(remoteRow.data)

            const winner = mergeMultiData(localMulti, remoteMulti)
            setMultiData(winner)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(winner))
            await syncToSupabase(session.user.id, winner)
          } else {
            if (localMulti) setMultiData(localMulti)
          }

          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            setUser(session?.user ?? null)
            userRef.current = session?.user ?? null
            if (session?.access_token) sessionTokenRef.current = session.access_token

            if (event === 'SIGNED_OUT') {
              // 명시적 로그아웃(signOut 호출)일 때만 데이터 초기화
              // 토큰 만료 등 비의도적 SIGNED_OUT에서는 데이터를 지우지 않음
              if (isExplicitSignOutRef.current) {
                isExplicitSignOutRef.current = false
                setMultiData(INITIAL_MULTI_DATA)
              }
            }
            if (event === 'SIGNED_IN' && session?.user) {
              sessionTokenRef.current = session.access_token

              // dirty flag 있으면 현재 로컬을 먼저 push해서 원격에 반영
              let currentLocal: MultiData | null = null
              try {
                const stored = localStorage.getItem(STORAGE_KEY)
                if (stored) currentLocal = hydrateMultiData(JSON.parse(stored))
              } catch { /* ignore */ }

              const hasPending = localStorage.getItem(NEEDS_SYNC_KEY) === '1'
              if (hasPending && currentLocal) {
                await syncToSupabase(session.user.id, currentLocal)
              }

              const { data: remoteRow } = await supabase!
                .from('user_data')
                .select('data')
                .eq('user_id', session.user.id)
                .single()

              let remoteMulti: MultiData | null = null
              if (remoteRow?.data) remoteMulti = hydrateMultiData(remoteRow.data)

              const winner = mergeMultiData(currentLocal, remoteMulti)
              if (winner) {
                setMultiData(winner)
                localStorage.setItem(STORAGE_KEY, JSON.stringify(winner))
                await syncToSupabase(session.user.id, winner)
              }
            }
          })

          cleanupFn = () => subscription.unsubscribe()
        } catch { /* ignore */ }
      } else {
        if (localMulti) setMultiData(localMulti)
      }

      setHydrated(true)
      setIsLoading(false)
    }

    init().then(() => {
      setHydrated(true)
      setIsLoading(false)
    })

    const handlePageHide = () => {
      // 1) 대기 중인 디바운스 취소
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
        syncTimerRef.current = null
      }
      // 2) keepalive fetch로 브라우저가 보장하는 최종 동기화
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored && userRef.current) {
          const d = JSON.parse(stored) as MultiData
          syncBeforeUnload(userRef.current.id, d)  // keepalive: true
        }
      } catch { /* ignore */ }
    }
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      cleanupFn?.()
    }
  }, [])

  // ── 상태 업데이트 헬퍼 ─────────────────────────────────────────────────────
  const update = useCallback((updater: (d: AppData) => AppData) => {
    setMultiData(prev => {
      const activeId = prev.activeBudgetId
      const current = prev.budgets[activeId] ?? INITIAL_DATA
      const next = updater(current)
      const newMulti: MultiData = {
        ...prev,
        budgets: { ...prev.budgets, [activeId]: next },
      }
      saveToStorage(newMulti)
      return newMulti
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const now = () => new Date().toISOString()

  // ── 멀티 가계부 관리 ────────────────────────────────────────────────────────
  const createBudget = useCallback((name: string) => {
    const id = `budget_${Date.now()}`
    const meta: BudgetMeta = { id, name: name.trim() || '새 가계부', createdAt: new Date().toISOString() }
    // 새 가계부는 기본 계좌·카드 없이 시작, isSetupComplete=false 로 설정 안내 표시
    const emptyData: AppData = {
      ...INITIAL_DATA,
      accounts: [],
      cards: [],
      isSetupComplete: false,
    }
    setMultiData(prev => {
      const next: MultiData = {
        budgetList: [...prev.budgetList, meta],
        budgets: { ...prev.budgets, [id]: emptyData },
        activeBudgetId: id,
      }
      saveToStorage(next)
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchBudget = useCallback((id: string) => {
    setMultiData(prev => {
      if (!prev.budgets[id]) return prev
      const next: MultiData = { ...prev, activeBudgetId: id }
      saveToStorage(next)
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const deleteBudget = useCallback((id: string) => {
    setMultiData(prev => {
      if (prev.budgetList.length <= 1) return prev  // 마지막 가계부는 삭제 불가
      const newBudgetList = prev.budgetList.filter(m => m.id !== id)
      const newBudgets = { ...prev.budgets }
      delete newBudgets[id]
      const newActiveId = prev.activeBudgetId === id
        ? newBudgetList[0].id
        : prev.activeBudgetId
      const next: MultiData = { budgetList: newBudgetList, budgets: newBudgets, activeBudgetId: newActiveId }
      saveToStorage(next)
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const renameBudget = useCallback((id: string, name: string) => {
    setMultiData(prev => {
      const next: MultiData = {
        ...prev,
        budgetList: prev.budgetList.map(m => m.id === id ? { ...m, name: name.trim() || m.name } : m),
      }
      saveToStorage(next)
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    isExplicitSignOutRef.current = true  // 명시적 로그아웃 표시
    if (supabase) await supabase.auth.signOut()
    setUser(null)
    userRef.current = null
    sessionTokenRef.current = null
    setMultiData(INITIAL_MULTI_DATA)
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(NEEDS_SYNC_KEY)
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

  const setGoalPayments = useCallback((goalPayments: GoalPayment[]) => {
    update(d => ({ ...d, goalPayments, lastModified: now() }))
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

  const setInvestmentCashDeposits = useCallback((investmentCashDeposits: InvestmentCashDeposit[]) => {
    update(d => ({ ...d, investmentCashDeposits, lastModified: now() }))
  }, [update])

  const setInvestmentAccountTypes = useCallback((investmentAccountTypes: InvestmentAccountType[]) => {
    update(d => ({ ...d, investmentAccountTypes, lastModified: now() }))
  }, [update])

  const setInvestmentTargetAllocations = useCallback((investmentTargetAllocations: InvestmentTargetAllocation[]) => {
    update(d => ({ ...d, investmentTargetAllocations, lastModified: now() }))
  }, [update])

  const setPortfolioPlans = useCallback((portfolioPlans: PortfolioPlan[]) => {
    update(d => ({ ...d, portfolioPlans, lastModified: now() }))
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

  const setBudgetCarriedMonths = useCallback((budgetCarriedMonths: string[]) => {
    update(d => ({ ...d, budgetCarriedMonths, lastModified: now() }))
  }, [update])

  const setDashboardMemo = useCallback((dashboardMemo: string) => {
    update(d => ({ ...d, dashboardMemo, lastModified: now() }))
  }, [update])

  const setDismissedNotificationIds = useCallback((dismissedNotificationIds: string[]) => {
    update(d => ({ ...d, dismissedNotificationIds, lastModified: now() }))
  }, [update])

  const setInvestmentExchangeRates = useCallback((investmentExchangeRates: Record<string, number>) => {
    update(d => ({ ...d, investmentExchangeRates }))
  }, [update])

  const setWatchlist = useCallback((watchlist: WatchlistItem[]) => {
    update(d => ({ ...d, watchlist, lastModified: now() }))
  }, [update])

  const completeSetup = useCallback((setupData: Partial<AppData>) => {
    update(d => ({ ...d, ...setupData, isSetupComplete: true, lastModified: now() }))
  }, [update])

  const resetAll = useCallback(() => {
    setMultiData(prev => {
      const activeId = prev.activeBudgetId
      const next: MultiData = {
        ...prev,
        budgets: { ...prev.budgets, [activeId]: { ...INITIAL_DATA } },
      }
      saveToStorage(next)
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 백업 파일(JSON 시트)에서 현재 가계부 데이터를 통째로 교체
  // INITIAL_DATA와 머지해서 새로 추가된 필드도 기본값으로 채움
  const restoreBudgetData = useCallback((raw: Partial<AppData>) => {
    setMultiData(prev => {
      const activeId = prev.activeBudgetId
      const merged: AppData = { ...INITIAL_DATA, ...raw, lastModified: now() }
      const next: MultiData = {
        ...prev,
        budgets: { ...prev.budgets, [activeId]: merged },
      }
      saveToStorage(next)
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 백업 파일(JSON 시트)에서 전체 멀티 가계부 데이터를 통째로 교체
  // 모든 가계부 + 목록 + 활성 ID까지 완전 복원
  const restoreAllData = useCallback((raw: MultiData) => {
    // 각 가계부 데이터를 INITIAL_DATA와 머지해서 누락 필드를 기본값으로 채움
    const mergedBudgets: Record<string, AppData> = {}
    for (const [id, budgetData] of Object.entries(raw.budgets ?? {})) {
      mergedBudgets[id] = { ...INITIAL_DATA, ...(budgetData as Partial<AppData>), lastModified: now() }
    }
    const next: MultiData = {
      budgetList: raw.budgetList ?? [makeDefaultMeta()],
      budgets:    mergedBudgets,
      activeBudgetId: raw.activeBudgetId ?? Object.keys(mergedBudgets)[0] ?? DEFAULT_BUDGET_ID,
    }
    saveToStorage(next)
    setMultiData(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!hydrated) return null

  return (
    <AppContext.Provider value={{
      data,
      multiData,
      categories: data.categories,
      user,
      isLoading,
      budgetList: multiData.budgetList,
      activeBudgetId: multiData.activeBudgetId,
      createBudget,
      switchBudget,
      deleteBudget,
      renameBudget,
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
      setGoalPayments,
      setCardBillings,
      setCategories,
      setMappingRules,
      setInvestments,
      setInvestmentTrades,
      setInvestmentAccounts,
      setInvestmentDividends,
      setInvestmentCashDeposits,
      setInvestmentAccountTypes,
      setInvestmentTargetAllocations,
      setPortfolioPlans,
      setSavingPayments,
      setCategoryHiddenMonths,
      setCategoryExcludeMonths,
      setDashboardWidgetOrder,
      setBudgetCarriedMonths,
      setDashboardMemo,
      setDismissedNotificationIds,
      setInvestmentExchangeRates,
      setWatchlist,
      forceSyncNow,
      lastSyncedAt,
      isSyncingNow,
      completeSetup,
      resetAll,
      restoreBudgetData,
      restoreAllData,
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
      if (ct === 'savings_transfer') return false
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
