// ============================================================================
//  dbStore : 항목별 테이블 → 앱 데이터(MultiData) 읽기 레이어
//
//  0001/0002 로 만든 테이블에서 행들을 읽어, 기존 앱이 쓰던 MultiData 구조
//  ({ budgetList, budgets: { [ledgerId]: AppData }, activeBudgetId }) 로 조립한다.
//  반환값은 AppContext 의 hydrateMultiData 가 기본값을 채워 쓰도록 "원본 형태"로 돌려준다.
//
//  ⚠️ 이 모듈은 "읽기"만 한다. 쓰기(저장)는 별도 단계에서 추가.
//  ⚠️ 스위치(useTablesEnabled)가 켜졌을 때만 사용된다. 기본은 꺼짐.
// ============================================================================
import { supabase } from './supabase'

// 새 테이블 방식 사용 여부 (기본 꺼짐)
//  - 배포 환경변수 NEXT_PUBLIC_USE_TABLES === '1' 이거나
//  - 브라우저에서 localStorage 'hb_use_tables' === '1' (재배포 없이 테스트용)
export function useTablesEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_USE_TABLES === '1') return true
  if (typeof window !== 'undefined') {
    try { return localStorage.getItem('hb_use_tables') === '1' } catch { /* ignore */ }
  }
  return false
}

// Supabase numeric 컬럼은 문자열로 올 수 있어 숫자로 보정
function n(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const num = Number(v)
  return Number.isNaN(num) ? undefined : num
}
function n0(v: unknown): number { return n(v) ?? 0 }
function b(v: unknown): boolean | undefined {
  if (v === null || v === undefined) return undefined
  return v === true || v === 'true'
}
// undefined 값을 제거해 앱 객체와 모양을 맞춤
function clean<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T
  for (const k in obj) if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k]
  return out
}

type Row = Record<string, unknown>
const s = (v: unknown): string | undefined => (v === null || v === undefined ? undefined : String(v))

// 행 목록을 ledger_id 별로 묶고 mapper 적용
function byLedger<T>(rows: Row[] | null, map: (r: Row) => T): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const r of rows ?? []) {
    const lid = String(r.ledger_id)
    ;(out[lid] ??= []).push(map(r))
  }
  return out
}

