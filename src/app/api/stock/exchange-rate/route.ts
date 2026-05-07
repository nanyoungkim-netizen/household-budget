import { NextResponse } from 'next/server'

// 환율 조회 — 카카오페이와 동일한 '매매기준율' 기준
// 1순위: 네이버 금융 (서울외국환중개 매매기준율)
// 2순위: open.er-api.com (글로벌 중간환율, 폴백용)
// GET /api/stock/exchange-rate
// 응답: { rates: { USD: 1380, EUR: 1520, ... }, source, updatedAt }

const TARGETS = ['USD', 'EUR', 'JPY', 'GBP', 'CNY', 'HKD', 'AUD', 'CAD', 'CHF', 'SGD']

async function fetchFromNaver(): Promise<Record<string, number> | null> {
  try {
    const codes = ['FX_USDKRW', 'FX_EURKRW', 'FX_JPYKRW', 'FX_GBPKRW', 'FX_CNYKRW',
                   'FX_HKDKRW', 'FX_AUDKRW', 'FX_CADKRW', 'FX_CHFKRW', 'FX_SGDKRW']
    const res = await fetch(
      `https://api.stock.naver.com/marketindex/exchange?codes=${codes.join(',')}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://finance.naver.com',
        },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(5000),
      }
    )
    if (!res.ok) return null

    const json = await res.json() as Array<{
      reutersCode?: string
      closePrice?: string | number
    }>

    if (!Array.isArray(json) || json.length === 0) return null

    const rates: Record<string, number> = {}
    json.forEach(item => {
      const match = (item.reutersCode ?? '').match(/^FX_([A-Z]{3})KRW$/)
      if (!match) return
      const price = typeof item.closePrice === 'string'
        ? parseFloat(item.closePrice.replace(/,/g, ''))
        : item.closePrice
      if (price && price > 0) rates[match[1]] = price
    })

    return Object.keys(rates).length > 0 ? rates : null
  } catch {
    return null
  }
}

async function fetchFromErApi(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/KRW', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null

    const json = await res.json() as { result?: string; rates?: Record<string, number> }
    if (json.result !== 'success' || !json.rates) return null

    const rates: Record<string, number> = {}
    TARGETS.forEach(cur => {
      if (json.rates![cur]) {
        rates[cur] = Math.round((1 / json.rates![cur]) * 10) / 10
      }
    })
    return Object.keys(rates).length > 0 ? rates : null
  } catch {
    return null
  }
}

export async function GET() {
  const naver = await fetchFromNaver()
  const rates = naver ?? await fetchFromErApi()

  if (!rates) return NextResponse.json({ rates: {} })

  return NextResponse.json({
    rates,
    source: naver ? 'naver_매매기준율' : 'open.er-api_중간환율',
    updatedAt: new Date().toISOString(),
  })
}
