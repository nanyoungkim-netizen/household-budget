import { NextRequest, NextResponse } from 'next/server'

// 네이버 금융 종목 현재가 조회 프록시
// URL: https://m.stock.naver.com/api/stock/{code}/basic
// 응답: { closePrice, compareToPreviousClosePrice, fluctuationsRatio, ... }
// ⚠ 비공식 내부 URL — 네이버 정책 변경 시 NAVER_PRICE_BASE_URL 환경변수만 수정

const NAVER_PRICE_BASE_URL = process.env.NAVER_PRICE_BASE_URL
  ?? 'https://m.stock.naver.com/api/stock'

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  if (!symbol) {
    return NextResponse.json({ error: '종목코드가 필요합니다.' }, { status: 400 })
  }

  try {
    const url = `${NAVER_PRICE_BASE_URL}/${encodeURIComponent(symbol)}/basic`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://m.stock.naver.com',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: '데이터 조회 실패' }, { status: 200 })
    }

    const json = await res.json() as Record<string, unknown>

    const price = parseNum(json.closePrice)
    if (price === null) {
      return NextResponse.json({ error: '가격 데이터 없음' }, { status: 200 })
    }

    return NextResponse.json({
      symbol,
      price,
      change:     parseNum(json.compareToPreviousClosePrice) ?? 0,
      changeRate: parseNum(json.fluctuationsRatio) ?? 0,
      updatedAt:  new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 200 })
  }
}

function parseNum(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''))
    return isNaN(n) ? null : n
  }
  return null
}
