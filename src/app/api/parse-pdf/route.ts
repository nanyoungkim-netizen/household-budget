import { NextRequest, NextResponse } from 'next/server'

// ── 서버에서 PDF 표 추출 (모든 은행/카드 공용) ────────────────────────────────
// PDF 해석을 브라우저가 아니라 서버(Node)에서 수행한다. 이렇게 하면 사용자의
// 폰/PC 브라우저가 구버전이어도(예: 오래된 iOS Safari) 상관없이 동작한다.
// 브라우저는 파일 바이트만 올리고, 서버가 { headers, rows } 표를 돌려준다.
export const runtime = 'nodejs'
export const maxDuration = 30

interface PdfTextItem { str?: string; transform?: number[] }

// 서버(Node/서버리스)엔 브라우저 그래픽 객체가 없어 pdfjs 로딩이 실패할 수 있다
// (예: "DOMMatrix is not defined"). 텍스트 추출엔 실제로 쓰이지 않으므로
// 로딩만 통과하도록 최소 스텁을 전역에 채워준다.
function ensureDomPolyfills() {
  const g = globalThis as unknown as Record<string, unknown>
  if (typeof g.DOMMatrix === 'undefined') {
    class DOMMatrixPolyfill {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
      constructor(init?: number[] | string) {
        if (Array.isArray(init) && init.length === 6) {
          this.a = init[0]; this.b = init[1]; this.c = init[2]
          this.d = init[3]; this.e = init[4]; this.f = init[5]
        }
      }
      multiplySelf() { return this }
      preMultiplySelf() { return this }
      translateSelf() { return this }
      scaleSelf() { return this }
    }
    g.DOMMatrix = DOMMatrixPolyfill
  }
  if (typeof g.Path2D === 'undefined') {
    class Path2DPolyfill {
      addPath() {} moveTo() {} lineTo() {} bezierCurveTo() {}
      quadraticCurveTo() {} closePath() {} rect() {} arc() {}
    }
    g.Path2D = Path2DPolyfill
  }
  if (typeof g.ImageData === 'undefined') {
    class ImageDataPolyfill {
      width: number; height: number; data: Uint8ClampedArray
      constructor(w: number, h: number) {
        this.width = w; this.height = h
        this.data = new Uint8ClampedArray(Math.max(0, w * h * 4))
      }
    }
    g.ImageData = ImageDataPolyfill
  }
}

async function extractPDFTable(
  data: Uint8Array,
  password: string,
): Promise<{ headers: string[]; rows: string[][] }> {
  ensureDomPolyfills()
  // Node 환경용 legacy 빌드 (worker 불필요, 메인 스레드에서 처리)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({ data, password: password || '', isEvalSupported: false })
  const pdf = await loadingTask.promise

  type Cell = { x: number; text: string }
  const lines: Cell[][] = []
  for (let pn = 1; pn <= pdf.numPages; pn++) {
    const page = await pdf.getPage(pn)
    const content = await page.getTextContent()
    const byY = new Map<number, Cell[]>()
    for (const item of content.items as PdfTextItem[]) {
      const str = typeof item.str === 'string' ? item.str.trim() : ''
      if (!str || !item.transform) continue
      const y = Math.round(item.transform[5] / 3) * 3
      const x = item.transform[4]
      if (!byY.has(y)) byY.set(y, [])
      byY.get(y)!.push({ x, text: str })
    }
    const pageLines = [...byY.entries()]
      .sort(([ya], [yb]) => yb - ya)
      .map(([, cells]) => cells.sort((a, b) => a.x - b.x))
    lines.push(...pageLines)
  }
  if (lines.length === 0) return { headers: [], rows: [] }

  const allX = lines.flatMap(l => l.map(c => c.x)).sort((a, b) => a - b)
  const centers: number[] = []
  const GAP = 22
  let bucket: number[] = []
  for (const x of allX) {
    if (bucket.length && x - bucket[bucket.length - 1] > GAP) {
      centers.push(bucket.reduce((s, v) => s + v, 0) / bucket.length)
      bucket = []
    }
    bucket.push(x)
  }
  if (bucket.length) centers.push(bucket.reduce((s, v) => s + v, 0) / bucket.length)
  if (centers.length === 0) return { headers: [], rows: [] }

  const colOf = (x: number) => {
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < centers.length; i++) {
      const d = Math.abs(centers[i] - x)
      if (d < bestDist) { bestDist = d; best = i }
    }
    return best
  }

  const grid: string[][] = lines.map(cells => {
    const rowArr: string[] = new Array(centers.length).fill('')
    for (const c of cells) {
      const ci = colOf(c.x)
      rowArr[ci] = rowArr[ci] ? `${rowArr[ci]} ${c.text}` : c.text
    }
    return rowArr
  })

  const HEADER_KW = ['거래일','거래일시','거래일자','날짜','일자','이용일','승인일','매출일','적요','내용','거래내용','가맹점','거래처','상호','거래유형','유형','구분','출금','입금','금액','거래금액','이용금액','승인금액','결제금액','잔액','승인','비고']
  let headerIdx = -1
  let bestScore = 1
  grid.forEach((r, i) => {
    const score = r.filter(c => {
      const cc = c.replace(/\s/g, '')
      return cc && HEADER_KW.some(k => cc.includes(k))
    }).length
    if (score > bestScore) { bestScore = score; headerIdx = i }
  })

  if (headerIdx >= 0) {
    const headers = grid[headerIdx].map((h, i) => h.trim() || `열${i + 1}`)
    const rows = grid.slice(headerIdx + 1).filter(r => r.some(c => c.trim()))
    return { headers, rows }
  }

  const width = centers.length
  const headers = Array.from({ length: width }, (_, i) => `열${i + 1}`)
  return { headers, rows: grid.filter(r => r.some(c => c.trim())) }
}

export async function POST(req: NextRequest) {
  try {
    const password = req.headers.get('x-pdf-password') || ''
    const buf = new Uint8Array(await req.arrayBuffer())
    if (buf.length === 0) {
      return NextResponse.json({ error: '빈 파일입니다.' }, { status: 400 })
    }
    const table = await extractPDFTable(buf, password)
    return NextResponse.json(table)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isPw = msg.toLowerCase().includes('password')
    return NextResponse.json({ error: msg, password: isPw }, { status: isPw ? 401 : 500 })
  }
}
