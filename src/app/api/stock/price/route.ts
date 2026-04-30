import { NextRequest, NextResponse } from 'next/server'

// PRD §10: 네이버 금융 종목 현재가 조회 프록시
// URL: https://m.stock.naver.com/front-api/external/chart/domestic/info?symbol={종목코드}
// ⚠ 비공식 내부 URL — 네이버 정책 변경 시 중단 가능

// PRD §10-4: URL을 설정으로 관리 (변경 시 여기만 수정)
const NAVER_PRICE_URL = process.env.NAVER_PRICE_URL
  ?? 'https://m.stock.naver.com/front-api/external/chart/domestic/info'

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  if (!symbol) {
    return NextResponse.json({ error: '종목코드가 필요합니다.' }, { status: 400 })
  }

  try {
    const url = `${NAVER_PRICE_URL}?symbol=${encodeURIComponent(symbol)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.naver.com',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: '데이터 조회 실패' }, { status: 200 })
    }

    const json = await res.json()

    // 응답 구조에서 현재가 추출 (네이버 내부 API 형식)
    // 형식이 변경될 경우 이 파싱 로직만 수정
    const price = extractPrice(json)
    if (price === null) {
      return NextResponse.json({ error: '가격 데이터 없음' }, { status: 200 })
    }

    return NextResponse.json({
      symbol,
      price,
      change:     extractChange(json),
      changeRate: extractChangeRate(json),
      updatedAt:  new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 200 })
  }
}

// ── 파싱 헬퍼 (네이버 API 응답 구조 변경 시 여기만 수정) ────────────────────
function extractPrice(json: Record<string, unknown>): number | null {
  // 예상 응답 경로들 (네이버 내부 구조)
  const candidates = [
    (json as Record<string, unknown>)?.closePrice,
    (json as Record<string, unknown>)?.currentPrice,
    ((json as Record<string, unknown>)?.data as Record<string, unknown>)?.closePrice,
    ((json as Record<string, unknown>)?.data as Record<string, unknown>)?.currentPrice,
  ]
  for (const v of candidates) {
    const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : typeof v === 'number' ? v : null
    if (n !== null && !isNaN(n) && n > 0) return n
  }
  return null
}

function extractChange(json: Record<string, unknown>): number {
  const v = (json as Record<string, unknown>)?.compareToPreviousClosePrice
    ?? ((json as Record<string, unknown>)?.data as Record<string, unknown>)?.compareToPreviousClosePrice
  return typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) || 0 : typeof v === 'number' ? v : 0
}

function extractChangeRate(json: Record<string, unknown>): number {
  const v = (json as Record<string, unknown>)?.fluctuationsRatio
    ?? ((json as Record<string, unknown>)?.data as Record<string, unknown>)?.fluctuationsRatio
  return typeof v === 'string' ? parseFloat(v) || 0 : typeof v === 'number' ? v : 0
}
