import { NextRequest, NextResponse } from 'next/server'

// Yahoo Finance 종목 검색 프록시 (해외주식용)
// URL: https://query1.finance.yahoo.com/v1/finance/search?q={검색어}
// 응답: { quotes: [{ symbol, shortname, longname, exchDisp, quoteType }] }

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 1) {
    return NextResponse.json({ items: [] })
  }

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=false`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      return NextResponse.json({ items: [] }, { status: 200 })
    }

    const json = await res.json() as {
      quotes?: {
        symbol?: string
        shortname?: string
        longname?: string
        exchDisp?: string
        exchange?: string
        quoteType?: string
      }[]
    }

    if (!Array.isArray(json.quotes)) {
      return NextResponse.json({ items: [] })
    }

    // EQUITY, ETF, MUTUALFUND 만 포함, 인덱스·크립토 제외
    const allowed = new Set(['EQUITY', 'ETF', 'MUTUALFUND'])
    const items = json.quotes
      .filter(q => q.quoteType && allowed.has(q.quoteType))
      .slice(0, 10)
      .map(q => ({
        name:     q.longname || q.shortname || q.symbol || '',
        ticker:   q.symbol ?? '',
        market:   q.exchDisp || q.exchange || q.quoteType || '',
        type:     q.quoteType ?? '',
      }))

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 })
  }
}
