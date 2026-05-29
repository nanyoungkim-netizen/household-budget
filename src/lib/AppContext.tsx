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

// 자동 백업 사본(버전) 목록 표시용 메타
export interface AppVersionMeta {
  id: string
  createdAt: string         // ISO 문자열 (만든 시각)
  txCount: number | null    // 그 시점의 거래 건수 (목록 식별용)
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
  isPendingSync: boolean     // true → localStorage에 미동기 데이터 있음
  syncError: string | null   // 저장 실패 메시지
  // 초기 설정 완료
  completeSetup: (setupData: Partial<AppData>) => void
  // 전체 초기화
  resetAll: () => void
  // 백업에서 현재 가계부만 복원
  restoreBudgetData: (raw: Partial<AppData>) => void
  // 백업에서 전체 가계부 복원 (모든 가계부 포함)
  restoreAllData: (raw: MultiData) => void
  // 자동 백업(버전) — 사본 목록 조회 / 특정 시점으로 복구
  listVersions: () => Promise<AppVersionMeta[]>
  restoreVersion: (versionId: string) => Promise<boolean>
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
  // 자동 백업(버전) — 연속 저장 묶음 처리용
  const lastVersionAtRef = useRef<number>(0)            // 직전 사본 생성 시각(ms)
  const lastVersionIdRef = useRef<string | null>(null)  // 직전 사본 id (묶음 갱신 대상)

  userRef.current = user
  multiDataRef.current = multiData

  // 현재 활성 가계부 데이터
  const data: AppData = multiData.budgets[multiData.activeBudgetId] ?? INITIAL_DATA

