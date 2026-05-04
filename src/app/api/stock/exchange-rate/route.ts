import { NextResponse } from 'next/server'

// 환율 조회 (해외주식 원화 환산용)
// open.er-api.com — 무료, 키 불필요, 1500회/월
// GET /api/stock/exchange-rate
// 응답: { rates: { USD: 1470, EUR: 1720, JPY: 9.3, ... }, updatedAt }

export async function GET() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/KRW', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 }, // 1시간 캐시
    })

    if (!res.ok) return NextResponse.json({ rates: {} }, { status: 200 })

    const json = await res.json() as {
      result?: string
      rates?: Record<string, number>
    }

    if (json.result !== 'success' || !json.rates) {
      return NextResponse.json({ rates: {} })
    }

    // KRW 기준으로 역수 계산 (1 USD = ? KRW)
    const krwRates: Record<string, number> = {}
    const usdToKrw = json.rates['USD'] ? 1 / json.rates['USD'] : null
    if (usdToKrw) {
      const targets = ['USD', 'EUR', 'JPY', 'GBP', 'CNY', 'HKD', 'AUD', 'CAD', 'CHF', 'SGD']
      targets.forEach(cur => {
        if (json.rates![cur]) {
          krwRates[cur] = Math.round((1 / json.rates![cur]) * 10) / 10
        }
      })
    }

    return NextResponse.json({ rates: krwRates, updatedAt: new Date().toISOString() })
  } catch {
    return NextResponse.json({ rates: {} })
  }
}
