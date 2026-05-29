import { NextRequest, NextResponse } from 'next/server'

export interface CompositionItem {
  name: string
  pct: number
}

// 소수의 인기 해외 ETF — 정적 fallback
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

// 응답 JSON에서 구성종목 배열을 추출 (여러 가능한 키 시도)
function extractList(json: Record<string, unknown>): unknown[] {
  // 직접 배열인 경우
  if (Array.isArray(json)) return json as unknown[]

  // 가능한 모든 키 순서대로 시도
  const candidates = [
    json.etfComponentSeries,   // Naver 실제 응답 키 (가장 유력)
    json.etfComponents,
    json.components,
    json.holdings,
    json.stocks,
    json.items,
    // 중첩 구조 (result / data 래퍼)
    (json.result as Record<string, unknown>)?.etfComponentSeries,
    (json.result as Record<string, unknown>)?.etfComponents,
    (json.result as Record<string, unknown>)?.holdings,
    (json.data as Record<string, unknown>)?.etfComponentSeries,
    (json.data as Record<string, unknown>)?.etfComponents,
    json.data,
  ]

  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c
  }
  return []
}

// 종목 항목 파싱
function parseItem(s: unknown): CompositionItem | null {
  const r = s as Record<string, unknown>
  const name = String(
    r.itemName ?? r.stockName ?? r.name ?? r.etfName ?? r.fundName ?? r.stockFullCode ?? ''
  ).trim()
  // holdingRatio 는 문자열("30.00") 또는 숫자(30.00) 둘 다 처리
  const pctRaw = r.weight ?? r.ratio ?? r.percentage ?? r.holdingRatio ?? r.pct ?? r.proportion ?? 0
  const pct = typeof pctRaw === 'string' ? parseFloat(pctRaw.replace('%', '')) : Number(pctRaw)
  if (!name || isNaN(pct) || pct <= 0) return null
  return { name, pct }
}

// Naver 모바일 JSON API — 국내 ETF 구성종목
async function fetchNaverMobileEtf(code: string): Promise<CompositionItem[] | null> {
  const mobileHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329',
    'Accept': 'application/json, text/plain, */*',
    'Referer': `https://m.stock.naver.com/domestic/stock/${code}/etf`,
  }

  const endpoints = [
    { url: `https://m.stock.naver.com/api/stock/${code}/etfComponent`, headers: mobileHeaders },
    { url: `https://m.stock.naver.com/api/stock/${code}/etfHoldings`, headers: mobileHeaders },
    {
      url: `https://m.stock.naver.com/api/stock/${code}/etfComponent`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': `https://m.stock.naver.com/domestic/stock/${code}/etf`,
      },
    },
  ]

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, { headers: ep.headers, cache: 'no-store' })
      if (!res.ok) continue
      const json = await res.json() as Record<string, unknown>
      const list = extractList(json)
      if (list.length === 0) continue

      const items = list.map(parseItem).filter((i): i is CompositionItem => i !== null).slice(0, 15)
      if (items.length > 0) return items
    } catch {
      // 다음 endpoint 시도
    }
  }
  return null
}

// Naver 금융 HTML 파싱 fallback
async function fetchNaverHtmlEtf(code: string): Promise<CompositionItem[] | null> {
  // 시도할 URL 목록 (구버전/신버전 모두 커버)
  const urls = [
    `https://finance.naver.com/fund/etfPortfolioInfo.naver?itemCode=${code}`,
    `https://finance.naver.com/fund/etfItemInfo.naver?itemCode=${code}`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': `https://finance.naver.com/fund/etfItemInfo.naver?itemCode=${code}`,
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        cache: 'no-store',
      })
      if (!res.ok) continue

      const buf = await res.arrayBuffer()
      const text = new TextDecoder('euc-kr').decode(buf)

      const items: CompositionItem[] = []

      // <tr> 단위로 파싱
      const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g
      for (const m of text.matchAll(rowPattern)) {
        const row = m[1]
        // 헤더 행 제외
        if (/<th[\s>]/.test(row)) continue

        // td 내 텍스트 추출 (태그 제거)
        const tdTexts: string[] = []
        const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/g
        for (const td of row.matchAll(tdPattern)) {
          const t = td[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
          if (t) tdTexts.push(t)
        }

        // 비중: 소수점 있는 숫자 (정수 순위와 구분), % 있어도 없어도 OK
        const pctCell = tdTexts.find(t => /^\d{1,3}\.\d{1,4}%?$/.test(t))
        // 이름: 한글 또는 영문 포함, 순수 숫자 아닌 셀
        const nameCell = tdTexts.find(t => /[가-힣a-zA-Z]/.test(t) && !/^[\d,\s]+$/.test(t))

        if (nameCell && pctCell) {
          const name = nameCell.trim()
          const pct = parseFloat(pctCell.replace('%', ''))
          if (pct > 0 && pct <= 100 && !/순위|비중|종목|보유|비율/.test(name)) {
            items.push({ name, pct })
          }
        }
      }

      if (items.length > 0) return items.slice(0, 15)
    } catch {
      // 다음 URL 시도
    }
  }
  return null
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
