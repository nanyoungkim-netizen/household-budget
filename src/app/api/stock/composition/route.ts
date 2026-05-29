import { NextRequest, NextResponse } from 'next/server'

export interface CompositionItem {
  name: string
  pct: number
}

// 소수의 인기 ETF만 정적 캐시 (API 장애 시 fallback)
const ETF_STATIC: Record<string, CompositionItem[]> = {
  SPY: [
    { name: 'Apple', pct: 7.1 }, { name: 'Microsoft', pct: 6.5 }, { name: 'NVIDIA', pct: 6.2 },
    { name: 'Amazon', pct: 3.8 }, { name: 'Meta Platforms', pct: 2.4 }, { name: 'Alphabet A', pct: 2.1 },
    { name: 'Alphabet C', pct: 1.8 }, { name: 'Berkshire Hathaway', pct: 1.7 }, { name: 'Broadcom', pct: 1.6 }, { name: 'Tesla', pct: 1.5 },
  ],
  QQQ: [
    { name: 'Apple', pct: 9.0 }, { name: 'NVIDIA', pct: 8.5 }, { name: 'Microsoft', pct: 8.0 },
    { name: 'Amazon', pct: 5.2 }, { name: 'Broadcom', pct: 4.9 }, { name: 'Meta Platforms', pct: 4.8 },
    { name: 'Tesla', pct: 4.2 }, { name: 'Costco Wholesale', pct: 2.6 }, { name: 'Alphabet A', pct: 2.5 }, { name: 'T-Mobile US', pct: 2.1 },
  ],
  SCHD: [
    { name: 'Lockheed Martin', pct: 4.3 }, { name: 'Blackrock', pct: 4.2 }, { name: 'Verizon', pct: 4.1 },
    { name: 'Coca-Cola', pct: 4.0 }, { name: 'AbbVie', pct: 3.9 }, { name: 'Cisco Systems', pct: 3.8 },
    { name: 'Texas Instruments', pct: 3.7 }, { name: 'Bristol-Myers Squibb', pct: 3.6 }, { name: 'Amgen', pct: 3.5 }, { name: 'Home Depot', pct: 3.4 },
  ],
  VTI: [
    { name: 'Apple', pct: 6.3 }, { name: 'Microsoft', pct: 5.9 }, { name: 'NVIDIA', pct: 5.5 },
    { name: 'Amazon', pct: 3.4 }, { name: 'Meta Platforms', pct: 2.2 }, { name: 'Alphabet A', pct: 1.9 },
    { name: 'Berkshire Hathaway', pct: 1.6 }, { name: 'Broadcom', pct: 1.5 }, { name: 'Tesla', pct: 1.4 }, { name: 'Alphabet C', pct: 1.3 },
  ],
  VOO: [
    { name: 'Apple', pct: 7.0 }, { name: 'Microsoft', pct: 6.4 }, { name: 'NVIDIA', pct: 6.1 },
    { name: 'Amazon', pct: 3.7 }, { name: 'Meta Platforms', pct: 2.4 }, { name: 'Alphabet A', pct: 2.0 },
    { name: 'Alphabet C', pct: 1.8 }, { name: 'Berkshire Hathaway', pct: 1.7 }, { name: 'Broadcom', pct: 1.6 }, { name: 'Tesla', pct: 1.5 },
  ],
}

function isGoldEtf(s: string) {
  return /금현물|골드|GOLD|KRX금/i.test(s)
}

