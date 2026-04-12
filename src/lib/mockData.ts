import { Account, Category, Transaction, Budget, Card, Installment, Saving, Goal } from '@/types'

export const accounts: Account[] = [
  { id: 'toss', name: '토스뱅크', bank: '토스뱅크', balance: 1250000, color: '#0064FF' },
  { id: 'kb', name: '국민은행', bank: '국민은행', balance: 3800000, color: '#FFB800' },
  { id: 'gwangju', name: '광주은행', bank: '광주은행', balance: 620000, color: '#00B493' },
]

export const categories: Category[] = [
  { id: 'salary', name: '급여', type: 'income', icon: '💰', color: '#00B493' },
  { id: 'interest', name: '이자', type: 'income', icon: '🏦', color: '#00B493' },
  { id: 'saving_return', name: '적금 만기', type: 'income', icon: '🎉', color: '#00B493' },
  { id: 'other_income', name: '기타수입', type: 'income', icon: '💵', color: '#00B493' },
  { id: 'living', name: '생활비', type: 'expense', icon: '🏠', color: '#FF6B6B' },
  { id: 'food', name: '식비', type: 'expense', icon: '🍽️', color: '#FF8E53' },
  { id: 'transport', name: '교통비', type: 'expense', icon: '🚌', color: '#4ECDC4' },
  { id: 'communication', name: '통신비', type: 'expense', icon: '📱', color: '#45B7D1' },
  { id: 'insurance', name: '보험료', type: 'expense', icon: '🛡️', color: '#96CEB4' },
  { id: 'subscription', name: '구독료', type: 'expense', icon: '📺', color: '#DDA0DD' },
  { id: 'shopping', name: '쇼핑·미용', type: 'expense', icon: '🛍️', color: '#F7DC6F' },
  { id: 'selfdev', name: '자기계발', type: 'expense', icon: '📚', color: '#82E0AA' },
  { id: 'gift', name: '선물·경조', type: 'expense', icon: '🎁', color: '#F1948A' },
  { id: 'travel', name: '여행', type: 'expense', icon: '✈️', color: '#85C1E9' },
  { id: 'drink', name: '술·음료', type: 'expense', icon: '🍺', color: '#F0B27A' },
  { id: 'daily', name: '생필품', type: 'expense', icon: '🧴', color: '#A9CCE3' },
  { id: 'loan', name: '대출이자', type: 'expense', icon: '🏦', color: '#EC7063' },
  { id: 'saving', name: '적금', type: 'expense', icon: '💰', color: '#A8D8EA' },
  { id: 'card', name: '카드대금', type: 'expense', icon: '💳', color: '#B0BEC5' },
  { id: 'etc', name: '기타', type: 'expense', icon: '📦', color: '#CFD8DC' },
]

const today = new Date()
const currentYear = today.getFullYear()
const currentMonth = today.getMonth() + 1
const monthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
const prevMonthStr = currentMonth === 1
  ? `${currentYear - 1}-12`
  : `${currentYear}-${String(currentMonth - 1).padStart(2, '0')}`

export const transactions: Transaction[] = [
  // 이번 달 수입 (통장)
  { id: 't1', date: `${monthStr}-05`, description: '급여', amount: 3200000, type: 'income', accountId: 'kb', categoryId: 'salary', paymentMethod: 'account' },
  { id: 't2', date: `${monthStr}-10`, description: '토스뱅크 이자', amount: 8500, type: 'income', accountId: 'toss', categoryId: 'interest', paymentMethod: 'account' },
  // 이번 달 지출 - 통장 이체
  { id: 't3', date: `${monthStr}-02`, description: '관리비', amount: 85000, type: 'expense', accountId: 'kb', categoryId: 'living', paymentMethod: 'account' },
  { id: 't6', date: `${monthStr}-05`, description: '버스/지하철', amount: 55000, type: 'expense', accountId: 'kb', categoryId: 'transport', paymentMethod: 'account' },
  { id: 't11', date: `${monthStr}-11`, description: '주택청약', amount: 200000, type: 'expense', accountId: 'kb', categoryId: 'saving', paymentMethod: 'account' },
  { id: 't14', date: `${monthStr}-14`, description: '피아노 레슨', amount: 150000, type: 'expense', accountId: 'kb', categoryId: 'selfdev', paymentMethod: 'account' },
  // 이번 달 지출 - 카드
  { id: 't4', date: `${monthStr}-03`, description: '마트 장보기', amount: 72000, type: 'expense', accountId: 'toss', categoryId: 'daily', paymentMethod: 'card', cardId: 'card3' },
  { id: 't5', date: `${monthStr}-04`, description: '점심식사', amount: 12000, type: 'expense', accountId: 'toss', categoryId: 'food', paymentMethod: 'card', cardId: 'card1' },
  { id: 't7', date: `${monthStr}-07`, description: '유튜브 프리미엄', amount: 14900, type: 'expense', accountId: 'toss', categoryId: 'subscription', paymentMethod: 'card', cardId: 'card4' },
  { id: 't8', date: `${monthStr}-08`, description: '현대해상 보험', amount: 89000, type: 'expense', accountId: 'kb', categoryId: 'insurance', paymentMethod: 'card', cardId: 'card3' },
  { id: 't9', date: `${monthStr}-09`, description: '카페라떼', amount: 6500, type: 'expense', accountId: 'toss', categoryId: 'drink', paymentMethod: 'card', cardId: 'card1' },
  { id: 't10', date: `${monthStr}-10`, description: '외식 (삼겹살)', amount: 45000, type: 'expense', accountId: 'kb', categoryId: 'food', paymentMethod: 'card', cardId: 'card2' },
  { id: 't12', date: `${monthStr}-12`, description: 'KT 통신비', amount: 55000, type: 'expense', accountId: 'kb', categoryId: 'communication', paymentMethod: 'card', cardId: 'card4' },
  { id: 't13', date: `${monthStr}-13`, description: '쿠팡 생필품', amount: 38000, type: 'expense', accountId: 'toss', categoryId: 'daily', paymentMethod: 'card', cardId: 'card1' },
  { id: 't15', date: `${monthStr}-15`, description: '배달음식', amount: 28000, type: 'expense', accountId: 'toss', categoryId: 'food', paymentMethod: 'card', cardId: 'card2' },
  // 지난 달
  { id: 't16', date: `${prevMonthStr}-05`, description: '급여', amount: 3200000, type: 'income', accountId: 'kb', categoryId: 'salary', paymentMethod: 'account' },
  { id: 't17', date: `${prevMonthStr}-03`, description: '관리비', amount: 85000, type: 'expense', accountId: 'kb', categoryId: 'living', paymentMethod: 'account' },
  { id: 't18', date: `${prevMonthStr}-08`, description: '현대해상 보험', amount: 89000, type: 'expense', accountId: 'kb', categoryId: 'insurance', paymentMethod: 'card', cardId: 'card3' },
  { id: 't19', date: `${prevMonthStr}-10`, description: '외식', amount: 60000, type: 'expense', accountId: 'kb', categoryId: 'food', paymentMethod: 'card', cardId: 'card2' },
  { id: 't20', date: `${prevMonthStr}-15`, description: '쇼핑', amount: 120000, type: 'expense', accountId: 'kb', categoryId: 'shopping', paymentMethod: 'card', cardId: 'card1' },
]

