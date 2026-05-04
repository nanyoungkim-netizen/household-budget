import { NextRequest, NextResponse } from 'next/server'

// 네이버 금융 해외주식 현재가 프록시
// ?symbol=AAPL.O → { price, change, changeRate, currency, updatedAt }

function parseNum(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''))
    return isNaN(n) ? null : n
  }
  return null
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim()
  if (!symbol) return NextResponse.json({ error: '종목코드가 필요합니다.' }, { status: 400 })

  try {
    const url = `https://api.stock.naver.com/stock/${encodeURIComponent(symbol)}/price`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.naver.com',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) return NextResponse.json({ error: '데이터 조회 실패' }, { status: 200 })

    const json = await res.json() as {
      closePrice?: string
      compareToPreviousClosePrice?: string
      fluctuationsRatio?: string
      stockExchangeType?: { nationType?: string }
    }[]

    // 배열로 반환됨 — 첫 번째 항목 사용
    const data = Array.isArray(json) ? json[0] : json

    const price = parseNum(data?.closePrice)
    if (price === null) return NextResponse.json({ error: '가격 데이터 없음' }, { status: 200 })

    return NextResponse.json({
      symbol,
      price,
      change:     parseNum(data?.compareToPreviousClosePrice) ?? 0,
      changeRate: parseNum(data?.fluctuationsRatio) ?? 0,
      currency:   'USD',   // 네이버 해외주식은 현지 통화 (대부분 USD)
      updatedAt:  new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 200 })
  }
}
