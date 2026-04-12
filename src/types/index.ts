export type TransactionType = 'income' | 'expense' | 'transfer'

export interface Account {
  id: string
  name: string
  bank: string
  balance: number
  color: string
}

export interface Category {
  id: string
  name: string
  type: TransactionType
  icon: string
  color: string
}

export type PaymentMethod = 'account' | 'card'

export interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  type: TransactionType
  accountId: string
  categoryId: string
  paymentMethod: PaymentMethod
  cardId?: string        // 카드 결제인 경우
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
}

export interface Goal {
  id: string
  name: string
  targetAmount: number
  currentAmount: number
  deadline: string
  color: string
}
