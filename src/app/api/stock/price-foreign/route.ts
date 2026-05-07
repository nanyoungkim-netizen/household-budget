import { NextRequest, NextResponse } from 'next/server'

// 해외주식 현재가: 네이버 금융 우선, 실패 시 Yahoo Finance 폴백
// ?symbol=AAPL.O → { price, change, changeRate, currency, updatedAt }

function parseNum(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''))
    return isNaN(n) ? null : n
  }
  return null
}

// Naver Reuters 코드(AAPL.O) → Yahoo 티커(AAPL)
function toYahooTicker(symbol: string): string {
  return symbol.split('.')[0]
}

async function fetchFromNaver(symbol: string): Promise<{ price: number; change: number; changeRate: number } | null> {
  try {
    const res = await fetch(`https://api.stock.naver.com/stock/${encodeURIComponent(symbol)}/price`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.naver.com',
      },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const json = await res.json() as { closePrice?: string; compareToPreviousClosePrice?: string; fluctuationsRatio?: string }[]
    const data = Array.isArray(json) ? json[0] : json
    const price = parseNum(data?.closePrice)
    if (!price) return null
    return {
      price,
      change:     parseNum(data?.compareToPreviousClosePrice) ?? 0,
      changeRate: parseNum(data?.fluctuationsRatio) ?? 0,
    }
  } catch {
    return null
  }
}

async function fetchFromYahoo(symbol: string): Promise<{ price: number; change: number; changeRate: number } | null> {
  try {
    const ticker = toYahooTicker(symbol)
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        next: { revalidate: 0 },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return null
    const json = await res.json() as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number } }[] }
    }
    const meta = json?.chart?.result?.[0]?.meta
    if (!meta?.regularMarketPrice) return null
    const price = meta.regularMarketPrice
    const prev  = meta.chartPreviousClose ?? price
    const change = price - prev
    const changeRate = prev !== 0 ? (change / prev) * 100 : 0
    return { price, change, changeRate }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim()
  if (!symbol) return NextResponse.json({ error: '종목코드가 필요합니다.' }, { status: 400 })

  const naver = await fetchFromNaver(symbol)
  const result = naver ?? await fetchFromYahoo(symbol)

  if (!result) return NextResponse.json({ error: '가격 데이터 없음' }, { status: 200 })

  return NextResponse.json({
    symbol,
    price:      result.price,
    change:     result.change,
    changeRate: result.changeRate,
    currency:   'USD',
    source:     naver ? 'naver' : 'yahoo',
    updatedAt:  new Date().toISOString(),
  })
}
