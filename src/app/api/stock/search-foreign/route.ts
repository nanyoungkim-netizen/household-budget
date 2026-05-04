import { NextRequest, NextResponse } from 'next/server'

// 네이버 금융 해외주식 자동완성 프록시
// ?q=AAPL → { items: [{ name, ticker(reutersCode), market }] }

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 1) return NextResponse.json({ items: [] })

  try {
    const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=worldstock`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.naver.com',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) return NextResponse.json({ items: [] })

    const json = await res.json() as {
      items?: {
        code?: string
        reutersCode?: string
        name?: string
        typeCode?: string
        typeName?: string
        nationName?: string
      }[]
    }

    if (!Array.isArray(json.items)) return NextResponse.json({ items: [] })

    const items = json.items.slice(0, 10).map(row => ({
      name:    row.name        ?? '',
      ticker:  row.reutersCode ?? row.code ?? '',  // reutersCode 우선 (e.g. AAPL.O)
      market:  row.typeName    ?? row.typeCode ?? '',
      nation:  row.nationName  ?? '',
    }))

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