// ── 엔티티별 매퍼 (테이블 컬럼 snake_case → 앱 camelCase) ─────────────────────
const mapAccount = (r: Row) => clean({
  id: s(r.id), name: s(r.name), bank: s(r.bank), balance: n0(r.balance), color: s(r.color),
  assetType: s(r.asset_type), investmentSubType: s(r.investment_sub_type), memo: s(r.memo),
  accountNumber: s(r.account_number),
})
const mapCategory = (r: Row) => clean({
  id: s(r.id), name: s(r.name), type: s(r.type), icon: s(r.icon), color: s(r.color),
  parentId: r.parent_id === null || r.parent_id === undefined ? null : s(r.parent_id),
  savingId: s(r.saving_id), role: s(r.role), excludeFromReal: b(r.exclude_from_real),
})
const mapTransaction = (r: Row) => clean({
  id: s(r.id), date: s(r.date), description: s(r.description), amount: n0(r.amount), type: s(r.type),
  accountId: s(r.account_id), toAccountId: s(r.to_account_id), categoryId: s(r.category_id),
  paymentMethod: s(r.payment_method), cardId: s(r.card_id), note: s(r.note),
  isInstallment: b(r.is_installment), installmentMonths: n(r.installment_months),
  installmentCurrent: n(r.installment_current), savingLinks: r.saving_links ?? undefined,
  billingMonth: s(r.billing_month), consumptionType: s(r.consumption_type),
})
const mapBudget = (r: Row) => clean({
  id: s(r.id), categoryId: s(r.category_id), month: s(r.month), amount: n0(r.amount),
})
const mapCard = (r: Row) => clean({
  id: s(r.id), name: s(r.name), bank: s(r.bank), billingDate: n(r.billing_date), color: s(r.color),
  annualFeeAmount: n(r.annual_fee_amount), annualFeeDate: s(r.annual_fee_date),
})
const mapInstallment = (r: Row) => clean({
  id: s(r.id), cardId: s(r.card_id), description: s(r.description), totalAmount: n0(r.total_amount),
  monthlyAmount: n0(r.monthly_amount), totalMonths: n(r.total_months), paidMonths: n(r.paid_months),
  startDate: s(r.start_date),
})
const mapSaving = (r: Row) => clean({
  id: s(r.id), name: s(r.name), bank: s(r.bank), status: s(r.status), type: s(r.type),
  monthlyAmount: n(r.monthly_amount), interestRate: n(r.interest_rate), startDate: s(r.start_date),
  maturityDate: s(r.maturity_date), currentAmount: n(r.current_amount), expectedAmount: n(r.expected_amount),
  interestType: s(r.interest_type), manualInterest: b(r.manual_interest), taxType: s(r.tax_type),
  accountNumber: s(r.account_number), paymentCycle: s(r.payment_cycle), paymentDay: n(r.payment_day),
  paymentWeekday: n(r.payment_weekday), paymentAmount: n(r.payment_amount), targetAmount: n(r.target_amount),
  skipWeekends: b(r.skip_weekends), actualInterest: n(r.actual_interest), memo: s(r.memo),
})
const mapSavingPayment = (r: Row) => clean({
  id: s(r.id), savingId: s(r.saving_id), date: s(r.date), amount: n0(r.amount), note: s(r.note),
})
const mapGoal = (r: Row) => clean({
  id: s(r.id), name: s(r.name), targetAmount: n0(r.target_amount), currentAmount: n0(r.current_amount),
  deadline: s(r.deadline), color: s(r.color), goalCategory: s(r.goal_category),
  targetDate: s(r.target_date), startDate: s(r.start_date),
})
const mapGoalPayment = (r: Row) => clean({
  id: s(r.id), goalId: s(r.goal_id), date: s(r.date), amount: n0(r.amount), note: s(r.note),
})
const mapCardBilling = (r: Row) => clean({
  id: s(r.id), cardId: s(r.card_id), billingMonth: s(r.billing_month), paymentMonth: s(r.payment_month),
  totalAmount: n0(r.total_amount), paidAmount: n0(r.paid_amount),
})
const mapMappingRule = (r: Row) => clean({
  id: s(r.id), keyword: s(r.keyword), categoryId: s(r.category_id),
})
const mapInvAccountType = (r: Row) => clean({
  id: s(r.id), name: s(r.name), isDefault: b(r.is_default) ?? false,
})
const mapInvAccount = (r: Row) => clean({
  id: s(r.id), name: s(r.name), bank: s(r.bank), typeId: s(r.type_id), type: s(r.type),
  color: s(r.color), cashDeposits: n(r.cash_deposits), accountNumber: s(r.account_number),
})
const mapInvestment = (r: Row) => clean({
  id: s(r.id), accountId: s(r.account_id), assetType: s(r.asset_type), name: s(r.name),
  ticker: s(r.ticker), exchange: s(r.exchange), currency: s(r.currency), currentPrice: n(r.current_price),
  currentPriceUpdatedAt: s(r.current_price_updated_at), prevCloseDiff: n(r.prev_close_diff),
  prevCloseDiffRate: n(r.prev_close_diff_rate),
})
const mapInvTrade = (r: Row) => clean({
  id: s(r.id), investmentId: s(r.investment_id), type: s(r.type), date: s(r.date), quantity: n(r.quantity),
  price: n(r.price), currency: s(r.currency), exchangeRate: n(r.exchange_rate), fee: n(r.fee), note: s(r.note),
  cashAccountId: s(r.cash_account_id), linkedTxId: s(r.linked_tx_id), linkedDepositId: s(r.linked_deposit_id),
})
const mapInvDividend = (r: Row) => clean({
  id: s(r.id), accountId: s(r.account_id), investmentId: s(r.investment_id), date: s(r.date),
  grossAmount: n0(r.gross_amount), tax: n0(r.tax), netAmount: n0(r.net_amount), note: s(r.note),
  cashAccountId: s(r.cash_account_id), linkedTxId: s(r.linked_tx_id),
})
const mapInvCashDeposit = (r: Row) => clean({
  id: s(r.id), accountId: s(r.account_id), date: s(r.date), amount: n0(r.amount), note: s(r.note),
})
const mapPortfolioPlan = (r: Row) => clean({
  accountId: s(r.account_id), items: r.items ?? [], groups: r.groups ?? [],
})
const mapWatchlist = (r: Row) => clean({
  id: s(r.id), name: s(r.name), ticker: s(r.ticker), exchange: s(r.exchange), assetType: s(r.asset_type),
  currency: s(r.currency), currentPrice: n(r.current_price), prevCloseDiff: n(r.prev_close_diff),
  prevCloseDiffRate: n(r.prev_close_diff_rate), currentPriceUpdatedAt: s(r.current_price_updated_at),
})

