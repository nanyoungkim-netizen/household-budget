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
  date: string            // YYYY-MM-DD
  quantity: number        // 거래 수량
  price: number           // 거래 단가
  currency: InvestmentCurrency
  exchangeRate?: number   // 환율 (외화 거래 시)
  fee?: number            // 수수료
  note?: string
}

export interface Investment {
  id: string
  assetType: InvestmentAssetType
  name: string            // 종목명 / 코인명
  ticker?: string         // 종목코드 / 티커
  exchange?: string       // 거래소 (코인) / 운용사 (ETF)
  currency: InvestmentCurrency
  currentPrice?: number   // 현재가 (수동 입력)
  currentPriceUpdatedAt?: string  // 현재가 업데이트 일시
}
