import { Transaction, Category, CardBilling } from '@/types'

export interface CardCharge {
  cardId: string
  charged: number   // 해당 청구월의 순 사용액(환급 차감 후)
}

export interface CardSettleResult extends CardCharge {
  paid: number
  isPaid: boolean
}

function isCardPaymentCat(categories: Category[], categoryId: string): boolean {
  return categories.find(c => c.id === categoryId)?.role === 'card_payment'
}

/**
 * 한 청구월(billingMonth)의 카드별 납부 상태를 계산한다.
 *
 * 카드별 판정 순서
 *  1) 카드 청구(CardBilling) 레코드가 있으면 그 값을 그대로 사용
 *  2) 그 청구월 카드대금 거래 중 "이 카드"로 지정된 건 전부 합산
 *     → 통장 A·B에서 나눠 납부해도 합계가 청구액 이상이면 납부완료
 *  3) 카드가 지정되지 않은 카드대금 거래는 공용 풀로 보고 배분
 *     3-1) 청구액과 금액이 정확히 같은 건이 있으면 그 카드에 배정(기존 동작 유지)
 *     3-2) 남은 풀을 남은 카드에 청구액이 큰 순서로 배분
 *          → 카드 미지정 상태로 나눠 납부한 경우도 합계로 인정
 *
 * 납부 거래의 "납부 날짜"는 판정에 쓰지 않는다. 청구월(billingMonth)만 본다.
 * (예: 1일·말일로 걸쳐 나눠 낸 경우에도 같은 청구월이면 함께 집계)
 */
export function settleCardBills(
  billingMonth: string,
  charges: CardCharge[],
  src: { transactions: Transaction[]; categories: Category[]; cardBillings: CardBilling[] },
): CardSettleResult[] {
  const { transactions, categories, cardBillings } = src
  const payTxs = transactions.filter(
    t => t.billingMonth === billingMonth && isCardPaymentCat(categories, t.categoryId),
  )

  const results = new Map<string, CardSettleResult>()
  const pending: CardCharge[] = []

  for (const c of charges) {
    const billing = cardBillings.find(b => b.cardId === c.cardId && b.billingMonth === billingMonth)
    if (billing) {
      results.set(c.cardId, {
        ...c,
        paid: billing.paidAmount,
        isPaid: billing.paidAmount >= billing.totalAmount && billing.totalAmount > 0,
      })
      continue
    }
    const tagged = payTxs.filter(t => t.cardId === c.cardId)
    if (tagged.length > 0) {
      const paid = tagged.reduce((s, t) => s + t.amount, 0)
      results.set(c.cardId, { ...c, paid, isPaid: paid >= c.charged && c.charged > 0 })
      continue
    }
    pending.push(c)
  }

  // 카드 미지정 납부 건 = 공용 풀
  const pool = payTxs.filter(t => !t.cardId)
  const used = new Set<string>()

  const stillPending: CardCharge[] = []
  for (const c of pending) {
    const exact = pool.find(t => !used.has(t.id) && c.charged > 0 && t.amount === c.charged)
    if (exact) {
      used.add(exact.id)
      results.set(c.cardId, { ...c, paid: exact.amount, isPaid: true })
    } else {
      stillPending.push(c)
    }
  }

  let left = pool.filter(t => !used.has(t.id)).reduce((s, t) => s + t.amount, 0)
  for (const c of [...stillPending].sort((a, b) => b.charged - a.charged)) {
    const paid = Math.max(0, Math.min(c.charged, left))
    left -= paid
    results.set(c.cardId, { ...c, paid, isPaid: paid >= c.charged && c.charged > 0 })
  }

  return charges.map(c => results.get(c.cardId) ?? { ...c, paid: 0, isPaid: false })
}