// 한 테이블 전체 행 조회 (내 것 + 삭제 안 된 것)
async function fetchAll(table: string, userId: string): Promise<Row[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
  if (error) throw error
  return (data ?? []) as Row[]
}

/**
 * 새 테이블들에서 읽어 MultiData(원본 형태)를 조립한다.
 * @param fallbackActiveId 기존 localStorage 등에서 가져온 활성 가계부 id (없으면 첫 가계부)
 * 반환: hydrateMultiData 에 넣을 수 있는 객체. 가계부가 하나도 없으면 null.
 */
export async function loadMultiDataFromTables(
  userId: string,
  fallbackActiveId?: string,
): Promise<unknown | null> {
  if (!supabase) return null

  // 모든 테이블 병렬 조회
  const [
    ledgers, settings, accounts, categories, transactions, budgets, cards, installments,
    savings, savingPayments, goals, goalPayments, cardBillings, mappingRules,
    invAccountTypes, invAccounts, investments, invTrades, invDividends, invCashDeposits,
    portfolioPlans, watchlist,
  ] = await Promise.all([
    fetchAll('ledgers', userId),
    fetchAll('ledger_settings', userId),
    fetchAll('accounts', userId),
    fetchAll('categories', userId),
    fetchAll('transactions', userId),
    fetchAll('budgets', userId),
    fetchAll('cards', userId),
    fetchAll('installments', userId),
    fetchAll('savings', userId),
    fetchAll('saving_payments', userId),
    fetchAll('goals', userId),
    fetchAll('goal_payments', userId),
    fetchAll('card_billings', userId),
    fetchAll('mapping_rules', userId),
    fetchAll('investment_account_types', userId),
    fetchAll('investment_accounts', userId),
    fetchAll('investments', userId),
    fetchAll('investment_trades', userId),
    fetchAll('investment_dividends', userId),
    fetchAll('investment_cash_deposits', userId),
    fetchAll('portfolio_plans', userId),
    fetchAll('watchlist', userId),
  ])

  if (ledgers.length === 0) return null  // 아직 이사 전이거나 데이터 없음 → 기존 방식 사용

  // ledger_id 별 그룹
  const gAccounts = byLedger(accounts, mapAccount)
  const gCategories = byLedger(categories, mapCategory)
  const gTransactions = byLedger(transactions, mapTransaction)
  const gBudgets = byLedger(budgets, mapBudget)
  const gCards = byLedger(cards, mapCard)
  const gInstallments = byLedger(installments, mapInstallment)
  const gSavings = byLedger(savings, mapSaving)
  const gSavingPayments = byLedger(savingPayments, mapSavingPayment)
  const gGoals = byLedger(goals, mapGoal)
  const gGoalPayments = byLedger(goalPayments, mapGoalPayment)
  const gCardBillings = byLedger(cardBillings, mapCardBilling)
  const gMappingRules = byLedger(mappingRules, mapMappingRule)
  const gInvAccountTypes = byLedger(invAccountTypes, mapInvAccountType)
  const gInvAccounts = byLedger(invAccounts, mapInvAccount)
  const gInvestments = byLedger(investments, mapInvestment)
  const gInvTrades = byLedger(invTrades, mapInvTrade)
  const gInvDividends = byLedger(invDividends, mapInvDividend)
  const gInvCashDeposits = byLedger(invCashDeposits, mapInvCashDeposit)
  const gPortfolioPlans = byLedger(portfolioPlans, mapPortfolioPlan)
  const gWatchlist = byLedger(watchlist, mapWatchlist)

  const settingsByLedger: Record<string, Row> = {}
  for (const row of settings) settingsByLedger[String(row.ledger_id)] = row

  // 가계부 목록 + 각 가계부 데이터 조립
  const budgetList = ledgers
    .slice()
    .sort((a, b2) => String(a.created_at ?? '').localeCompare(String(b2.created_at ?? '')))
    .map(l => ({ id: String(l.id), name: String(l.name ?? '내 가계부'), createdAt: String(l.created_at ?? new Date().toISOString()) }))

  const budgetsObj: Record<string, unknown> = {}
  for (const meta of budgetList) {
    const lid = meta.id
    const st = settingsByLedger[lid] ?? {}
    budgetsObj[lid] = {
      accounts: gAccounts[lid] ?? [],
      categories: gCategories[lid] ?? [],
      transactions: gTransactions[lid] ?? [],
      budgets: gBudgets[lid] ?? [],
      cards: gCards[lid] ?? [],
      installments: gInstallments[lid] ?? [],
      savings: gSavings[lid] ?? [],
      savingPayments: gSavingPayments[lid] ?? [],
      goals: gGoals[lid] ?? [],
      goalPayments: gGoalPayments[lid] ?? [],
      cardBillings: gCardBillings[lid] ?? [],
      mappingRules: gMappingRules[lid] ?? [],
      investmentAccountTypes: gInvAccountTypes[lid] ?? [],
      investmentAccounts: gInvAccounts[lid] ?? [],
      investments: gInvestments[lid] ?? [],
      investmentTrades: gInvTrades[lid] ?? [],
      investmentDividends: gInvDividends[lid] ?? [],
      investmentCashDeposits: gInvCashDeposits[lid] ?? [],
      portfolioPlans: gPortfolioPlans[lid] ?? [],
      watchlist: gWatchlist[lid] ?? [],
      categoryHiddenMonths: st.category_hidden_months ?? {},
      categoryExcludeMonths: st.category_exclude_months ?? {},
      dashboardWidgetOrder: st.dashboard_widget_order ?? undefined,
      budgetCarriedMonths: st.budget_carried_months ?? [],
      dashboardMemo: st.dashboard_memo ?? '',
      dismissedNotificationIds: st.dismissed_notification_ids ?? [],
      notificationLog: st.notification_log ?? [],
      investmentExchangeRates: st.investment_exchange_rates ?? {},
      isSetupComplete: st.is_setup_complete ?? false,
      lastModified: null,
    }
  }

  const activeBudgetId = (fallbackActiveId && budgetsObj[fallbackActiveId])
    ? fallbackActiveId
    : budgetList[0]?.id

  return { budgetList, budgets: budgetsObj, activeBudgetId }
}

