import { NextRequest, NextResponse } from 'next/server'

export interface CompositionItem {
  name: string
  pct: number
}

// 주요 ETF 구성 정적 데이터 (ETF 제공사·KRX 공시 기준)
const ETF_COMPOSITIONS: Record<string, { name: string; items: CompositionItem[] }> = {
  // ── 해외 ETF ──────────────────────────────────────────────────────────────
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
  VOO: {
    name: 'Vanguard S&P 500 ETF',
    items: [
      { name: 'Apple', pct: 7.0 },
      { name: 'Microsoft', pct: 6.4 },
      { name: 'NVIDIA', pct: 6.1 },
      { name: 'Amazon', pct: 3.7 },
      { name: 'Meta Platforms', pct: 2.4 },
      { name: 'Alphabet Class A', pct: 2.0 },
      { name: 'Alphabet Class C', pct: 1.8 },
      { name: 'Berkshire Hathaway', pct: 1.7 },
      { name: 'Broadcom', pct: 1.6 },
      { name: 'Tesla', pct: 1.5 },
    ],
  },

  // ── 국내 ETF ──────────────────────────────────────────────────────────────
  // KODEX
  '069500': {
    name: 'KODEX 200',
    items: [
      { name: '삼성전자', pct: 24.3 },
      { name: 'SK하이닉스', pct: 7.2 },
      { name: 'LG에너지솔루션', pct: 4.4 },
      { name: '현대차', pct: 3.4 },
      { name: 'POSCO홀딩스', pct: 2.5 },
      { name: '삼성바이오로직스', pct: 2.3 },
      { name: '셀트리온', pct: 2.1 },
      { name: '기아', pct: 2.0 },
      { name: '카카오', pct: 1.8 },
      { name: 'NAVER', pct: 1.6 },
    ],
  },
  '229200': {
    name: 'KODEX KOSDAQ150',
    items: [
      { name: 'HLB', pct: 5.2 },
      { name: '에코프로비엠', pct: 4.8 },
      { name: '알테오젠', pct: 3.9 },
      { name: '리노공업', pct: 3.2 },
      { name: '에스엠', pct: 2.7 },
      { name: '펄어비스', pct: 2.4 },
      { name: '케어젠', pct: 2.1 },
      { name: '엔씨소프트', pct: 2.0 },
      { name: '포스코DX', pct: 1.9 },
      { name: '주성엔지니어링', pct: 1.7 },
    ],
  },

  // TIGER
  '360750': {
    name: 'TIGER 미국S&P500',
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
  '133690': {
    name: 'TIGER 미국나스닥100',
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
  '411060': {
    name: 'ACE 미국S&P500',
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

  // 금현물 ETF (단일 자산)
  '411060R0': { name: 'TIGER KRX금현물', items: [{ name: '금(Gold)', pct: 100 }] },
  '319640': { name: 'KODEX 골드선물(H)', items: [{ name: '금 선물(Gold Futures)', pct: 100 }] },
  '132030': { name: 'KODEX 골드선물', items: [{ name: '금 선물(Gold Futures)', pct: 100 }] },
}

// 금 ETF 티커 패턴으로 추가 감지
function isGoldEtf(name: string): boolean {
  return /금현물|골드|GOLD|KRX금/i.test(name)
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  const name = req.nextUrl.searchParams.get('name') ?? ''
  if (!symbol) {
    return NextResponse.json({ error: '종목코드가 필요합니다.' }, { status: 400 })
  }

  // 정적 데이터 우선 조회
  const staticData = ETF_COMPOSITIONS[symbol] ?? ETF_COMPOSITIONS[symbol.toLowerCase()]
  if (staticData) {
    return NextResponse.json({ symbol, name: staticData.name, items: staticData.items, source: 'static' })
  }

  // 금 ETF 패턴 감지
  if (isGoldEtf(name) || isGoldEtf(symbol)) {
    return NextResponse.json({ symbol, name, items: [{ name: '금(Gold)', pct: 100 }], source: 'static' })
  }

  // 국내 ETF — 네이버 금융 ETF 포트폴리오 페이지 파싱 시도
  try {
    const url = `https://finance.naver.com/fund/etfPortfolioInfo.naver?itemCode=${encodeURIComponent(symbol)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://finance.naver.com/fund/etfItemInfo.naver?itemCode=' + encodeURIComponent(symbol),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      next: { revalidate: 3600 },
    })

    if (!res.ok) return NextResponse.json({ error: '데이터 조회 실패' }, { status: 200 })

    // euc-kr 디코딩
    const buf = await res.arrayBuffer()
    const text = new TextDecoder('euc-kr').decode(buf)

    // ETF 포트폴리오 테이블: <td class="name">종목명</td> … <td class="rate">비율</td>
    const items: CompositionItem[] = []
    const rowRe = /<tr[^>]*>[\s\S]*?<\/tr>/g
    for (const rowMatch of text.matchAll(rowRe)) {
      const row = rowMatch[0]
      const nameM = row.match(/<td[^>]*class="[^"]*name[^"]*"[^>]*>\s*([^<]+)\s*<\/td>/)
      const rateM = row.match(/<td[^>]*class="[^"]*rate[^"]*"[^>]*>\s*([\d.,]+)\s*%?\s*<\/td>/)
      if (nameM && rateM) {
        const name = nameM[1].trim()
        const pct = parseFloat(rateM[1].replace(/,/g, ''))
        if (name && pct > 0) items.push({ name, pct })
      }
    }

    if (items.length > 0) {
      return NextResponse.json({ symbol, items: items.slice(0, 15), source: 'naver' })
    }

    return NextResponse.json({ error: '구성 데이터 없음' }, { status: 200 })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 200 })
  }
}
