import { NextRequest, NextResponse } from 'next/server'

// 네이버 금융 종목 자동완성 검색 프록시
// URL: https://ac.stock.naver.com/ac?q={검색어}&target=index,stock,marketindex
// 현재 응답 형식: { query, items: [{ code, name, typeCode, typeName, ... }] }
// 모든 네이버 금융 요청은 서버를 통해 중계 (CORS 우회)

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 1) {
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

    const json = await res.json() as {
      query?: string
      items?: { code?: string; name?: string; typeCode?: string; typeName?: string }[]
      ac?: string[][]  // 레거시 형식 대비
    }

    // 현재 형식: { items: [{ code, name, typeCode, typeName }] }
    if (Array.isArray(json.items)) {
      const items = json.items.slice(0, 10).map(row => ({
        name:   row.name     ?? '',
        ticker: row.code     ?? '',
        market: row.typeName ?? row.typeCode ?? '',
      }))
      return NextResponse.json({ items })
    }

    // 레거시 형식: { ac: [["이름", "코드", "시장"]] }
    if (Array.isArray(json.ac)) {
      const items = (json.ac as string[][]).slice(0, 10).map(row => ({
        name:   row[0] ?? '',
        ticker: row[1] ?? '',
        market: row[2] ?? '',
      }))
      return NextResponse.json({ items })
    }

    return NextResponse.json({ items: [] })
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 })
  }
}