// ============================================================================
//  쓰기 레이어 : 앱 데이터(MultiData) → 항목별 테이블 (바뀐 행만 저장 = diff)
//
//  앱은 "배열 통째 교체" 구조라, 직전 상태(prev)와 새 상태(next)를 비교해서
//  추가/수정된 항목만 upsert, 사라진 항목은 소프트 삭제(deleted_at)한다.
//  ⚠️ 스위치 ON일 때만 호출. 기존 blob 저장과 "동시"에 실행(이중 저장)된다.
// ============================================================================
type MD = {
  budgetList: Array<{ id: string; name: string; createdAt?: string }>
  budgets: Record<string, Record<string, unknown>>
  activeBudgetId: string
}

const nv = (v: unknown) => (v === undefined ? null : v)

// 엔티티 정의: 테이블명, AppData 내 배열 키, 행 빌더(앱 camel → DB snake)
interface EntitySpec {
  table: string
  key: string
  idCol: string                                   // 식별 컬럼 (대부분 'id')
  conflict: string                                // upsert 충돌 기준
  build: (it: Record<string, unknown>) => Record<string, unknown>
}

const ENTITIES: EntitySpec[] = [
  { table: 'accounts', key: 'accounts', idCol: 'id', conflict: 'user_id,ledger_id,id', build: a => ({
    name: nv(a.name), bank: nv(a.bank), balance: nv(a.balance) ?? 0, color: nv(a.color),
    asset_type: nv(a.assetType), investment_sub_type: nv(a.investmentSubType), memo: nv(a.memo),
    account_number: nv(a.accountNumber) }) },
  { table: 'categories', key: 'categories', idCol: 'id', conflict: 'user_id,ledger_id,id', build: c => ({
    name: nv(c.name), type: nv(c.type), icon: nv(c.icon), color: nv(c.color), parent_id: nv(c.parentId),
    saving_id: nv(c.savingId), role: nv(c.role), exclude_from_real: nv(c.excludeFromReal) }) },
  { table: 'transactions', key: 'transactions', idCol: 'id', conflict: 'user_id,ledger_id,id', build: t => ({
    date: nv(t.date), description: nv(t.description), amount: nv(t.amount) ?? 0, type: nv(t.type),
    account_id: nv(t.accountId), to_account_id: nv(t.toAccountId), category_id: nv(t.categoryId),
    payment_method: nv(t.paymentMethod), card_id: nv(t.cardId), note: nv(t.note),
    is_installment: nv(t.isInstallment), installment_months: nv(t.installmentMonths),
    installment_current: nv(t.installmentCurrent), saving_links: nv(t.savingLinks),
    billing_month: nv(t.billingMonth), consumption_type: nv(t.consumptionType) }) },
  { table: 'budgets', key: 'budgets', idCol: 'id', conflict: 'user_id,ledger_id,id', build: b2 => ({
    category_id: nv(b2.categoryId), month: nv(b2.month), amount: nv(b2.amount) ?? 0 }) },
  { table: 'cards', key: 'cards', idCol: 'id', conflict: 'user_id,ledger_id,id', build: c => ({
    name: nv(c.name), bank: nv(c.bank), billing_date: nv(c.billingDate), color: nv(c.color),
    annual_fee_amount: nv(c.annualFeeAmount), annual_fee_date: nv(c.annualFeeDate) }) },
  { table: 'installments', key: 'installments', idCol: 'id', conflict: 'user_id,ledger_id,id', build: i => ({
    card_id: nv(i.cardId), description: nv(i.description), total_amount: nv(i.totalAmount) ?? 0,
    monthly_amount: nv(i.monthlyAmount) ?? 0, total_months: nv(i.totalMonths), paid_months: nv(i.paidMonths),
    start_date: nv(i.startDate) }) },
  { table: 'savings', key: 'savings', idCol: 'id', conflict: 'user_id,ledger_id,id', build: s2 => ({
    name: nv(s2.name), bank: nv(s2.bank), status: nv(s2.status), type: nv(s2.type),
    monthly_amount: nv(s2.monthlyAmount), interest_rate: nv(s2.interestRate), start_date: nv(s2.startDate),
    maturity_date: nv(s2.maturityDate), current_amount: nv(s2.currentAmount), expected_amount: nv(s2.expectedAmount),
    interest_type: nv(s2.interestType), manual_interest: nv(s2.manualInterest), tax_type: nv(s2.taxType),
    account_number: nv(s2.accountNumber), payment_cycle: nv(s2.paymentCycle), payment_day: nv(s2.paymentDay),
    payment_weekday: nv(s2.paymentWeekday), payment_amount: nv(s2.paymentAmount), target_amount: nv(s2.targetAmount),
    skip_weekends: nv(s2.skipWeekends), actual_interest: nv(s2.actualInterest), memo: nv(s2.memo) }) },
  { table: 'saving_payments', key: 'savingPayments', idCol: 'id', conflict: 'user_id,ledger_id,id', build: p => ({
    saving_id: nv(p.savingId), date: nv(p.date), amount: nv(p.amount) ?? 0, note: nv(p.note) }) },
  { table: 'goals', key: 'goals', idCol: 'id', conflict: 'user_id,ledger_id,id', build: g => ({
    name: nv(g.name), target_amount: nv(g.targetAmount) ?? 0, current_amount: nv(g.currentAmount) ?? 0,
    deadline: nv(g.deadline), color: nv(g.color), goal_category: nv(g.goalCategory),
    target_date: nv(g.targetDate), start_date: nv(g.startDate) }) },
  { table: 'goal_payments', key: 'goalPayments', idCol: 'id', conflict: 'user_id,ledger_id,id', build: p => ({
    goal_id: nv(p.goalId), date: nv(p.date), amount: nv(p.amount) ?? 0, note: nv(p.note) }) },
  { table: 'card_billings', key: 'cardBillings', idCol: 'id', conflict: 'user_id,ledger_id,id', build: b2 => ({
    card_id: nv(b2.cardId), billing_month: nv(b2.billingMonth), payment_month: nv(b2.paymentMonth),
    total_amount: nv(b2.totalAmount) ?? 0, paid_amount: nv(b2.paidAmount) ?? 0 }) },
  { table: 'mapping_rules', key: 'mappingRules', idCol: 'id', conflict: 'user_id,ledger_id,id', build: r => ({
    keyword: nv(r.keyword), category_id: nv(r.categoryId) }) },
  { table: 'investment_account_types', key: 'investmentAccountTypes', idCol: 'id', conflict: 'user_id,ledger_id,id', build: t => ({
    name: nv(t.name), is_default: nv(t.isDefault) ?? false }) },
  { table: 'investment_accounts', key: 'investmentAccounts', idCol: 'id', conflict: 'user_id,ledger_id,id', build: a => ({
    name: nv(a.name), bank: nv(a.bank), type_id: nv(a.typeId), type: nv(a.type), color: nv(a.color),
    cash_deposits: nv(a.cashDeposits), account_number: nv(a.accountNumber) }) },
  { table: 'investments', key: 'investments', idCol: 'id', conflict: 'user_id,ledger_id,id', build: inv => ({
    account_id: nv(inv.accountId), asset_type: nv(inv.assetType), name: nv(inv.name), ticker: nv(inv.ticker),
    exchange: nv(inv.exchange), currency: nv(inv.currency), current_price: nv(inv.currentPrice),
    current_price_updated_at: nv(inv.currentPriceUpdatedAt), prev_close_diff: nv(inv.prevCloseDiff),
    prev_close_diff_rate: nv(inv.prevCloseDiffRate) }) },
  { table: 'investment_trades', key: 'investmentTrades', idCol: 'id', conflict: 'user_id,ledger_id,id', build: tr => ({
    investment_id: nv(tr.investmentId), type: nv(tr.type), date: nv(tr.date), quantity: nv(tr.quantity),
    price: nv(tr.price), currency: nv(tr.currency), exchange_rate: nv(tr.exchangeRate), fee: nv(tr.fee),
    note: nv(tr.note), cash_account_id: nv(tr.cashAccountId), linked_tx_id: nv(tr.linkedTxId),
    linked_deposit_id: nv(tr.linkedDepositId) }) },
  { table: 'investment_dividends', key: 'investmentDividends', idCol: 'id', conflict: 'user_id,ledger_id,id', build: d => ({
    account_id: nv(d.accountId), investment_id: nv(d.investmentId), date: nv(d.date),
    gross_amount: nv(d.grossAmount) ?? 0, tax: nv(d.tax) ?? 0, net_amount: nv(d.netAmount) ?? 0,
    note: nv(d.note), cash_account_id: nv(d.cashAccountId), linked_tx_id: nv(d.linkedTxId) }) },
  { table: 'investment_cash_deposits', key: 'investmentCashDeposits', idCol: 'id', conflict: 'user_id,ledger_id,id', build: d => ({
    account_id: nv(d.accountId), date: nv(d.date), amount: nv(d.amount) ?? 0, note: nv(d.note) }) },
  { table: 'watchlist', key: 'watchlist', idCol: 'id', conflict: 'user_id,ledger_id,id', build: w => ({
    name: nv(w.name), ticker: nv(w.ticker), exchange: nv(w.exchange), asset_type: nv(w.assetType),
    currency: nv(w.currency), current_price: nv(w.currentPrice), prev_close_diff: nv(w.prevCloseDiff),
    prev_close_diff_rate: nv(w.prevCloseDiffRate), current_price_updated_at: nv(w.currentPriceUpdatedAt) }) },
]

