/**
 * 가계부 엑셀 파일 브라우저 파서
 * - 17~22년: 가로형 (항목=행, 월=열 3칸씩)
 * - 23~26년: 세로형 (항목=열0, 월=열1~12)
 */

// ── 카테고리 매핑 ─────────────────────────────────────────────────────────────
const INCOME_MAP: Record<string, string> = {
  급여: 'salary', 월급: 'salary',
  이자: 'interest', 이자수입: 'interest',
  '적금만기': 'saving_return', '적금 만기': 'saving_return',
  전월이월: 'other_income',
  보험금: 'other_income', '대여금회수': 'other_income', '대여금 회수': 'other_income',
  기타수입: 'other_income', 기타: 'other_income',
  '보관하기출금': 'saving_return', '보관하기 출금': 'saving_return',
  피클플러스: 'saving_return',
}

const EXPENSE_MAP: Record<string, string> = {
  관리비: 'living', 생활비: 'living', 가스: 'living', 수도: 'living', 전기: 'living',
  대출이자: 'loan',
  주택청약: 'saving', 청약: 'saving', 청년도약: 'saving', 적금: 'saving', '보관하기': 'saving',
  교통비: 'transport', 버스: 'transport', 지하철: 'transport', 케이패스: 'transport',
  통신비: 'communication', 휴대폰: 'communication', 인터넷: 'communication',
  토스모바일: 'communication', 인스모바일: 'communication',
  우체국보험: 'insurance', 현대해상: 'insurance', 동양생명: 'insurance', 보험료: 'insurance',
  구독료: 'subscription', 유튜브: 'subscription', 웨이브: 'subscription', 배민클럽: 'subscription', 넷플릭스: 'subscription',
  쇼핑: 'shopping', 미용: 'shopping', '쇼핑/미용': 'shopping', '미용/쇼핑': 'shopping',
  피아노: 'selfdev', 운동: 'selfdev', 자기계발: 'selfdev', 여가: 'selfdev', '문화/여가': 'selfdev', 배드민턴: 'selfdev',
  선물: 'gift', 경조: 'gift',
  여행: 'travel',
  술: 'drink', 음료: 'drink', '술/음료': 'drink',
  생필품: 'daily',
  카드대금: 'card', 식비: 'food', 기타지출: 'etc',
}

const SKIP = new Set(['합계', '수입합계', '지출합계', '잔액', 'nan', 'total', '소계', '적금비율', '카드대금합계', '총합', '총잔액', '이월'])
const INCOME_MARKERS = new Set(['급여', '이자', '기타수입', '보험금'])
const EXPENSE_MARKERS = new Set(['관리비', '주택청약', '교통비', '카드대금', '식비'])

export interface HistoryRecord {
  id: string
  date: string         // YYYY-MM-DD (01일 기준)
  description: string
  amount: number
  type: 'income' | 'expense'
  accountId: string
  categoryId: string
}

function parseAmount(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const s = String(val).replace(/,/g, '').replace(/원/g, '').trim()
  const n = parseFloat(s)
  return isNaN(n) ? 0 : Math.abs(Math.round(n))
}

function guessTypeAndCat(name: string, section: string): ['income' | 'expense', string] {
  if (section === 'income') {
    for (const [k, v] of Object.entries(INCOME_MAP)) { if (name.includes(k)) return ['income', v] }
    return ['income', 'other_income']
  }
  if (section === 'expense') {
    for (const [k, v] of Object.entries(EXPENSE_MAP)) { if (name.includes(k)) return ['expense', v] }
    return ['expense', 'etc']
  }
  for (const [k, v] of Object.entries(INCOME_MAP)) { if (name.includes(k)) return ['income', v] }
  for (const [k, v] of Object.entries(EXPENSE_MAP)) { if (name.includes(k)) return ['expense', v] }
  return ['expense', 'etc']
}

function detectAccount(sheetName: string): string {
  if (sheetName.includes('토스')) return 'toss'
  if (sheetName.includes('국민')) return 'kb'
  if (sheetName.includes('광주')) return 'gwangju'
  return 'kb'
}

