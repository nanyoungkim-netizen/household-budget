export type TransactionType = 'income' | 'expense' | 'transfer' | 'refund'

// FR-01: 자산 유형
export type AssetType = 'cash' | 'savings' | 'investment'

export interface Account {
  id: string
  name: string
  bank: string
  balance: number
  color: string
  assetType?: AssetType  // FR-01: 현금성/예적금/투자
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
  taxType?: 'general' | 'low_tax' | 'exempt'    // FR-011: 과세 유형 (일반 15.4% / 저율 9.9% / 비과세)
  accountNumber?: string                         // 계좌번호 (선택)
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

export interface Goal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  deadline: string
  color: string
}

// FR-08: 가맹점-카테고리 매핑 규칙
export interface MappingRule {
  id: string
  keyword: string      // 가맹점명 키워드 (예: "스타벅스")
  categoryId: string   // 매핑할 카테고리 ID
}