export const budgets: Budget[] = [
  { id: 'b1', categoryId: 'food', month: monthStr, amount: 400000 },
  { id: 'b2', categoryId: 'transport', month: monthStr, amount: 80000 },
  { id: 'b3', categoryId: 'communication', month: monthStr, amount: 60000 },
  { id: 'b4', categoryId: 'living', month: monthStr, amount: 100000 },
  { id: 'b5', categoryId: 'subscription', month: monthStr, amount: 30000 },
  { id: 'b6', categoryId: 'shopping', month: monthStr, amount: 150000 },
  { id: 'b7', categoryId: 'selfdev', month: monthStr, amount: 200000 },
  { id: 'b8', categoryId: 'daily', month: monthStr, amount: 100000 },
  { id: 'b9', categoryId: 'drink', month: monthStr, amount: 50000 },
]

export const cards: Card[] = [
  { id: 'card1', name: '신한카드', bank: '신한은행', billingDate: 15, color: '#0065CC' },
  { id: 'card2', name: '롯데카드', bank: '롯데은행', billingDate: 25, color: '#E60000' },
  { id: 'card3', name: '현대카드', bank: '현대카드', billingDate: 10, color: '#1A1A1A' },
  { id: 'card4', name: '삼성카드', bank: '삼성카드', billingDate: 20, color: '#1259AA' },
]

export const installments: Installment[] = [
  { id: 'i1', cardId: 'card1', description: '애플 맥북', totalAmount: 1800000, monthlyAmount: 150000, totalMonths: 12, paidMonths: 4, startDate: '2026-01-01' },
  { id: 'i2', cardId: 'card2', description: '냉장고 교체', totalAmount: 900000, monthlyAmount: 90000, totalMonths: 10, paidMonths: 2, startDate: '2026-03-01' },
  { id: 'i3', cardId: 'card3', description: '운동 용품', totalAmount: 300000, monthlyAmount: 50000, totalMonths: 6, paidMonths: 5, startDate: '2025-12-01' },
]

export const savings: Saving[] = [
  { id: 's1', name: '주택청약', bank: '국민은행', type: 'saving', monthlyAmount: 200000, interestRate: 2.5, startDate: '2020-01-01', maturityDate: '2030-01-01', currentAmount: 14800000, expectedAmount: 24000000 },
  { id: 's2', name: '청년도약계좌', bank: '토스뱅크', type: 'saving', monthlyAmount: 500000, interestRate: 6.0, startDate: '2024-06-01', maturityDate: '2029-06-01', currentAmount: 11500000, expectedAmount: 40000000 },
  { id: 's3', name: '정기예금', bank: '광주은행', type: 'deposit', monthlyAmount: 0, interestRate: 3.8, startDate: '2026-01-01', maturityDate: '2027-01-01', currentAmount: 5000000, expectedAmount: 5190000 },
]

export const goals: Goal[] = [
  { id: 'g1', name: '1억 모으기', targetAmount: 100000000, currentAmount: 104174639, deadline: '2026-11-14', color: '#0064FF' },
  { id: 'g2', name: '여행 자금 (일본)', targetAmount: 2000000, currentAmount: 850000, deadline: '2026-10-31', color: '#00B493' },
  { id: 'g3', name: '노트북 교체', targetAmount: 2500000, currentAmount: 1800000, deadline: '2026-06-30', color: '#FF6B6B' },
]

export function getMonthlyStats(month: string) {
  const monthTransactions = transactions.filter(t => t.date.startsWith(month))
  const income = monthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = monthTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  return { income, expense, balance: income - expense }
}

export function getCategoryExpenses(month: string) {
  const monthTransactions = transactions.filter(t => t.date.startsWith(month) && t.type === 'expense')
  const map: Record<string, number> = {}
  monthTransactions.forEach(t => {
    map[t.categoryId] = (map[t.categoryId] || 0) + t.amount
  })
  return map
}