// 한 엔티티 배열 diff 후 upsert/소프트삭제
async function syncEntity(
  spec: EntitySpec, prevList: Record<string, unknown>[], nextList: Record<string, unknown>[],
  userId: string, ledgerId: string, now: string,
) {
  if (!supabase) return
  const prevMap = new Map(prevList.map(i => [String(i[spec.idCol]), i]))
  const seen = new Set<string>()
  const upserts: Record<string, unknown>[] = []
  for (const it of nextList) {
    const id = String(it[spec.idCol])
    seen.add(id)
    const prevIt = prevMap.get(id)
    if (!prevIt || JSON.stringify(prevIt) !== JSON.stringify(it)) {
      upserts.push({ ...spec.build(it), [spec.idCol]: it[spec.idCol], user_id: userId, ledger_id: ledgerId, updated_at: now, deleted_at: null })
    }
  }
  const removed: string[] = []
  for (const id of prevMap.keys()) if (!seen.has(id)) removed.push(id)

  if (upserts.length) {
    const { error } = await supabase.from(spec.table).upsert(upserts, { onConflict: spec.conflict })
    if (error) throw error
  }
  if (removed.length) {
    const { error } = await supabase.from(spec.table)
      .update({ deleted_at: now })
      .eq('user_id', userId).eq('ledger_id', ledgerId).in(spec.idCol, removed)
    if (error) throw error
  }
}

