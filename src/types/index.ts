export type TransactionType = 'income' | 'expense' | 'transfer' | 'refund'

// FR-01: 자산 유형
export type AssetType = 'cash' | 'savings' | 'investment'

// 투자 세부 유형
export type InvestmentSubType = 'pension_savings' | 'retirement_pension' | 'general_investment'

export const INVESTMENT_SUB_LABELS: Record<InvestmentSubType, { label: string; icon: string }> = {
  pension_savings:    { label: '연금저축',  icon: '🏛️' },
  retirement_pension: { label: '퇴직연금',  icon: '🎯' },
  general_investment: { label: '일반투자',  icon: '📈' },
}

export interface Account {
  id: string
  name: string
  bank: string
  balance: number
  color: string
  assetType?: AssetType                  // FR-01: 현금성/예적금/투자
  investmentSubType?: InvestmentSubType  // 투자 세부 유형 (assetType==='investment'일 때)
  memo?: string                          // 대시보드 카드에 표시할 짧은 메모
  accountNumber?: string                 // 계좌번호 (선택)
}

export type CategoryRole = 'card_payment' | 'savings'

export interface Category {
  id: string
  name: string
  type: TransactionType
  icon: string
  color: string
  parentId?: string | null  // null = 대분류, string = 소분류, undefined = 레거시
  savingId?: string          // 연동된 적금·예금 상품 ID
  role?: CategoryRole        // 연동 역할: card_payment | savings
  excludeFromReal?: boolean  // 실소비 제외 (여행통장, 적금 등 user 지정)
}

export type PaymentMethod = 'account' | 'card'

// PRD 2.1: 거래 소비 유형 (실소비 필터링)
export type ConsumptionType = 'normal' | 'savings_transfer' | 'card_payment'

// 적금/예금 상품 연동 (PRD: 적금예금관리 자동연동)
export interface SavingLink {
  savingId: string
  amount: number
}

export interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  type: TransactionType
  accountId: string        // 출금 계좌 (이체 시 = 보내는 계좌)
  toAccountId?: string     // 입금 계좌 (type === 'transfer'일 때만)
  categoryId: string
  paymentMethod: PaymentMethod
  cardId?: string
  note?: string
  isInstallment?: boolean
  installmentMonths?: number
  installmentCurrent?: number
  savingLinks?: SavingLink[]  // 적금·예금 상품 연동
  billingMonth?: string       // 카드대금 납부 시 해당 청구 월 (YYYY-MM)
  consumptionType?: ConsumptionType  // PRD 2.1: 실소비 유형
}

export interface Budget {
  id: string
  categoryId: string
  month: string // YYYY-MM
  amount: number
}

export interface Card {
  id: string
  name: string
  bank: string
  billingDate: number
  color: string
  annualFeeAmount?: number  // 연회비 금액 (원)
  annualFeeDate?: string    // 연회비 납부일 "MM-DD" 형식
}

export interface Installment {
  id: string
  cardId: string
  description: string
  totalAmount: number
  monthlyAmount: number
  totalMonths: number
  paidMonths: number
  startDate: string
}

// PRD 2.2: 납입 주기 유형
export type SavingPaymentCycle = 'daily' | 'weekly' | 'monthly' | 'free'

// PRD 2.2: 납입 이력 레코드
export interface SavingPayment {
  id: string
  savingId: string
  date: string         // 납입 날짜 (YYYY-MM-DD)
  amount: number       // 납입 금액
  note?: string
}

export interface Saving {
  id: string
  name: string
  bank: string
  status?: 'active' | 'matured'  // 만기 처리 상태
  type: 'saving' | 'deposit' | 'subscription'
  monthlyAmount: number
  interestRate: number
  startDate: string
  maturityDate: string
  currentAmount: number
  expectedAmount: number
  interestType?: 'simple' | 'compound'          // FR-008: 단리/복리
  manualInterest?: boolean                       // FR-008: 직접 입력 여부
  taxType?: 'general' | 'low_tax' | 'exempt'    // FR-011: 과세 유형
  accountNumber?: string                         // 계좌번호 (선택)
  // PRD 2.2: 납입 주기 관리
  paymentCycle?: SavingPaymentCycle             // 납입 주기
  paymentDay?: number                            // 월납: 1~31일
  paymentWeekday?: number                        // 주납: 0(일)~6(토)
  paymentAmount?: number                         // 회차당 납입 금액 (monthlyAmount와 별도)
  targetAmount?: number                          // 목표 수령액
  skipWeekends?: boolean                         // 일납 시 주말 제외 여부
  actualInterest?: number                        // 실제 수령 이자 (만기처리 시 입력)
  memo?: string                                  // 메모 (재예치·투자 용도 등)
}

// FR-009: 카드 청구·납부 관리
export interface CardBilling {
  id: string
  cardId: string
  billingMonth: string  // YYYY-MM (사용 발생 월)
  paymentMonth: string  // YYYY-MM (실제 납부 월)
  totalAmount: number   // 청구 총액
  paidAmount: number    // 납부완료 금액
}

// PRD 2.5: 재무 목표 카테고리
export type GoalCategory = 'travel' | 'wedding' | 'emergency' | 'housing' | 'car' | 'education' | 'other'

// 재무 목표 납입 이력
export interface GoalPayment {
  id: string
  goalId: string
  date: string   // YYYY-MM-DD
  amount: number
  note?: string
}

