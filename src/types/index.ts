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

export interface Category {
  id: string
  name: string
  type: TransactionType
  icon: string
  color: string
  parentId?: string | null  // null = 대분류, string = 소분류, undefined = 레거시
}

export type PaymentMethod = 'account' | 'card'

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
  type: 'saving' | 'deposit'
  monthlyAmount: number
  interestRate: number
  startDate: string
  maturityDate: string
  currentAmount: number
  expectedAmount: number
  interestType?: 'simple' | 'compound'   // FR-008: 단리/복리
  manualInterest?: boolean               // FR-008: 직접 입력 여부
  taxType?: 'general' | 'exempt'         // FR-011: 과세 유형
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