/** 17~22년 가로형 파싱 */
function parseHorizontal(sheetName: string, rows: unknown[][], year: number): HistoryRecord[] {
  const accountId = detectAccount(sheetName)
  const records: HistoryRecord[] = []
  // 열 쌍: [항목열, 금액열, 월오프셋]  (블록 1: rows 1-19, 블록 2: rows 22+)
  const amountCols = [1, 4, 7, 10, 13, 16]
  const blocks: [number, number, number[]][] = [
    [1, 20, [1, 2, 3, 4, 5, 6]],
    [22, 38, [7, 8, 9, 10, 11, 12]],
  ]
  for (const [rStart, rEnd, months] of blocks) {
    for (let r = rStart; r < Math.min(rEnd, rows.length); r++) {
      const row = rows[r]
      const name = String(row?.[0] ?? '').trim()
      if (!name || SKIP.has(name) || name === 'undefined') continue
      const [type, catId] = guessTypeAndCat(name, '')
      for (let i = 0; i < months.length; i++) {
        const amt = parseAmount(row?.[amountCols[i]])
        if (amt === 0) continue
        records.push({ id: `${sheetName}_${r}_${months[i]}`, date: `${year}-${String(months[i]).padStart(2,'0')}-01`, description: name, amount: amt, type, accountId, categoryId: catId })
      }
    }
  }
  return records
}

/** 23~26년 세로형 파싱 */
function parseVertical(sheetName: string, rows: unknown[][], year: number): HistoryRecord[] {
  const accountId = detectAccount(sheetName)
  const records: HistoryRecord[] = []

  // 행 1에서 월 컬럼 인덱스 찾기
  const monthCols: Record<number, number> = {}
  if (rows[1]) {
    for (let c = 1; c <= 26; c++) {
      const v = String(rows[1][c] ?? '').trim()
      const m = /^(\d{1,2})$/.exec(v)
      if (m) monthCols[parseInt(m[1])] = c
    }
  }
  if (Object.keys(monthCols).length === 0) {
    // fallback: 열 1~12 = 1~12월
    for (let m = 1; m <= 12; m++) monthCols[m] = m
  }

  let section = ''
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r]
    const name = String(row?.[0] ?? '').trim()
    if (!name || name === 'undefined' || SKIP.has(name)) continue
    if ([...INCOME_MARKERS].some(k => name.includes(k))) section = 'income'
    else if ([...EXPENSE_MARKERS].some(k => name.includes(k))) section = 'expense'
    const [type, catId] = guessTypeAndCat(name, section)
    for (const [mon, col] of Object.entries(monthCols)) {
      const amt = parseAmount(row?.[Number(col)])
      if (amt === 0) continue
      records.push({ id: `${sheetName}_${r}_${mon}`, date: `${year}-${String(mon).padStart(2,'0')}-01`, description: name, amount: amt, type, accountId, categoryId: catId })
    }
  }
  return records
}

export interface ParsedSheet {
  name: string
  year: number
  records: HistoryRecord[]
}

export interface ParseResult {
  sheets: ParsedSheet[]
  totalRecords: number
  allRecords: HistoryRecord[]
}

export async function parseExcelFile(file: File): Promise<ParseResult> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  const bankSheets = wb.SheetNames.filter(s =>
    (s.includes('광주은행') || s.includes('국민은행') || s.includes('토스뱅크')) && !s.includes('사본')
  )

  const sheets: ParsedSheet[] = []
  const allRecords: HistoryRecord[] = []

  for (const sheetName of bankSheets) {
    const ws = wb.Sheets[sheetName]
    // header: 1 → 배열 배열
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

    const m = sheetName.match(/(\d{2})년/)
    const year = m ? parseInt('20' + m[1]) : new Date().getFullYear()

    const records = year >= 23
      ? parseVertical(sheetName, rows, year)
      : parseHorizontal(sheetName, rows, year)

    sheets.push({ name: sheetName, year, records })
    allRecords.push(...records)
  }

  return { sheets, totalRecords: allRecords.length, allRecords }
}

/** 월별 요약 집계 */
export function summarizeByMonth(records: HistoryRecord[]) {
  const map: Record<string, { income: number; expense: number; items: HistoryRecord[] }> = {}
  for (const r of records) {
    const key = r.date.slice(0, 7) // YYYY-MM
    if (!map[key]) map[key] = { income: 0, expense: 0, items: [] }
    if (r.type === 'income') map[key].income += r.amount
    else map[key].expense += r.amount
    map[key].items.push(r)
  }
  return Object.entries(map)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, v]) => ({ month, ...v }))
}
