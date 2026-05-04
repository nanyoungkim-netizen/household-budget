import { NextRequest, NextResponse } from 'next/server'

// Yahoo Finance 현재가 조회 프록시 (해외주식용)
// URL: https://query1.finance.yahoo.com/v7/finance/quote?symbols={ticker}
// 응답: { quoteResponse: { result: [{ regularMarketPrice, regularMarketChange, regularMarketChangePercent }] } }

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  if (!symbol) {
    return NextResponse.json({ error: '종목코드가 필요합니다.' }, { status: 400 })
  }

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,currency`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: '데이터 조회 실패' }, { status: 200 })
    }

    const json = await res.json() as {
      quoteResponse?: {
        result?: {
          regularMarketPrice?: number
          regularMarketChange?: number
          regularMarketChangePercent?: number
          currency?: string
        }[]
      }
    }

    const result = json.quoteResponse?.result?.[0]
    if (!result || result.regularMarketPrice == null) {
      return NextResponse.json({ error: '가격 데이터 없음' }, { status: 200 })
    }

    return NextResponse.json({
      symbol,
      price:      result.regularMarketPrice,
      change:     result.regularMarketChange ?? 0,
      changeRate: result.regularMarketChangePercent ?? 0,
      currency:   result.currency ?? 'USD',
      updatedAt:  new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 200 })
  }
}