export interface Goal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  deadline: string
  color: string
  // PRD 2.5: 추가 필드
  goalCategory?: GoalCategory   // 목표 카테고리
  targetDate?: string           // 목표 달성 희망 년월 (YYYY-MM)
  startDate?: string            // 목표 시작 월 (YYYY-MM)
}

// FR-08: 가맹점-카테고리 매핑 규칙
export interface MappingRule {
  id: string
  keyword: string      // 가맹점명 키워드 (예: "스타벅스")
  categoryId: string   // 매핑할 카테고리 ID
}

// ── PRD 2.6: 투자 내역 관리 ───────────────────────────────────────────────────

export type InvestmentAssetType = 'domestic_stock' | 'foreign_stock' | 'etf_fund' | 'crypto'
export type InvestmentTradeType = 'buy' | 'sell'
export type InvestmentCurrency = 'KRW' | 'USD' | 'USDT' | 'other'

export interface InvestmentTrade {
  id: string
  investmentId: string    // 종목 ID
  type: InvestmentTradeType
  date?: string           // YYYY-MM-DD (선택 — 매수일 불명 시 생략 가능)
  quantity: number        // 거래 수량
  price: number           // 거래 단가
  currency: InvestmentCurrency
  exchangeRate?: number   // 환율 (외화 거래 시)
  fee?: number            // 수수료
  note?: string
  cashAccountId?: string    // 자금 출처/입금 현금 계좌 (Account.id)
  linkedTxId?: string       // 자동 생성된 Transaction.id
  linkedDepositId?: string  // 예수금 연동 시 자동 생성된 InvestmentCashDeposit.id
}

// F-03: 투자 계좌 유형
export interface InvestmentAccountType {
  id: string
  name: string        // 유형명 (예: "ISA", "연금저축펀드")
  isDefault: boolean  // 기본 제공 여부 (true면 삭제 불가)
}

// PRD 2.6: 투자 계좌 (증권사 계좌)
export interface InvestmentAccount {
  id: string
  name: string              // e.g. "미래에셋 연금저축"
  bank: string              // e.g. "미래에셋증권"
  type?: InvestmentSubType  // 레거시 (마이그레이션용)
  typeId: string            // InvestmentAccountType.id 참조
  color: string
  cashDeposits?: number     // 예수금 입금 누계 (수동 입금 합계)
  accountNumber?: string    // 계좌번호 (선택)
}

// F-05: 목표 투자 비율 (레거시 — PortfolioPlan으로 대체)
export interface InvestmentTargetAllocation {
  investmentId: string
  targetPct: number  // 0~100
}

// F-05 v2: 계좌별 포트폴리오 플랜
export interface PortfolioPlanItem {
  id: string
  investmentId?: string  // Investment.id — 없으면 커스텀 종목
  customName?: string    // investmentId 없을 때 표시명
  targetPct: number      // 부모 컨텍스트 내 비율 (그룹 내: 그룹 대비 %, 미그룹: 계좌 대비 %)
}

export interface PortfolioPlanGroup {
  id: string
  name: string
  targetPct: number           // 계좌 전체 대비 %
  items: PortfolioPlanItem[]  // targetPct 합 = 100 (그룹 내 비율)
}

export interface PortfolioPlan {
  accountId: string
  items: PortfolioPlanItem[]    // 미그룹 종목 — targetPct = 계좌 대비 %
  groups: PortfolioPlanGroup[]
}

// 관심종목
export interface WatchlistItem {
  id: string
  name: string
  ticker?: string
  exchange?: string
  assetType: InvestmentAssetType
  currency: InvestmentCurrency
  currentPrice?: number
  prevCloseDiff?: number
  prevCloseDiffRate?: number
  currentPriceUpdatedAt?: string
}

export interface Investment {
  id: string
  accountId?: string        // 소속 투자 계좌 ID
  assetType: InvestmentAssetType
  name: string            // 종목명 / 코인명
  ticker?: string         // 종목코드 / 티커
  exchange?: string       // 거래소 (코인) / 운용사 (ETF)
  currency: InvestmentCurrency
  currentPrice?: number   // 현재가 (수동 입력)
  currentPriceUpdatedAt?: string  // 현재가 업데이트 일시
  prevCloseDiff?: number       // 전일 종가 대비 변화액 (주당)
  prevCloseDiffRate?: number   // 전일 종가 대비 변화율 (%)
}

// 예수금 입금 내역
export interface InvestmentCashDeposit {
  id: string
  accountId: string  // 소속 투자계좌 ID
  date: string       // 입금일 (YYYY-MM-DD)
  amount: number     // 입금액 (양수) 또는 출금액 (음수)
  note?: string
}

// PRD: 배당금 기록
export interface InvestmentDividend {
  id: string
  accountId: string      // 소속 투자계좌 ID (InvestmentAccount)
  investmentId?: string  // 배당 발생 종목 (선택사항, 기존 호환용)
  date: string          // 입금일 (YYYY-MM-DD)
  grossAmount: number   // 세전 배당금
  tax: number           // 원천징수세액
  netAmount: number     // 실수령액
  note?: string
  cashAccountId?: string  // 배당금 입금 현금 계좌 (Account.id)
  linkedTxId?: string     // 자동 생성된 Transaction.id
}
