import { NextRequest, NextResponse } from 'next/server'

// 네이버 금융 종목 자동완성 검색 프록시
// 1차: ac.stock.naver.com/ac (프리픽스 자동완성)
// 2차: finance.naver.com/api/sise/etfItemList.nhn (전체 ETF 목록 — 부분 문자열 검색)
//       → EUC-KR 인코딩, 1시간 캐싱

// ----- ETF 전체 목록 캐시 -----
interface EtfEntry { itemcode: string; itemname: string }
let etfCache: EtfEntry[] | null = null
let etfCachedAt = 0
const ETF_CACHE_TTL = 60 * 60 * 1000 // 1시간

async function fetchEtfList(): Promise<EtfEntry[]> {
  const now = Date.now()
  if (etfCache && now - etfCachedAt < ETF_CACHE_TTL) return etfCache

  try {
    const res = await fetch('https://finance.naver.com/api/sise/etfItemList.nhn?etfType=0', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.naver.com/',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return etfCache ?? []

    // EUC-KR 디코딩
    const buf = await res.arrayBuffer()
    const text = new TextDecoder('euc-kr').decode(buf)
    const json = JSON.parse(text) as { result?: { etfItemList?: EtfEntry[] } }
    const list = json?.result?.etfItemList ?? []

    if (list.length > 0) {
      etfCache = list
      etfCachedAt = now
    }
    return list
  } catch {
    return etfCache ?? []
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 1) {
    return NextResponse.json({ items: [] })
  }

  // ── 1. 네이버 자동완성 (프리픽스) ────────────────────────────────────────
  let naverItems: { name: string; ticker: string; market: string }[] = []
  try {
    const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=index,stock,marketindex`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.naver.com',
      },
      next: { revalidate: 0 },
    })

    if (res.ok) {
      const json = await res.json() as {
        items?: { code?: string; name?: string; typeCode?: string; typeName?: string }[]
        ac?: string[][]
      }

      if (Array.isArray(json.items)) {
        naverItems = json.items.slice(0, 10).map(row => ({
          name:   row.name     ?? '',
          ticker: row.code     ?? '',
          market: row.typeName ?? row.typeCode ?? '',
        }))
      } else if (Array.isArray(json.ac)) {
        naverItems = (json.ac as string[][]).slice(0, 10).map(row => ({
          name:   row[0] ?? '',
          ticker: row[1] ?? '',
          market: row[2] ?? '',
        }))
      }
    }
  } catch {
    // naver autocomplete 실패 시 etf 목록으로만 응답
  }

  // ── 2. ETF 전체 목록 부분 문자열 검색 ────────────────────────────────────
  // 네이버 자동완성이 이미 10개 찾았고 한글이 아닌 쿼리면 ETF 검색 생략
  const needEtfSearch = q.length >= 1
  let etfItems: { name: string; ticker: string; market: string }[] = []

  if (needEtfSearch) {
    const qLower = q.toLowerCase()
    const allEtfs = await fetchEtfList()
    const matched = allEtfs.filter(e =>
      e.itemname?.toLowerCase().includes(qLower) ||
      e.itemcode?.toLowerCase().includes(qLower)
    )

    // 네이버 자동완성에 이미 있는 ticker 제외 (중복 방지)
    const naverTickers = new Set(naverItems.map(i => i.ticker))
    etfItems = matched
      .filter(e => !naverTickers.has(e.itemcode))
      .slice(0, 10)
      .map(e => ({
        name:   e.itemname,
        ticker: e.itemcode,
        market: 'ETF',
      }))
  }

  // ── 3. 합치기: 네이버 결과 우선, ETF 부분 검색 결과 후순위 ───────────────
  const combined = [...naverItems, ...etfItems].slice(0, 15)
  return NextResponse.json({ items: combined })
}