/**
 * MultiData 변경분(prev→next)을 새 테이블에 저장. 바뀐 행만 upsert, 사라진 행은 소프트 삭제.
 * prev 가 null 이면 next 전체를 처음 올린다(초기 동기화).
 */
export async function saveMultiDataToTables(prevRaw: unknown, nextRaw: unknown, userId: string): Promise<void> {
  if (!supabase) return
  const prev = prevRaw as MD | null
  const next = nextRaw as MD
  const now = new Date().toISOString()

  // ── 가계부 목록 ──
  const prevLedgers = new Map((prev?.budgetList ?? []).map(m => [m.id, m]))
  const seenLedger = new Set<string>()
  const ledgerUpserts: Record<string, unknown>[] = []
  for (const m of next.budgetList) {
    seenLedger.add(m.id)
    const p = prevLedgers.get(m.id)
    if (!p || p.name !== m.name) {
      ledgerUpserts.push({ id: m.id, user_id: userId, name: m.name, updated_at: now, deleted_at: null })
    }
  }
  if (ledgerUpserts.length) {
    const { error } = await supabase.from('ledgers').upsert(ledgerUpserts, { onConflict: 'user_id,id' })
    if (error) throw error
  }
  const removedLedgers = [...prevLedgers.keys()].filter(id => !seenLedger.has(id))
  if (removedLedgers.length) {
    await supabase.from('ledgers').update({ deleted_at: now }).eq('user_id', userId).in('id', removedLedgers)
  }

  // ── 가계부별 데이터 ──
  for (const meta of next.budgetList) {
    const lid = meta.id
    const nd = next.budgets[lid]
    if (!nd) continue
    const pd = prev?.budgets?.[lid]

    // 설정값(변경 시에만 upsert)
    const settingsRow = {
      user_id: userId, ledger_id: lid,
      category_hidden_months: nv(nd.categoryHiddenMonths) ?? {},
      category_exclude_months: nv(nd.categoryExcludeMonths) ?? {},
      dashboard_widget_order: nv(nd.dashboardWidgetOrder) ?? [],
      budget_carried_months: nv(nd.budgetCarriedMonths) ?? [],
      dashboard_memo: nv(nd.dashboardMemo) ?? '',
      dismissed_notification_ids: nv(nd.dismissedNotificationIds) ?? [],
      notification_log: nv(nd.notificationLog) ?? [],
      investment_exchange_rates: nv(nd.investmentExchangeRates) ?? {},
      is_setup_complete: nv(nd.isSetupComplete) ?? false,
      updated_at: now,
    }
    const settingsKeys = ['categoryHiddenMonths','categoryExcludeMonths','dashboardWidgetOrder','budgetCarriedMonths','dashboardMemo','dismissedNotificationIds','notificationLog','investmentExchangeRates','isSetupComplete']
    const settingsChanged = !pd || settingsKeys.some(k => JSON.stringify(pd[k]) !== JSON.stringify(nd[k]))
    if (settingsChanged) {
      const { error } = await supabase.from('ledger_settings').upsert(settingsRow, { onConflict: 'user_id,ledger_id' })
      if (error) throw error
    }

    // 각 엔티티
    for (const spec of ENTITIES) {
      await syncEntity(
        spec,
        (pd?.[spec.key] as Record<string, unknown>[]) ?? [],
        (nd[spec.key] as Record<string, unknown>[]) ?? [],
        userId, lid, now,
      )
    }

    // 포트폴리오 플랜 (account_id 기준)
    const pPlans = (pd?.portfolioPlans as Record<string, unknown>[]) ?? []
    const nPlans = (nd.portfolioPlans as Record<string, unknown>[]) ?? []
    const prevPlanMap = new Map(pPlans.map(p => [String(p.accountId), p]))
    const seenPlan = new Set<string>()
    const planUpserts: Record<string, unknown>[] = []
    for (const pl of nPlans) {
      const aid = String(pl.accountId)
      seenPlan.add(aid)
      const pp = prevPlanMap.get(aid)
      if (!pp || JSON.stringify(pp) !== JSON.stringify(pl)) {
        planUpserts.push({ account_id: pl.accountId, user_id: userId, ledger_id: lid,
          items: nv(pl.items) ?? [], groups: nv(pl.groups) ?? [], updated_at: now, deleted_at: null })
      }
    }
    if (planUpserts.length) {
      const { error } = await supabase.from('portfolio_plans').upsert(planUpserts, { onConflict: 'user_id,ledger_id,account_id' })
      if (error) throw error
    }
    const removedPlans = [...prevPlanMap.keys()].filter(a => !seenPlan.has(a))
    if (removedPlans.length) {
      await supabase.from('portfolio_plans').update({ deleted_at: now }).eq('user_id', userId).eq('ledger_id', lid).in('account_id', removedPlans)
    }
  }
}