  // ── Supabase 동기화 ─────────────────────────────────────────────────────────
  // dirty flag: 저장됐지만 Supabase 미동기화 상태를 표시 — 다음 init 시 로컬 우선 보장
  const NEEDS_SYNC_KEY = 'hb_needs_sync'
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [isSyncingNow, setIsSyncingNow] = useState(false)
  const [isPendingSync, setIsPendingSync] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  async function syncToSupabase(userId: string, next: MultiData, options?: { snapshot?: boolean }) {
    if (!supabase) return
    try {
      const { error } = await Promise.race([
        supabase.from('user_data').upsert(
          { user_id: userId, data: next, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('supabase_timeout')), 30000)
        ),
      ])
      if (error) throw error
      localStorage.removeItem(NEEDS_SYNC_KEY)  // 성공 시 dirty flag 해제
      setIsPendingSync(false)
      setLastSyncedAt(new Date().toISOString())
      // 본 저장 성공 후 사본(버전) 1개 추가 — 사용자 저장 흐름에서만 (init/login 머지 제외)
      if (options?.snapshot) {
        createVersionSnapshot(userId, next)
      }
    } catch { /* ignore — dirty flag 유지돼서 다음 로드 시 재시도됨 */ }
  }

  // ── 자동 백업(버전) ───────────────────────────────────────────────────────────
  const VERSION_RETENTION_DAYS = 7            // 보관 기간: 최근 7일
  const VERSION_BATCH_WINDOW_MS = 3 * 60_000  // 3분 이내 연속 저장은 직전 사본을 갱신(과도하게 쌓이지 않도록 — 작업 세션당 사본 1개 수준)

  function countTransactions(snapshot: MultiData): number {
    return Object.values(snapshot.budgets ?? {})
      .reduce((sum, b) => sum + (b.transactions?.length ?? 0), 0)
  }

  // 7일보다 오래된 사본 정리 (사본 추가 직후 함께 호출)
  async function cleanupOldVersions(userId: string) {
    if (!supabase) return
    try {
      const cutoff = new Date(Date.now() - VERSION_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
      await supabase.from('user_data_versions').delete().eq('user_id', userId).lt('created_at', cutoff)
    } catch { /* ignore — 정리 실패는 본 기능에 영향 없음 */ }
  }

  // 사본 1개 추가. 직전 사본과 수 초 이내면 그 사본을 갱신(묶음 처리).
  // forceNew=true 면 항상 새 줄로 추가 (복구 직전 "현재 상태" 보존용)
  async function createVersionSnapshot(userId: string, snapshot: MultiData, opts?: { forceNew?: boolean }) {
    if (!supabase) return
    try {
      const txCount = countTransactions(snapshot)
      const nowMs = Date.now()
      const withinWindow = !opts?.forceNew
        && lastVersionIdRef.current != null
        && (nowMs - lastVersionAtRef.current) < VERSION_BATCH_WINDOW_MS

      if (withinWindow) {
        // 직전 사본 갱신
        const { error } = await supabase.from('user_data_versions')
          .update({ data: snapshot, tx_count: txCount, created_at: new Date().toISOString() })
          .eq('id', lastVersionIdRef.current!)
        if (error) throw error
        lastVersionAtRef.current = nowMs
      } else {
        // 새 사본 추가
        const { data: inserted, error } = await supabase.from('user_data_versions')
          .insert({ user_id: userId, data: snapshot, tx_count: txCount })
          .select('id')
          .single()
        if (error) throw error
        lastVersionIdRef.current = inserted?.id ?? null
        lastVersionAtRef.current = nowMs
      }
      cleanupOldVersions(userId)
    } catch { /* ignore — 사본 실패는 본 저장에 영향 주지 않음 */ }
  }

  // 수동 즉시 저장 — 버튼 클릭 시 호출 (최대 2회 자동 재시도)
  const forceSyncNow = useCallback(async () => {
    if (!supabase || !userRef.current) return
    setIsSyncingNow(true)
    setSyncError(null)

    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) { setIsSyncingNow(false); return }
    const current = JSON.parse(stored) as MultiData

    const MAX_RETRIES = 2
    let lastErr: unknown = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // 30초 타임아웃 — Supabase 프리티어 슬립 모드 재시작(~20초) 대응
        const { error } = await Promise.race([
          supabase.from('user_data').upsert(
            { user_id: userRef.current.id, data: current, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 30000)
          ),
        ])
        if (error) throw error
        // 성공
        localStorage.removeItem(NEEDS_SYNC_KEY)
        setIsPendingSync(false)
        setLastSyncedAt(new Date().toISOString())
        setSyncError(null)
        setIsSyncingNow(false)
        // 수동 저장 시에도 사본 1개 추가
        createVersionSnapshot(userRef.current.id, current)
        return
      } catch (e) {
        lastErr = e
        if (attempt < MAX_RETRIES) {
          // 재시도 전 1초 대기
          await new Promise(r => setTimeout(r, 1000))
        }
      }
    }

    // 2회 모두 실패 — 구체적인 에러 메시지 표시
    let msg = '저장에 실패했어요.'
    if (lastErr instanceof Error) {
      if (lastErr.message === 'timeout') {
        msg = '서버 응답이 없어요. 잠시 후 다시 눌러보세요. (Supabase 재시작 중일 수 있어요)'
      } else if (lastErr.message.includes('network') || lastErr.message.includes('fetch')) {
        msg = '인터넷 연결을 확인해주세요.'
      } else {
        msg = `저장 실패: ${lastErr.message}`
      }
    }
    setSyncError(msg)
    setIsSyncingNow(false)
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
        setIsPendingSync(true)
      }
    } catch { /* ignore */ }
    if (supabase && userRef.current) {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      syncTimerRef.current = setTimeout(() => {
        if (userRef.current) syncToSupabase(userRef.current.id, next, { snapshot: true })
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

    // 항상 원격(Supabase) 데이터 우선
    const allIds = new Set([...Object.keys(local.budgets), ...Object.keys(remote.budgets)])
    const mergedBudgets: Record<string, AppData> = {}
    for (const id of allIds) {
      const l = local.budgets[id]
      const r = remote.budgets[id]
      if (!l) { mergedBudgets[id] = r; continue }
      if (!r) { mergedBudgets[id] = l; continue }
      // 원격 우선 — 로컬은 인터넷 없을 때 폴백용
      mergedBudgets[id] = r
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

            const { data: remoteRow, error: remoteErr } = await supabase
              .from('user_data')
              .select('data')
              .eq('user_id', session.user.id)
              .single()

            // PGRST116 = no rows (신규 유저) → 정상
            // 그 외 error = 네트워크/서버 오류 → 로컬 사용, Supabase 절대 덮어쓰기 금지
            const remoteIsNewUser = remoteErr?.code === 'PGRST116'
            const remoteFetchOk = !remoteErr || remoteIsNewUser
            const remoteMulti = remoteRow?.data ? hydrateMultiData(remoteRow.data) : null

            let winner: MultiData
            if (!remoteFetchOk) {
              // 원격 조회 실패 → 로컬만 사용, Supabase 덮어쓰기 절대 금지
              winner = localMulti ?? INITIAL_MULTI_DATA
            } else {
              // 원격 조회 성공 → lastModified 비교해서 더 최신 데이터 사용
              // dirty flag가 있었으면 위에서 이미 로컬을 push했으므로 원격이 최신일 가능성 높음
              // 단, Supabase가 다른 기기에서 잘못 덮어써진 경우 로컬이 더 최신일 수 있음
              winner = mergeMultiData(localMulti, remoteMulti)
            }
            setMultiData(winner)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(winner))
            if (remoteFetchOk) {
              await syncToSupabase(session.user.id, winner)
            }
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

              const { data: remoteRow, error: remoteErr2 } = await supabase!
                .from('user_data')
                .select('data')
                .eq('user_id', session.user.id)
                .single()

              const remoteIsNewUser2 = remoteErr2?.code === 'PGRST116'
              const remoteFetchOk2 = !remoteErr2 || remoteIsNewUser2
              const remoteMulti2 = remoteRow?.data ? hydrateMultiData(remoteRow.data) : null

              let winner2: MultiData
              if (!remoteFetchOk2) {
                winner2 = currentLocal ?? INITIAL_MULTI_DATA
              } else {
                winner2 = mergeMultiData(currentLocal, remoteMulti2)
              }
              setMultiData(winner2)
              localStorage.setItem(STORAGE_KEY, JSON.stringify(winner2))
              if (remoteFetchOk2) {
                await syncToSupabase(session.user.id, winner2)
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

    // visibilitychange: 탭 숨김(다른 탭 전환, 앱 전환) 시 즉시 정상 동기화
    // keepalive 64KB 한계를 우회 — 탭이 완전히 닫히기 전 여유 있을 때 실행
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return
      if (!supabase || !userRef.current) return
      const isDirty = localStorage.getItem(NEEDS_SYNC_KEY) === '1'
      if (!isDirty) return
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
        syncTimerRef.current = null
      }
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const d = JSON.parse(stored) as MultiData
          // 일반 fetch (keepalive 아님) — 탭 숨김 시점엔 아직 JS 실행 가능
          syncToSupabase(userRef.current.id, d)
        }
      } catch { /* ignore */ }
    }

    // beforeunload: 미동기화 상태이면 브라우저 기본 확인 다이얼로그 표시
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (localStorage.getItem(NEEDS_SYNC_KEY) === '1') {
        e.preventDefault()
        // 일부 브라우저는 returnValue가 있어야 다이얼로그 표시
        e.returnValue = ''
      }
    }

    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
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

  // 자동 백업 사본 목록 조회 (최신순)
  const listVersions = useCallback(async (): Promise<AppVersionMeta[]> => {
    if (!supabase || !userRef.current) return []
    try {
      const { data: rows, error } = await supabase
        .from('user_data_versions')
        .select('id, created_at, tx_count')
        .eq('user_id', userRef.current.id)
        .order('created_at', { ascending: false })
      if (error || !rows) return []
      return rows.map(r => ({
        id: r.id as string,
        createdAt: r.created_at as string,
        txCount: (r.tx_count ?? null) as number | null,
      }))
    } catch {
      return []
    }
  }, [])

  // 선택한 사본 시점으로 복구
  // 1) 복구 직전 현재 상태를 사본으로 1개 추가 (되돌리기 취소용)
  // 2) 선택 사본 데이터를 현재 데이터로 적용 → 3) 로컬·서버 모두 갱신
  const restoreVersion = useCallback(async (versionId: string): Promise<boolean> => {
    if (!supabase || !userRef.current) return false
    try {
      // 선택한 사본 읽기
      const { data: row, error } = await supabase
        .from('user_data_versions')
        .select('data')
        .eq('id', versionId)
        .eq('user_id', userRef.current.id)
        .single()
      if (error || !row?.data) return false

      // 복구 직전 현재 상태를 사본으로 1개 보존 (항상 새 줄로)
      await createVersionSnapshot(userRef.current.id, multiDataRef.current, { forceNew: true })
      // 묶음 창을 끊어, 이어지는 복구본 저장이 위 사본을 덮어쓰지 않도록 함
      lastVersionAtRef.current = 0
      lastVersionIdRef.current = null

      // 선택 사본 적용 + 로컬·서버 갱신
      const restored = hydrateMultiData(row.data)
      saveToStorage(restored)   // 로컬 저장 + 디바운스 서버 동기화
      setMultiData(restored)
      return true
    } catch {
      return false
    }
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
      isPendingSync,
      syncError,
      completeSetup,
      resetAll,
      restoreBudgetData,
      restoreAllData,
      listVersions,
      restoreVersion,
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
