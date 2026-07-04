import { Card } from '@/types'

// 카드가 현재 사용 중인지(해지일이 없거나, 기준일이 해지일 이전/당일이면 활성).
// 해지일 '이후'에는 비활성 → 선택·노출에서 숨김. (거래 내역/이름 조회는 별개로 유지)
export function isCardActive(card: Card, refDate?: string): boolean {
  if (!card.canceledDate) return true
  const ref = refDate ?? new Date().toISOString().slice(0, 10)
  return ref <= card.canceledDate
}