// Naver 모바일 JSON API — 국내 ETF 구성종목
async function fetchNaverMobileEtf(code: string): Promise<CompositionItem[] | null> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329',
    'Accept': 'application/json, text/plain, */*',
    'Referer': `https://m.stock.naver.com/domestic/stock/${code}/etf`,
  }

  // Naver 모바일 ETF 구성종목 API (여러 endpoint 시도)
  const endpoints = [
    `https://m.stock.naver.com/api/stock/${code}/etfComponent`,
    `https://m.stock.naver.com/api/fund/etf/${code}/holdings`,
  ]

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers, next: { revalidate: 3600 } })
      if (!res.ok) continue
      const json = await res.json()

      // 응답 shape가 다를 수 있어서 여러 key 시도
      const list: unknown[] =
        json.etfComponents ?? json.components ?? json.holdings ??
        json.stocks ?? json.items ?? json.data ?? []

      if (!Array.isArray(list) || list.length === 0) continue

      const items: CompositionItem[] = list
        .map((s: unknown) => {
          const r = s as Record<string, unknown>
          return {
            name: String(r.itemName ?? r.stockName ?? r.name ?? r.etfName ?? ''),
            pct: Number(r.weight ?? r.ratio ?? r.percentage ?? r.holdingRatio ?? r.pct ?? 0),
          }
        })
        .filter(i => i.name && i.pct > 0)
        .slice(0, 15)

      if (items.length > 0) return items
    } catch {
      // 다음 endpoint 시도
    }
  }
  return null
}

// Naver 금융 HTML 파싱 fallback — ETF 포트폴리오 페이지
async function fetchNaverHtmlEtf(code: string): Promise<CompositionItem[] | null> {
  try {
    const url = `https://finance.naver.com/fund/etfPortfolioInfo.naver?itemCode=${encodeURIComponent(code)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `https://finance.naver.com/fund/etfItemInfo.naver?itemCode=${code}`,
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null

    const buf = await res.arrayBuffer()
    const text = new TextDecoder('euc-kr').decode(buf)

    const items: CompositionItem[] = []

    // 패턴 1: <tr> 안에 rank(숫자)·name·rate 셀이 순서대로 있는 경우
    const pattern1 = /<tr[^>]*>[\s\S]*?<\/tr>/g
    for (const m of text.matchAll(pattern1)) {
      const row = m[0]
      // 이름: 한글/영문 텍스트 td
      const nameM = row.match(/<td[^>]*>\s*<a[^>]*>([^<]+)<\/a>\s*<\/td>/) ??
                    row.match(/<td[^>]*class="[^"]*tleft[^"]*"[^>]*>\s*([^<\s][^<]*?)\s*<\/td>/)
      // 비율: nn.nn% 형태
      const rateM = row.match(/([\d]+\.[\d]+)\s*%/)
      if (nameM && rateM) {
        const name = nameM[1].trim()
        const pct = parseFloat(rateM[1])
        if (name && pct > 0 && !/순위|비중|종목/.test(name)) items.push({ name, pct })
      }
    }

    return items.length > 0 ? items.slice(0, 15) : null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase() ?? ''
  const name   = req.nextUrl.searchParams.get('name') ?? ''

  if (!symbol) {
    return NextResponse.json({ error: '종목코드가 필요합니다.' }, { status: 400 })
  }

  // 1. 해외 ETF 정적 데이터
  const staticItems = ETF_STATIC[symbol]
  if (staticItems) {
    return NextResponse.json({ symbol, items: staticItems, source: 'static' })
  }

  // 2. 금 ETF 패턴
  if (isGoldEtf(name) || isGoldEtf(symbol)) {
    return NextResponse.json({ symbol, name, items: [{ name: '금(Gold)', pct: 100 }], source: 'static' })
  }

  // 3. 국내 ETF (6자리 숫자 코드) — Naver 모바일 JSON API 우선
  if (/^\d{6}$/.test(symbol)) {
    const mobileItems = await fetchNaverMobileEtf(symbol)
    if (mobileItems) {
      return NextResponse.json({ symbol, items: mobileItems, source: 'naver_api' })
    }

    // 4. HTML 파싱 fallback
    const htmlItems = await fetchNaverHtmlEtf(symbol)
    if (htmlItems) {
      return NextResponse.json({ symbol, items: htmlItems, source: 'naver_html' })
    }
  }

  return NextResponse.json({ error: '구성 데이터 없음' }, { status: 200 })
}
