import { NextRequest, NextResponse } from 'next/server'

export interface CompositionItem {
  name: string
  pct: number
}

const NAVER_BASE = 'https://m.stock.naver.com/api/stock'

// 해외 ETF 구성 (정적 fallback — ETF 제공사 공개 데이터 기준)
const FOREIGN_ETF_COMPOSITIONS: Record<string, { name: string; items: CompositionItem[] }> = {
  SPY: {
    name: 'SPDR S&P 500 ETF',
    items: [
      { name: 'Apple', pct: 7.1 },
      { name: 'Microsoft', pct: 6.5 },
      { name: 'NVIDIA', pct: 6.2 },
      { name: 'Amazon', pct: 3.8 },
      { name: 'Meta Platforms', pct: 2.4 },
      { name: 'Alphabet Class A', pct: 2.1 },
      { name: 'Alphabet Class C', pct: 1.8 },
      { name: 'Berkshire Hathaway', pct: 1.7 },
      { name: 'Broadcom', pct: 1.6 },
      { name: 'Tesla', pct: 1.5 },
    ],
  },
  QQQ: {
    name: 'Invesco QQQ Trust',
    items: [
      { name: 'Apple', pct: 9.0 },
      { name: 'NVIDIA', pct: 8.5 },
      { name: 'Microsoft', pct: 8.0 },
      { name: 'Amazon', pct: 5.2 },
      { name: 'Broadcom', pct: 4.9 },
      { name: 'Meta Platforms', pct: 4.8 },
      { name: 'Tesla', pct: 4.2 },
      { name: 'Costco Wholesale', pct: 2.6 },
      { name: 'Alphabet Class A', pct: 2.5 },
      { name: 'T-Mobile US', pct: 2.1 },
    ],
  },
  SCHD: {
    name: 'Schwab US Dividend Equity ETF',
    items: [
      { name: 'Lockheed Martin', pct: 4.3 },
      { name: 'Blackrock', pct: 4.2 },
      { name: 'Verizon', pct: 4.1 },
      { name: 'Coca-Cola', pct: 4.0 },
      { name: 'AbbVie', pct: 3.9 },
      { name: 'Cisco Systems', pct: 3.8 },
      { name: 'Texas Instruments', pct: 3.7 },
      { name: 'Bristol-Myers Squibb', pct: 3.6 },
      { name: 'Amgen', pct: 3.5 },
      { name: 'Home Depot', pct: 3.4 },
    ],
  },
  VTI: {
    name: 'Vanguard Total Stock Market ETF',
    items: [
      { name: 'Apple', pct: 6.3 },
      { name: 'Microsoft', pct: 5.9 },
      { name: 'NVIDIA', pct: 5.5 },
      { name: 'Amazon', pct: 3.4 },
      { name: 'Meta Platforms', pct: 2.2 },
      { name: 'Alphabet Class A', pct: 1.9 },
      { name: 'Berkshire Hathaway', pct: 1.6 },
      { name: 'Broadcom', pct: 1.5 },
      { name: 'Tesla', pct: 1.4 },
      { name: 'Alphabet Class C', pct: 1.3 },
    ],
  },
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  if (!symbol) {
    return NextResponse.json({ error: '종목코드가 필요합니다.' }, { status: 400 })
  }

  // 해외 ETF — 정적 데이터 반환
  if (FOREIGN_ETF_COMPOSITIONS[symbol]) {
    return NextResponse.json({
      symbol,
      name: FOREIGN_ETF_COMPOSITIONS[symbol].name,
      items: FOREIGN_ETF_COMPOSITIONS[symbol].items,
      source: 'static',
    })
  }

  // 국내 ETF — 네이버 금융 etfPortfolio API
  try {
    const url = `${NAVER_BASE}/${encodeURIComponent(symbol)}/etfPortfolio`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://m.stock.naver.com',
      },
      next: { revalidate: 3600 }, // 1시간 캐시
    })

    if (!res.ok) {
      return NextResponse.json({ error: '데이터 조회 실패' }, { status: 200 })
    }

    const json = await res.json() as Record<string, unknown>
    const list = json.etfPortfolioList as Array<Record<string, unknown>> | undefined

    if (!list || list.length === 0) {
      return NextResponse.json({ error: '구성 데이터 없음' }, { status: 200 })
    }

    const items: CompositionItem[] = list.map(item => ({
      name: String(item.itemName ?? item.stockName ?? ''),
      pct: parseFloat(String(item.portfRatio ?? item.ratio ?? 0).replace(/,/g, '')) || 0,
    })).filter(item => item.name && item.pct > 0)

    return NextResponse.json({ symbol, items, source: 'naver' })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 200 })
  }
}
