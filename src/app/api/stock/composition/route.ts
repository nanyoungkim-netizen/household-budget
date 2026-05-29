import { NextRequest, NextResponse } from 'next/server'

export interface CompositionItem {
  name: string
  pct: number
  noRealPct?: boolean   // true → 비중 미공개, 균등 배분한 것
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

/**
 * 네이버 금융 종목 메인 페이지에서 ETF 구성종목 파싱
 * URL: https://finance.naver.com/item/main.naver?code={6자리}
 * - UTF-8 페이지
 * - <table class="tb_type1 tb_type1_b"> 내 구성종목 테이블
 * - <td class="ctg"><a>종목명</a></td>  +  <td class="per">비중%</td>
 * - 비중이 "-"인 경우 균등 배분으로 표시
 */
async function fetchNaverMainPage(code: string): Promise<CompositionItem[] | null> {
  try {
    const res = await fetch(`https://finance.naver.com/item/main.naver?code=${code}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://finance.naver.com/',
      },
      cache: 'no-store',
    })
    if (!res.ok) return null

    const html = await res.text()  // UTF-8

    // 구성종목 테이블 위치 확인
    const headerIdx = html.indexOf('구성종목(구성자산)')
    if (headerIdx < 0) return null

    const tableStart = html.lastIndexOf('<table', headerIdx)
    const tableEnd   = html.indexOf('</table>', headerIdx)
    if (tableStart < 0 || tableEnd < 0) return null

    const tableHtml = html.substring(tableStart, tableEnd + 8)

    // tr 단위 파싱
    const items: CompositionItem[] = []
    // <tr> 또는 <tr class="..."> 모두 매칭
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g

    for (const rowM of tableHtml.matchAll(rowRe)) {
      const row = rowM[1]

      // 헤더·구분선 행 제외
      if (/<th[\s>]/.test(row) || /class="blank_|class="division_/.test(row)) continue

      // 이름: <td class="ctg"> ... <a>이름</a> 또는 <span>이름</span>
      // 국내주식 보유 ETF → <a href="...">이름</a>
      // 해외주식 보유 ETF → <span>이름</span>
      const nameM = row.match(/<td[^>]*class="ctg"[^>]*>[\s\S]*?<(?:a|span)[^>]*>([^<]+)<\/(?:a|span)>/)
      if (!nameM) continue
      const name = nameM[1].trim()
      if (!name) continue

      // 비중: <td class="per">29.29%</td> 또는 <td class="per">-</td>
      const perM = row.match(/<td[^>]*class="per"[^>]*>([\s\S]*?)<\/td>/)
      let pct = 0
      if (perM) {
        const perText = perM[1].replace(/<[^>]+>/g, '').replace(/\s+/g, '').trim()
        const num = parseFloat(perText.replace('%', ''))
        if (!isNaN(num) && num > 0) pct = num
      }

      items.push({ name, pct })
    }

    if (items.length === 0) return null

    const hasRealPct = items.some(i => i.pct > 0)

    if (hasRealPct) {
      // 비중이 있는 종목만 반환
      return items.filter(i => i.pct > 0).slice(0, 15)
    } else {
      // 비중 미공개 → 균등 배분으로 표시 (noRealPct 플래그)
      const n = Math.min(items.length, 15)
      const eq = parseFloat((100 / n).toFixed(2))
      return items.slice(0, n).map(i => ({ ...i, pct: eq, noRealPct: true }))
    }
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

  // 3. 국내 ETF — 6자리 숫자(069500) 또는 영숫자 혼합(0183J0) 코드
  //    해외 티커(AAPL.O, MSFT 등) 제외: 점(.) 포함이거나 알파벳만인 경우 스킵
  const isDomesticCode = /^[A-Z0-9]{5,7}$/.test(symbol) && /\d/.test(symbol) && !symbol.includes('.')
  if (isDomesticCode) {
    const items = await fetchNaverMainPage(symbol)
    if (items) {
      return NextResponse.json({ symbol, items, source: 'naver_main' })
    }
  }

  return NextResponse.json({ error: '구성 데이터 없음' }, { status: 200 })
}
