import { NextRequest, NextResponse } from 'next/server'

// PRD §10: 네이버 금융 종목 자동완성 검색 프록시
// URL: https://ac.stock.naver.com/ac?q={검색어}&target=index,stock,marketindex
// 모든 네이버 금융 요청은 서버를 통해 중계 (CORS 우회)

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ items: [] })
  }

  try {
    const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=index,stock,marketindex`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.naver.com',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      return NextResponse.json({ items: [] }, { status: 200 })
    }

    const text = await res.text()

    // 네이버 자동완성 응답 파싱
    // 응답 형식: {"ac":[["삼성전자","005930","KOSPI"],...], "q":"삼성", ...}
    let parsed: { ac?: string[][] } = {}
    try { parsed = JSON.parse(text) } catch { /* ignore */ }

    const items = (parsed.ac ?? []).slice(0, 10).map((row: string[]) => ({
      name:   row[0] ?? '',
      ticker: row[1] ?? '',
      market: row[2] ?? '',
    }))

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 })
  }
}
