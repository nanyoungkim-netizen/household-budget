'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useApp } from '@/lib/AppContext'
import { Transaction, PaymentMethod, Category } from '@/types'

// ── PDF 파싱 (pdfjs-dist) ─────────────────────────────────────────────────────
async function extractPDFRows(file: File, password?: string): Promise<string[][]> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const buf = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buf),
    password: password || '',
  })

  const pdf = await loadingTask.promise
  const allRows: string[][] = []

  for (let pn = 1; pn <= pdf.numPages; pn++) {
    const page = await pdf.getPage(pn)
    const content = await page.getTextContent()

    // y좌표 기준으로 텍스트 그룹핑 (3px 허용오차)
    const byY = new Map<number, Array<{ x: number; text: string }>>()
    for (const item of content.items) {
      if (!('str' in item) || !(item.str as string).trim()) continue
      const raw = item as { str: string; transform: number[] }
      const y = Math.round(raw.transform[5] / 3) * 3
      const x = raw.transform[4]
      if (!byY.has(y)) byY.set(y, [])
      byY.get(y)!.push({ x, text: raw.str.trim() })
    }

    // 위→아래 정렬, 각 행은 왼→오른쪽
    const rows = [...byY.entries()]
      .sort(([ya], [yb]) => yb - ya)
      .map(([, cells]) => cells.sort((a, b) => a.x - b.x).map(c => c.text))

    allRows.push(...rows)
  }

  return allRows
}

// ── KB 국민은행 PDF 형식 파싱 ─────────────────────────────────────────────────
// 컬럼: 거래일시 | 적요 | 보낸분/받는분 | 출금액 | 입금액 | 잔액 | 송금메모 | 거래점
function parseKBBankRows(rows: string[][], importAccountId: string, secondAccountId: string): ImportRow[] {
  // 헤더 행 찾기
  const headerIdx = rows.findIndex(r =>
    r.some(c => c.includes('거래일시')) && r.some(c => c.includes('출금액'))
  )
  if (headerIdx < 0) return []

  const header = rows[headerIdx]
  const ci = (candidates: string[]) =>
    header.findIndex(h => candidates.some(c => h.includes(c)))

  const cDate    = ci(['거래일시', '거래일자'])
  const cDesc    = ci(['적요'])
  const cSender  = ci(['보낸분', '받는분'])
  const cOut     = ci(['출금액'])
  const cIn      = ci(['입금액'])

  if (cDate < 0 || cOut < 0 || cIn < 0) return []

  const importRows: ImportRow[] = []

  rows.slice(headerIdx + 1).forEach((row, i) => {
    const dateStr = row[cDate] || ''
    if (!dateStr.match(/\d{4}[.\-]\d{2}[.\-]\d{2}/)) return

    const desc    = [row[cDesc], row[cSender]].filter(Boolean).join(' ').trim()
    const outAmt  = parseAmountSigned(row[cOut] || '0')
    const inAmt   = parseAmountSigned(row[cIn]  || '0')
    const txType  = row[cDesc] || ''

    const withdrawal = Math.abs(outAmt)
    const deposit    = Math.abs(inAmt)

    let amount: number
    let type: 'income' | 'expense' | 'transfer'

    if (deposit > 0 && withdrawal === 0) {
      amount = deposit; type = 'income'
    } else if (withdrawal > 0 && deposit === 0) {
      amount = withdrawal; type = 'expense'
    } else {
      return // 둘 다 0이거나 둘 다 있으면 스킵
    }

    // 이체 자동 감지
    if (isTransferLike(desc, txType)) type = 'transfer'

    const date = parseDate(dateStr)
    const sugCatId = type !== 'transfer' ? suggestCategory(desc, txType, type as 'income' | 'expense') : 'transfer'
    const catList  = type === 'income' ? [] : []  // 나중에 채움
    const autoSuggested = type !== 'transfer' && sugCatId !== (type === 'income' ? 'other_income' : 'etc')

    importRows.push({
      _key: `pdf_${i}_${Date.now()}`,
      date,
      description: desc || '(내용 없음)',
      txType,
      amount,
      type,
      categoryId: sugCatId,
      accountId: importAccountId,
      toAccountId: secondAccountId,
      paymentMethod: 'account',
      cardId: undefined,
      include: true,
      autoSuggested,
    })
  })

  return importRows
}

// ── 키워드 → 카테고리 자동 매핑 ────────────────────────────────────────────
const KEYWORD_MAP: { keywords: string[]; catId: string; type: 'income' | 'expense' }[] = [
  // 수입
  { keywords: ['급여','월급','임금','급료','상여','인센티브','성과금'], catId: 'salary', type: 'income' },
  // 이자 (결산이자, 이자세금 포함, FBS/모니모적립 포함)
  { keywords: ['결산이자','이자세금','통장이자','이자입금','이자수익','예금이자','적금이자'], catId: 'interest', type: 'income' },
  { keywords: ['fbs입금','모니모적립','적립금','포인트적립','리워드'], catId: 'interest', type: 'income' },
  { keywords: ['적금만기','만기해지','만기'], catId: 'saving_return', type: 'income' },
  { keywords: ['환급','국세환급','지방세환급','건보환급','보험환급'], catId: 'other_income', type: 'income' },
  { keywords: ['입출금지원금','지원금','보조금'], catId: 'other_income', type: 'income' },

  // 저축 / 이체
  { keywords: ['잔돈모으기','잔돈'], catId: 'saving', type: 'expense' },
  { keywords: ['적금','정기적금','청약','주택청약','청약저금'], catId: 'saving', type: 'expense' },
  { keywords: ['달러로모으기','달러저축','외화저축'], catId: 'saving', type: 'expense' },

  // 카드 납부
  { keywords: ['카드자동이체','카드대금','카드결제','카드납부'], catId: 'etc', type: 'expense' },
  { keywords: ['롯데카드','현대카드','삼성카드','신한카드','kb카드','하나카드','우리카드','bc카드','씨티카드'], catId: 'etc', type: 'expense' },

  // 대출
  { keywords: ['대출이자','이자납부','원리금','상환','대출원금'], catId: 'loan', type: 'expense' },

  // 교통
  { keywords: ['버스','지하철','택시','카카오택시','ktx','기차','tmoney','t머니','교통','따릉이','킥보드'], catId: 'transport', type: 'expense' },

  // 카페/음료
  { keywords: ['스타벅스','카페','커피','빽다방','이디야','투썸','할리스','파스쿠찌','메가커피','컴포즈'], catId: 'drink', type: 'expense' },

  // 식비
  { keywords: ['배달의민족','쿠팡이츠','요기요','배민','식당','음식점','분식','치킨','피자','족발','보쌈','한식','중식','일식','양식','햄버거','맥도날드','버거킹','롯데리아','편의점도시락'], catId: 'food', type: 'expense' },

  // 마트/생활
  { keywords: ['이마트','홈플러스','롯데마트','코스트코','마트'], catId: 'daily', type: 'expense' },
  { keywords: ['gs25','cu','세븐일레븐','미니스톱','편의점','씨유'], catId: 'daily', type: 'expense' },
  { keywords: ['다이소','올리브영','드럭스토어'], catId: 'daily', type: 'expense' },

  // 쇼핑
  { keywords: ['쿠팡','11번가','옥션','지마켓','무신사','ably','에이블리','아이허브','네이버쇼핑','카카오쇼핑'], catId: 'shopping', type: 'expense' },

  // 통신
  { keywords: ['skt','kt','lg유플','통신','핸드폰','휴대폰','인터넷요금','알뜰폰'], catId: 'communication', type: 'expense' },

  // 보험
  { keywords: ['보험료','삼성생명','한화생명','kb생명','메리츠','db손해','현대해상','흥국생명'], catId: 'insurance', type: 'expense' },

  // 공과금
  { keywords: ['전기요금','한전','전기세'], catId: 'electricity', type: 'expense' },
  { keywords: ['도시가스','가스요금','가스비'], catId: 'gas', type: 'expense' },
  { keywords: ['수도요금','수도세','상수도'], catId: 'water', type: 'expense' },
  { keywords: ['관리비','아파트관리','주택관리'], catId: 'living', type: 'expense' },

  // 구독
  { keywords: ['넷플릭스','유튜브프리미엄','왓챠','웨이브','티빙','애플tv','시즌','스포티파이','구독','멜론','플로'], catId: 'subscription', type: 'expense' },

  // 여행
  { keywords: ['여행','숙박','호텔','에어비앤비','항공','비행기','에어','숙소'], catId: 'travel', type: 'expense' },

  // 교육
  { keywords: ['학원','도서','책','교육','온라인강의','인프런','클래스101'], catId: 'selfdev', type: 'expense' },

  // 경조사
  { keywords: ['경조사','축의금','조의금','선물','화환'], catId: 'gift', type: 'expense' },

  // 의료
  { keywords: ['병원','의원','약국','치과','한의원','안과','성형','피부과','건강검진'], catId: 'health', type: 'expense' },
]

// 한국 이름 패턴 (2~4글자 한글 이름)
const KOREAN_NAME_RE = /^[가-힣]{2,4}(\(.*\))?$/

function isKoreanName(s: string): boolean {
  const base = s.replace(/\(.*\)/, '').trim()
  return KOREAN_NAME_RE.test(base) && base.length >= 2 && base.length <= 4
}

// 이체로 자동 분류할 키워드
const TRANSFER_KEYWORDS = ['이체','송금','계좌이동','모임통장','잔돈모으기','달러로모으기','외화저축','계좌간','오픈뱅킹출금','오픈뱅킹입금','전자금융']

function isTransferLike(desc: string, txType: string): boolean {
  const lower = (desc + txType).toLowerCase().replace(/\s/g, '')
  return TRANSFER_KEYWORDS.some(kw => lower.includes(kw.replace(/\s/g, '')))
}

// 토스뱅크 거래유형 → income/expense 판단
function txTypeToDir(txType: string): 'income' | 'expense' | null {
  const t = txType.trim()
  if (['입금','이자입금','환급','지원금'].includes(t)) return 'income'
  if (['출금','자동이체','결제'].includes(t)) return 'expense'
  return null
}

function suggestCategory(
  desc: string,
  txType: string,
  type: 'income' | 'expense',
  userRules: { keyword: string; categoryId: string }[] = []
): string {
  const lower = (desc + txType).toLowerCase().replace(/\s/g, '')

  // FR-08: 사용자 정의 규칙 우선 (가장 긴 키워드 기준)
  const matchedUserRules = userRules.filter(r => lower.includes(r.keyword.toLowerCase().replace(/\s/g, '')))
  if (matchedUserRules.length > 0) {
    matchedUserRules.sort((a, b) => b.keyword.length - a.keyword.length)
    return matchedUserRules[0].categoryId
  }

  for (const rule of KEYWORD_MAP) {
    if (rule.type !== type) continue
    if (rule.keywords.some(kw => lower.includes(kw.toLowerCase().replace(/\s/g, '')))) {
      return rule.catId
    }
  }
  // 한국 이름처럼 보이면 → 기타
  if (isKoreanName(desc.trim())) {
    return type === 'expense' ? 'etc' : 'other_income'
  }
  return type === 'income' ? 'other_income' : 'etc'
}

// ── 날짜 파싱 ────────────────────────────────────────────────────────────────
function parseDate(raw: unknown): string {
  if (!raw) return new Date().toISOString().slice(0, 10)
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
  }
  // "2026.04.10 10:47:23" 형식 처리 (토스뱅크 datetime)
  const s = String(raw).trim()
  const m = s.match(/(\d{4})[.\-\/](\d{2})[.\-\/](\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return new Date().toISOString().slice(0, 10)
}

// ── 금액 파싱 ────────────────────────────────────────────────────────────────
function parseAmountSigned(raw: unknown): number {
  if (typeof raw === 'number') return raw
  const s = String(raw || '').replace(/,/g, '').replace(/원/g, '').trim()
  return parseFloat(s) || 0
}

// ── 컬럼 자동 감지 ───────────────────────────────────────────────────────────
function detectColumns(headers: string[]): Record<string, number> {
  const result: Record<string, number> = {}
  const normalized = headers.map(h => String(h || '').toLowerCase().replace(/\s/g, ''))

  const find = (candidates: string[]) =>
    normalized.findIndex(h => candidates.some(c => h.includes(c)))

  result.date       = find(['거래일시','거래일자','날짜','거래일','date','일자','년월일'])
  result.desc       = find(['적요','내용','거래내용','description','상호명','거래처'])
  result.txType     = find(['거래유형','유형','거래종류','종류','구분'])
  result.withdrawal = find(['출금액','지출액','출금금액','debit','인출'])
  result.deposit    = find(['입금액','수입액','입금금액','credit'])
  result.amount     = find(['거래금액','금액','amount'])

  return result
}

// ── 행을 ImportRow로 변환 ────────────────────────────────────────────────────
interface ImportRow {
  _key: string
  date: string
  description: string
  txType: string       // 원본 거래유형 (표시용)
  amount: number
  type: 'income' | 'expense' | 'transfer'
  categoryId: string
  accountId: string
  toAccountId: string  // 이체 시 입금계좌
  paymentMethod: PaymentMethod
  cardId?: string
  include: boolean
  autoSuggested: boolean  // 자동추천 여부 표시
}

interface TransactionImportProps {
  onClose: () => void
}

type Step = 'upload' | 'map' | 'review'
const steps: Step[] = ['upload', 'map', 'review']

export default function TransactionImport({ onClose }: TransactionImportProps) {
  const { data, categories, addTransaction, setCategories } = useApp()
  const { accounts, cards, mappingRules } = data
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')

  // 파일 처리 공통
  const [fileError, setFileError]     = useState('')
  const [fileLoading, setFileLoading] = useState(false)

  // Excel 암호
  const [xlsxPasswordNeeded, setXlsxPasswordNeeded] = useState(false)
  const [xlsxPassword, setXlsxPassword]             = useState('')
  const [xlsxPasswordError, setXlsxPasswordError]   = useState('')
  const [pendingExcelFile, setPendingExcelFile]       = useState<File | null>(null)

  // 시트 / 헤더 행 선택
  const [storedWorkbook, setStoredWorkbook]   = useState<ReturnType<typeof XLSX.read> | null>(null)
  const [sheetNames, setSheetNames]           = useState<string[]>([])
  const [selectedSheet, setSelectedSheet]     = useState('')
  const [headerRowIndex, setHeaderRowIndex]   = useState(0)   // 0-based
  const [sheetPreview, setSheetPreview]       = useState<unknown[][]>([])
  const [fileReady, setFileReady]             = useState(false)

  // PDF 관련
  const [isPDF, setIsPDF] = useState(false)
  const [pdfPassword, setPdfPassword] = useState('')
  const [pdfError, setPdfError] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawRows, setRawRows]       = useState<unknown[][]>([])

  const [colDate,       setColDate]       = useState(-1)
  const [colDesc,       setColDesc]       = useState(-1)
  const [colTxType,     setColTxType]     = useState(-1)
  const [colWithdrawal, setColWithdrawal] = useState(-1)
  const [colDeposit,    setColDeposit]    = useState(-1)
  const [colAmount,     setColAmount]     = useState(-1)

  const [rows, setRows] = useState<ImportRow[]>([])

  // 일괄 변경용 선택 상태
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkType, setBulkType]         = useState<'income' | 'expense' | 'transfer'>('expense')
  const [bulkCatId, setBulkCatId]       = useState('')

  // FR-06: 헤더 일괄 적용 상태
  const [headerType,    setHeaderType]    = useState<'income' | 'expense' | 'transfer' | ''>('')
  const [headerCatId,   setHeaderCatId]   = useState('')
  const [headerAccId,   setHeaderAccId]   = useState('')

  // FR-07: 새 카테고리 추가
  const [newCatRowKey,   setNewCatRowKey]   = useState<string | null>(null)
  const [newCatName,     setNewCatName]     = useState('')
  const [newCatType,     setNewCatType]     = useState<'income' | 'expense'>('expense')

  function toggleBulkSelect(key: string, checked: boolean) {
    setBulkSelected(prev => {
      const next = new Set(prev)
      checked ? next.add(key) : next.delete(key)
      return next
    })
  }
  function toggleBulkAll(checked: boolean) {
    setBulkSelected(checked ? new Set(rows.map(r => r._key)) : new Set())
  }
  function applyBulk() {
    if (bulkSelected.size === 0) return
    setRows(prev => prev.map(r => {
      if (!bulkSelected.has(r._key)) return r
      if (bulkType === 'transfer') {
        return { ...r, type: bulkType, categoryId: 'transfer', autoSuggested: false }
      }
      const catList = bulkType === 'income' ? incomeLeaf : expenseLeaf
      const catId = bulkCatId && catList.some(c => c.id === bulkCatId) ? bulkCatId : (catList[0]?.id || '')
      return { ...r, type: bulkType, categoryId: catId, autoSuggested: false }
    }))
    setBulkSelected(new Set())
  }

  const defaultAccountId = accounts[0]?.id || ''
  const defaultCardId    = cards[0]?.id || ''

  // FR-001: 자동 제외된 행 수
  const [excludedCount, setExcludedCount] = useState(0)
  const EXCLUDE_TX_TYPES = ['취소', '승인취소', '취소승인', '승인대기', '취소건']

  // 파일에 해당하는 계좌/카드 선택
  // importSourceId: 계좌면 accountId, 카드면 cardId
  const [importSourceId,   setImportSourceId]   = useState(defaultAccountId)
  const [importSourceType, setImportSourceType] = useState<'account' | 'card'>('account')

  // 기존 코드와의 호환성: 계좌일 때 importAccountId = importSourceId
  const importAccountId = importSourceType === 'account' ? importSourceId : defaultAccountId
  const importCardId    = importSourceType === 'card'    ? importSourceId : defaultCardId
  const secondAccountId = accounts.find(a => a.id !== importAccountId)?.id || importAccountId

  function selectImportSource(id: string, type: 'account' | 'card') {
    setImportSourceId(id)
    setImportSourceType(type)
  }

  // ── 워크북 공통 처리 ───────────────────────────────────────────────────────
  function getSheetPreviewRows(wb: ReturnType<typeof XLSX.read>, sheetName: string): unknown[][] {
    const ws = wb.Sheets[sheetName]
    if (!ws) return []
    const all = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
    return all.slice(0, 12)
  }

  function processWorkbook(wb: ReturnType<typeof XLSX.read>) {
    const names = wb.SheetNames
    setStoredWorkbook(wb)
    setSheetNames(names)
    setSelectedSheet(names[0])
    setHeaderRowIndex(0)
    setSheetPreview(getSheetPreviewRows(wb, names[0]))
    setFileReady(true)
  }

  function applySheetConfig(wb: ReturnType<typeof XLSX.read>, sheet: string, hdrIdx: number) {
    const ws = wb.Sheets[sheet]
    if (!ws) return
    const allData = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
    if (allData.length <= hdrIdx) { setFileError('헤더 행이 데이터 범위를 벗어납니다.'); return }
    const headers = (allData[hdrIdx] as unknown[]).map(h => String(h || ''))
    const body    = allData.slice(hdrIdx + 1) as unknown[][]
    setRawHeaders(headers)
    setRawRows(body)
    const detected = detectColumns(headers)
    setColDate(detected.date ?? -1)
    setColDesc(detected.desc ?? -1)
    setColTxType(detected.txType ?? -1)
    setColWithdrawal(detected.withdrawal ?? -1)
    setColDeposit(detected.deposit ?? -1)
    setColAmount(detected.amount ?? -1)
    setStep('map')
  }

  // ── 파일 파싱 ──────────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setFileName(file.name)
    setFileError('')
    setFileReady(false)
    setXlsxPasswordNeeded(false)
    setXlsxPassword('')
    setXlsxPasswordError('')

    if (file.name.toLowerCase().endsWith('.pdf')) {
      setIsPDF(true)
      setPendingFile(file)
      setPdfPassword('')
      setPdfError('')
      return
    }

    setIsPDF(false)
    setFileLoading(true)
    try {
      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array', cellDates: false })
      processWorkbook(wb)
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
      if (msg.includes('password') || msg.includes('encrypted') || msg.includes('cfb')) {
        setPendingExcelFile(file)
        setXlsxPasswordNeeded(true)
      } else {
        setFileError('파일을 읽을 수 없습니다. 지원 형식: .xlsx, .xls, .csv')
      }
    }
    setFileLoading(false)
  }

  // ── Excel 암호 해제 ────────────────────────────────────────────────────────
  async function handleExcelWithPassword() {
    if (!pendingExcelFile) return
    setXlsxPasswordError('')
    setFileLoading(true)
    try {
      const buf = await pendingExcelFile.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array', cellDates: false, password: xlsxPassword })
      setXlsxPasswordNeeded(false)
      processWorkbook(wb)
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
      if (msg.includes('password') || msg.includes('incorrect') || msg.includes('encrypted')) {
        setXlsxPasswordError('비밀번호가 틀렸습니다. 다시 확인해주세요.')
      } else {
        setXlsxPasswordError('파일 처리 중 오류가 발생했습니다.')
      }
    }
    setFileLoading(false)
  }

  // ── PDF 파싱 실행 ──────────────────────────────────────────────────────────
  async function handlePDFParse() {
    if (!pendingFile) return
    setPdfLoading(true)
    setPdfError('')
    try {
      const rawTextRows = await extractPDFRows(pendingFile, pdfPassword || undefined)
      const parsed = parseKBBankRows(rawTextRows, importAccountId, secondAccountId)

      if (parsed.length === 0) {
        setPdfError('거래 내역을 인식하지 못했습니다. 지원 형식: KB국민은행')
        setPdfLoading(false)
        return
      }

      // 카테고리 검증 및 보정 + 카드 소스 반영
      const incomeLeaf  = categories.filter(c => c.type === 'income'  && c.parentId !== null)
      const expenseLeaf = categories.filter(c => c.type === 'expense' && c.parentId !== null)
      const fixed = parsed.map(r => {
        if (r.type === 'transfer') return r
        const catList = r.type === 'income' ? incomeLeaf : expenseLeaf
        const exists  = catList.some(c => c.id === r.categoryId)
        return {
          ...r,
          categoryId: exists ? r.categoryId : (catList[0]?.id || ''),
          paymentMethod: (importSourceType === 'card' ? 'card' : 'account') as PaymentMethod,
          cardId: importSourceType === 'card' ? importCardId : undefined,
          accountId: importAccountId,
        }
      })

      setRows(fixed)
      setStep('review')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('password')) {
        setPdfError('비밀번호가 틀렸습니다.')
      } else {
        setPdfError('PDF 파싱 중 오류가 발생했습니다.')
      }
    }
    setPdfLoading(false)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  // ── 매핑 확인 → 검토 단계 ─────────────────────────────────────────────────
  function buildRows() {
    const incomeLeaf  = categories.filter(c => c.type === 'income'  && c.parentId !== null)
    const expenseLeaf = categories.filter(c => c.type === 'expense' && c.parentId !== null)

    const importRows: ImportRow[] = []
    let skipped = 0

    rawRows.forEach((row, i) => {
      const dateVal   = colDate       >= 0 ? row[colDate]       : ''
      const descVal   = colDesc       >= 0 ? row[colDesc]       : ''
      const txTypeVal = colTxType     >= 0 ? row[colTxType]     : ''
      const withVal   = colWithdrawal >= 0 ? row[colWithdrawal] : ''
      const depVal    = colDeposit    >= 0 ? row[colDeposit]    : ''
      const amtVal    = colAmount     >= 0 ? row[colAmount]     : ''

      const desc   = String(descVal   || '').trim()
      const txType = String(txTypeVal || '').trim()
      const date   = parseDate(dateVal)

      // FR-001: 취소 건 자동 제외
      if (txType && EXCLUDE_TX_TYPES.some(k => txType.includes(k))) {
        skipped++
        return
      }

      let amount: number
      let type: 'income' | 'expense'

      if (colWithdrawal >= 0 || colDeposit >= 0) {
        // 출금/입금 분리 컬럼 형식
        const withdrawal = Math.abs(parseAmountSigned(withVal))
        const deposit    = Math.abs(parseAmountSigned(depVal))
        if (deposit > 0 && withdrawal === 0) {
          amount = deposit; type = 'income'
        } else if (withdrawal > 0 && deposit === 0) {
          amount = withdrawal; type = 'expense'
        } else if (deposit > 0) {
          amount = deposit; type = 'income'
        } else {
          amount = withdrawal; type = 'expense'
        }
      } else {
        // 단일 금액 컬럼 (토스뱅크: 음수=지출, 양수=수입)
        const signed = parseAmountSigned(amtVal)
        if (signed === 0) return
        // FR-09: 카드 소스일 경우 기본값 지출
        if (importSourceType === 'card') {
          type = 'expense'
        } else {
          const dirFromType = txType ? txTypeToDir(txType) : null
          if (dirFromType) {
            type = dirFromType
          } else {
            type = signed < 0 ? 'expense' : 'income'
          }
        }
        amount = Math.abs(signed)
      }

      // FR-09: 출금/입금 분리 컬럼에서도 카드면 expense 우선
      if (importSourceType === 'card' && type === 'income' && colWithdrawal < 0) {
        type = 'expense'
      }

      if (amount === 0) return

      // 이체 자동 감지
      const isTransfer = isTransferLike(desc, txType)
      const finalType: 'income' | 'expense' | 'transfer' = isTransfer ? 'transfer' : type

      let categoryId = 'transfer'
      let autoSuggested = false
      if (!isTransfer) {
        const suggestedCatId = suggestCategory(desc, txType, type, mappingRules)
        const catList = type === 'income' ? incomeLeaf : expenseLeaf
        const catExists = catList.some(c => c.id === suggestedCatId)
        categoryId = catExists ? suggestedCatId : (catList[0]?.id || '')
        autoSuggested = catExists && suggestedCatId !== (type === 'income' ? 'other_income' : 'etc')
      }

      importRows.push({
        _key: `import_${i}_${Date.now()}`,
        date,
        description: desc || '(내용 없음)',
        txType,
        amount,
        type: finalType,
        categoryId,
        accountId: importAccountId,
        toAccountId: secondAccountId,
        paymentMethod: importSourceType === 'card' ? 'card' : 'account',
        cardId: importSourceType === 'card' ? importCardId : defaultCardId,
        include: true,
        autoSuggested,
      })
    })

    setExcludedCount(skipped)
    setRows(importRows)
    setStep('review')
  }

  // ── 행 업데이트 ───────────────────────────────────────────────────────────
  function updateRow(key: string, patch: Partial<ImportRow>) {
    setRows(rs => rs.map(r => r._key === key ? { ...r, ...patch } : r))
  }

  // FR-07: 새 카테고리 추가 + 기초설정 자동 동기화
  function addNewCategory(rowKey: string) {
    const name = newCatName.trim()
    if (!name) return
    if (categories.some(c => c.name === name)) {
      alert('이미 존재하는 카테고리입니다')
      return
    }
    const parentId = newCatType === 'income' ? 'pg_income' : 'pg_etc'
    const newCat: Category = {
      id: `cat_${Date.now()}`,
      name,
      type: newCatType,
      icon: newCatType === 'income' ? '💰' : '📦',
      color: '#CFD8DC',
      parentId,
    }
    setCategories([...categories, newCat])
    updateRow(rowKey, { categoryId: newCat.id, type: newCatType, autoSuggested: false })
    setNewCatRowKey(null)
    setNewCatName('')
  }

  // FR-06: 헤더 일괄 적용
  function applyHeaderType(t: 'income' | 'expense' | 'transfer') {
    setHeaderType(t)
    setRows(prev => prev.map(r => {
      if (t === 'transfer') return { ...r, type: 'transfer', categoryId: 'transfer', autoSuggested: false }
      const cats = t === 'income' ? incomeLeaf : expenseLeaf
      return { ...r, type: t, categoryId: cats[0]?.id || '', autoSuggested: false }
    }))
  }
  function applyHeaderCat(catId: string) {
    setHeaderCatId(catId)
    setRows(prev => prev.map(r => r.type !== 'transfer' ? { ...r, categoryId: catId, autoSuggested: false } : r))
  }
  function applyHeaderAcc(accId: string) {
    setHeaderAccId(accId)
    setRows(prev => prev.map(r => ({ ...r, accountId: accId })))
  }

  function toggleAll(checked: boolean) {
    setRows(rs => rs.map(r => ({ ...r, include: checked })))
  }

  // ── 최종 반영 ─────────────────────────────────────────────────────────────
  function handleImport() {
    const selected = rows.filter(r => r.include && r.amount > 0)
    selected.forEach(r => {
      let tx: Transaction
      if (r.type === 'transfer') {
        tx = {
          id: `t${Date.now()}_${Math.random().toString(36).slice(2)}`,
          date: r.date,
          description: r.description || '계좌 이체',
          amount: r.amount,
          type: 'transfer',
          accountId: r.accountId,
          toAccountId: r.toAccountId,
          categoryId: 'transfer',
          paymentMethod: 'account',
        }
      } else {
        tx = {
          id: `t${Date.now()}_${Math.random().toString(36).slice(2)}`,
          date: r.date,
          description: r.description,
          amount: r.amount,
          type: r.type,
          accountId: r.accountId,
          categoryId: r.categoryId,
          paymentMethod: r.paymentMethod,
          cardId: r.paymentMethod === 'card' ? r.cardId : undefined,
        }
      }
      addTransaction(tx)
    })
    onClose()
  }

  const incomeLeaf    = categories.filter(c => c.type === 'income'  && c.parentId !== null)
  const expenseLeaf   = categories.filter(c => c.type === 'expense' && c.parentId !== null)
  const selectedCount = rows.filter(r => r.include).length
  const suggestedCount = rows.filter(r => r.include && r.autoSuggested).length

  const headerOptions = (
    <>
      <option value={-1}>— 선택 안함 —</option>
      {rawHeaders.map((h, i) => <option key={i} value={i}>{h || `열 ${i+1}`}</option>)}
    </>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[95vh]">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-gray-900">엑셀 가져오기</h2>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              {steps.map((s, i) => (
                <span key={s} className="flex items-center gap-1">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    step === s ? 'bg-blue-600 text-white' :
                    steps.indexOf(step) > i ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-400'
                  }`}>{i+1}</span>
                  {i < 2 && <span className="text-gray-200">›</span>}
                </span>
              ))}
              <span className="ml-1">{step === 'upload' ? '파일 업로드' : step === 'map' ? '컬럼 설정' : '검토 & 수정'}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* ── Step 1: 업로드 ── */}
        {step === 'upload' && (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">

            {/* ── PDF 처리 ── */}
            {isPDF && (
              <div className="max-w-md mx-auto w-full">
                <div className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-4 flex items-start gap-3">
                  <span className="text-2xl">📄</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{fileName}</div>
                    <div className="text-xs text-gray-500 mt-0.5">PDF 거래내역 파일이 감지됐습니다</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">🏦 어느 계좌/카드 내역인가요?</label>
                    <div className="flex flex-wrap gap-2">
                      {accounts.map(acc => (
                        <button key={acc.id} onClick={() => selectImportSource(acc.id, 'account')}
                          className={`px-3 py-2 rounded-xl text-sm border transition-all ${importSourceType === 'account' && importSourceId === acc.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                          🏦 {acc.name}
                        </button>
                      ))}
                      {cards.map(card => (
                        <button key={card.id} onClick={() => selectImportSource(card.id, 'card')}
                          className={`px-3 py-2 rounded-xl text-sm border transition-all ${importSourceType === 'card' && importSourceId === card.id ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'}`}>
                          💳 {card.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1.5">🔒 비밀번호 <span className="font-normal text-gray-400">(없으면 비워두세요)</span></label>
                    <input type="password" value={pdfPassword} onChange={e => { setPdfPassword(e.target.value); setPdfError('') }}
                      onKeyDown={e => e.key === 'Enter' && handlePDFParse()}
                      placeholder="예: 생년월일 8자리 (19980915)"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
                    {pdfError && <p className="text-xs text-red-500 mt-1.5">⚠️ {pdfError}</p>}
                  </div>
                  <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-600 space-y-0.5">
                    <p>• KB국민은행: 생년월일 8자리 (예: 19980915)</p>
                    <p>• 비밀번호 없는 PDF는 그냥 확인 버튼을 누르세요</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setIsPDF(false); setFileName('') }} className="px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">← 다시 선택</button>
                    <button onClick={handlePDFParse} disabled={pdfLoading}
                      className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                      {pdfLoading ? <><span className="animate-spin">⏳</span> 분석 중...</> : '확인 → 내역 분석'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Excel: 파일 미선택 ── */}
            {!isPDF && !fileReady && !xlsxPasswordNeeded && (
              <div className="flex flex-col items-center gap-4 max-w-md mx-auto w-full">
                <div
                  className={`w-full border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="text-5xl mb-4">{fileLoading ? '⏳' : '📊'}</div>
                  <div className="text-sm font-semibold text-gray-700 mb-1">
                    {fileLoading ? '파일 분석 중...' : '거래내역 파일을 드래그하거나 클릭해서 선택'}
                  </div>
                  <div className="text-xs text-gray-400">.xlsx, .xls, .csv, .pdf 지원</div>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.pdf" className="hidden" onChange={onFileChange} />
                </div>
                {fileError && <p className="text-xs text-red-500 text-center">⚠️ {fileError}</p>}
                <div className="text-xs text-gray-400 text-center space-y-0.5">
                  <p>💡 토스뱅크(엑셀) · KB국민은행(PDF) 등 지원</p>
                  <p>암호 걸린 파일도 가능합니다 (Excel·PDF 모두)</p>
                </div>
              </div>
            )}

            {/* ── Excel: 암호 입력 ── */}
            {!isPDF && xlsxPasswordNeeded && (
              <div className="max-w-md mx-auto w-full space-y-4">
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-start gap-3">
                  <span className="text-2xl">🔒</span>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{fileName}</div>
                    <div className="text-xs text-amber-700 mt-0.5">암호로 보호된 Excel 파일입니다</div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Excel 파일 비밀번호</label>
                  <input type="password" value={xlsxPassword}
                    onChange={e => { setXlsxPassword(e.target.value); setXlsxPasswordError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleExcelWithPassword()}
                    placeholder="비밀번호 입력"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus />
                  {xlsxPasswordError && <p className="text-xs text-red-500 mt-1.5">⚠️ {xlsxPasswordError}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setXlsxPasswordNeeded(false); setFileName(''); fileRef.current && (fileRef.current.value = '') }}
                    className="px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">← 다시 선택</button>
                  <button onClick={handleExcelWithPassword} disabled={fileLoading || !xlsxPassword}
                    className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {fileLoading ? <><span className="animate-spin">⏳</span> 분석 중...</> : '🔓 파일 열기'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Excel: 시트·헤더 행 설정 ── */}
            {!isPDF && fileReady && storedWorkbook && (
              <div className="max-w-2xl mx-auto w-full space-y-4">
                {/* 파일명 + 다시선택 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📊</span>
                    <span className="text-sm font-semibold text-gray-800 truncate max-w-xs">{fileName}</span>
                  </div>
                  <button onClick={() => { setFileReady(false); setFileName(''); fileRef.current && (fileRef.current.value = '') }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline">다시 선택</button>
                </div>

                {/* 시트(탭) 선택 */}
                {sheetNames.length > 1 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-600 mb-2">📑 시트(탭) 선택 — <span className="font-normal text-gray-400">{sheetNames.length}개 시트 감지됨</span></div>
                    <div className="flex flex-wrap gap-1.5">
                      {sheetNames.map(name => (
                        <button key={name}
                          onClick={() => {
                            setSelectedSheet(name)
                            setHeaderRowIndex(0)
                            setSheetPreview(getSheetPreviewRows(storedWorkbook, name))
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${selectedSheet === name ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 헤더 행 선택 */}
                <div className="flex items-center gap-3 bg-blue-50 rounded-xl px-4 py-3">
                  <span className="text-xs font-semibold text-blue-700 whitespace-nowrap">컬럼명 있는 행:</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setHeaderRowIndex(i => Math.max(0, i - 1))}
                      className="w-7 h-7 rounded-lg bg-white border border-blue-200 text-blue-600 font-bold hover:bg-blue-100 transition-colors">−</button>
                    <span className="text-sm font-bold text-blue-800 w-6 text-center">{headerRowIndex + 1}</span>
                    <button onClick={() => setHeaderRowIndex(i => Math.min(sheetPreview.length - 1, i + 1))}
                      className="w-7 h-7 rounded-lg bg-white border border-blue-200 text-blue-600 font-bold hover:bg-blue-100 transition-colors">+</button>
                  </div>
                  <span className="text-xs text-blue-500">행 (아래 표에서 파란 줄이 컬럼명 행입니다)</span>
                </div>

                {/* 시트 미리보기 */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 mb-1.5">시트 미리보기</div>
                  <div className="overflow-x-auto rounded-xl border border-gray-100 max-h-56">
                    <table className="text-xs w-full">
                      <tbody>
                        {sheetPreview.map((row, i) => (
                          <tr key={i} className={i === headerRowIndex ? 'bg-blue-100 font-semibold' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className={`px-2 py-1.5 text-center w-8 border-r border-gray-100 font-mono ${i === headerRowIndex ? 'text-blue-600' : 'text-gray-300'}`}>{i + 1}</td>
                            {(row as unknown[]).slice(0, 8).map((cell, j) => (
                              <td key={j} className="px-2 py-1.5 text-gray-700 whitespace-nowrap max-w-[120px] truncate border-r border-gray-50 last:border-0">{String(cell || '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => applySheetConfig(storedWorkbook, selectedSheet, headerRowIndex)}
                    className="px-6 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
                    다음 → 컬럼 설정
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: 컬럼 매핑 ── */}
        {step === 'map' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-1">📄 <span className="font-medium">{fileName}</span></p>
              {/* FR-10: 자동 감지 결과 요약 */}
              <div className="mt-2 bg-blue-50 rounded-xl px-4 py-2.5 text-xs text-blue-700 flex flex-wrap gap-x-4 gap-y-1">
                <span className="font-semibold">🔍 자동 인식 결과:</span>
                {colDate >= 0       && <span>날짜 → <b>{rawHeaders[colDate] || `열${colDate+1}`}</b></span>}
                {colDesc >= 0       && <span>내용 → <b>{rawHeaders[colDesc] || `열${colDesc+1}`}</b></span>}
                {colTxType >= 0     && <span>거래유형 → <b>{rawHeaders[colTxType] || `열${colTxType+1}`}</b></span>}
                {colWithdrawal >= 0 && <span>출금 → <b>{rawHeaders[colWithdrawal] || `열${colWithdrawal+1}`}</b></span>}
                {colDeposit >= 0    && <span>입금 → <b>{rawHeaders[colDeposit] || `열${colDeposit+1}`}</b></span>}
                {colAmount >= 0     && <span>금액 → <b>{rawHeaders[colAmount] || `열${colAmount+1}`}</b></span>}
                {colDate < 0 && <span className="text-red-500 font-semibold">⚠ 날짜 컬럼 미인식 — 직접 선택 필요</span>}
              </div>
            </div>

            {/* 계좌/카드 선택 */}
            <div className="mb-5 p-4 bg-gray-50 rounded-2xl">
              <label className="text-xs font-semibold text-gray-600 block mb-2">
                🏦 이 파일은 어느 계좌/카드 내역인가요?
              </label>
              <div className="flex flex-wrap gap-2">
                {accounts.map(acc => (
                  <button key={acc.id}
                    onClick={() => selectImportSource(acc.id, 'account')}
                    className={`px-3 py-1.5 rounded-xl text-sm border transition-all ${
                      importSourceType === 'account' && importSourceId === acc.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}>
                    🏦 {acc.name}
                  </button>
                ))}
                {cards.map(card => (
                  <button key={card.id}
                    onClick={() => selectImportSource(card.id, 'card')}
                    className={`px-3 py-1.5 rounded-xl text-sm border transition-all ${
                      importSourceType === 'card' && importSourceId === card.id
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                    }`}>
                    💳 {card.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {[
                { label: '📅 날짜',       value: colDate,       set: setColDate,       required: true  },
                { label: '📝 내용(적요)', value: colDesc,       set: setColDesc,       required: true  },
                { label: '🏷 거래유형',   value: colTxType,     set: setColTxType,     required: false },
                { label: '📤 출금액',     value: colWithdrawal, set: setColWithdrawal, required: false },
                { label: '📥 입금액',     value: colDeposit,    set: setColDeposit,    required: false },
                { label: '💰 금액(단일)', value: colAmount,     set: setColAmount,     required: false },
              ].map(({ label, value, set, required }) => (
                <div key={label}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    {label} {required && <span className="text-red-400">*</span>}
                  </label>
                  <select
                    value={value}
                    onChange={e => set(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {headerOptions}
                  </select>
                </div>
              ))}
            </div>

            <div className="mb-4 p-3 bg-amber-50 rounded-xl text-xs text-amber-700">
              💡 <strong>토스뱅크</strong>: 거래금액 하나만 선택하세요. 음수(-) 금액은 지출, 양수(+) 금액은 수입으로 자동 구분됩니다.
            </div>

            {/* 미리보기 */}
            <div className="mb-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">파일 미리보기 (처음 5행)</div>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      {rawHeaders.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h || `열${i+1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        {rawHeaders.map((_, j) => (
                          <td key={j} className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{String((row as unknown[])[j] || '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setStep('upload')} className="px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">← 뒤로</button>
              <button
                onClick={buildRows}
                disabled={colDate < 0 || colDesc < 0}
                className="px-6 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40"
              >
                다음 → 검토하기
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: 검토 & 수정 ── */}
        {step === 'review' && (
          <>
            <div className="flex-1 overflow-y-auto">
              {/* 상단 요약 */}
              <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between flex-shrink-0">
                <div className="text-sm text-blue-700 flex items-center gap-2 flex-wrap">
                  {isPDF && (
                    <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">📄 PDF 자동인식</span>
                  )}
                  총 <span className="font-bold">{rows.length + excludedCount}</span>건 중{' '}
                  <span className="font-bold">{selectedCount}</span>건의 지출 내역이 등록됩니다
                  {excludedCount > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">취소·승인 {excludedCount}건 자동 제외됨</span>
                  )}
                  {suggestedCount > 0 && (
                    <span className="text-xs text-blue-500">✨ {suggestedCount}건 카테고리 자동추천됨</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleAll(true)}  className="text-xs text-blue-600 hover:underline">전체 선택</button>
                  <button onClick={() => toggleAll(false)} className="text-xs text-gray-400 hover:underline">전체 해제</button>
                  {!isPDF && (
                    <button onClick={() => setStep('map')} className="text-xs text-gray-400 hover:underline">← 컬럼 재설정</button>
                  )}
                  {isPDF && (
                    <button onClick={() => { setStep('upload'); setRows([]) }} className="text-xs text-gray-400 hover:underline">← 다시 업로드</button>
                  )}
                </div>
              </div>

              {/* 일괄 변경 툴바 */}
              {bulkSelected.size > 0 && (
                <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-indigo-700">{bulkSelected.size}개 선택됨</span>
                  <select
                    value={bulkType}
                    onChange={e => { setBulkType(e.target.value as 'income' | 'expense' | 'transfer'); setBulkCatId('') }}
                    className="border border-indigo-200 rounded-lg px-2 py-1 text-xs text-indigo-700 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    <option value="expense">지출</option>
                    <option value="income">수입</option>
                    <option value="transfer">이체</option>
                  </select>
                  {bulkType !== 'transfer' && (
                    <select
                      value={bulkCatId}
                      onChange={e => setBulkCatId(e.target.value)}
                      className="border border-indigo-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      <option value="">-- 카테고리 선택 --</option>
                      {(bulkType === 'income' ? incomeLeaf : expenseLeaf).map(c => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={applyBulk}
                    className="px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    일괄 적용
                  </button>
                  <button
                    onClick={() => setBulkSelected(new Set())}
                    className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    선택 해제
                  </button>
                </div>
              )}

              {/* 검토 테이블 */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  {/* FR-11: sticky 헤더 + FR-06: 헤더 일괄 적용 */}
                  <thead className="sticky top-0 z-10">
                    {/* 헤더 Row 1: 컬럼명 */}
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-2 py-2.5 text-center w-8">
                        <input type="checkbox"
                          checked={rows.length > 0 && bulkSelected.size === rows.length}
                          onChange={e => toggleBulkAll(e.target.checked)}
                          className="rounded accent-indigo-600"
                          title="일괄 선택"
                        />
                      </th>
                      <th className="px-2 py-2.5 text-center w-10">
                        <input type="checkbox"
                          checked={rows.every(r => r.include)}
                          onChange={e => toggleAll(e.target.checked)}
                          className="rounded"
                          title="가져오기 포함"
                        />
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">날짜</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">내용</th>
                      {colTxType >= 0 && <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">거래유형</th>}
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">금액</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">유형</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">카테고리 / 이체계좌</th>
                      {importSourceType === 'card' ? (
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">카드</th>
                      ) : (
                        <>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">계좌</th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">결제</th>
                        </>
                      )}
                    </tr>
                    {/* FR-06: 헤더 Row 2: 전체 적용 드롭다운 */}
                    <tr className="bg-indigo-50 border-b border-indigo-100">
                      <td colSpan={2} className="px-2 py-1 text-[10px] text-indigo-500 font-semibold text-center whitespace-nowrap">전체적용</td>
                      <td className="px-3 py-1" />{/* 날짜 */}
                      <td className="px-3 py-1" />{/* 내용 */}
                      {colTxType >= 0 && <td className="px-3 py-1" />}
                      <td className="px-3 py-1" />{/* 금액 */}
                      {/* 유형 전체 적용 */}
                      <td className="px-3 py-1 text-center">
                        <select value={headerType}
                          onChange={e => applyHeaderType(e.target.value as 'income' | 'expense' | 'transfer')}
                          className="border border-indigo-200 rounded-lg px-1.5 py-0.5 text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 text-indigo-700">
                          <option value="">—</option>
                          <option value="expense">전체 지출</option>
                          <option value="income">전체 수입</option>
                          <option value="transfer">전체 이체</option>
                        </select>
                      </td>
                      {/* 카테고리 전체 적용 */}
                      <td className="px-3 py-1">
                        <select value={headerCatId}
                          onChange={e => applyHeaderCat(e.target.value)}
                          className="border border-indigo-200 rounded-lg px-1.5 py-0.5 text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 w-32">
                          <option value="">— 카테고리</option>
                          {expenseLeaf.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                          {incomeLeaf.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                        </select>
                      </td>
                      {/* 계좌 전체 적용 */}
                      {importSourceType === 'card' ? (
                        <td className="px-3 py-1" />
                      ) : (
                        <>
                          <td className="px-3 py-1">
                            <select value={headerAccId}
                              onChange={e => applyHeaderAcc(e.target.value)}
                              className="border border-indigo-200 rounded-lg px-1.5 py-0.5 text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 w-28">
                              <option value="">— 계좌</option>
                              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-1" />
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const catList = row.type === 'income' ? incomeLeaf : expenseLeaf
                      const isTransferRow = row.type === 'transfer'
                      return (
                        <tr
                          key={row._key}
                          className={`border-b border-gray-50 transition-colors ${row.include ? 'hover:bg-gray-50/50' : 'opacity-40 bg-gray-50'}`}
                        >
                          {/* 일괄선택 체크박스 */}
                          <td className="px-2 py-2 text-center">
                            <input type="checkbox"
                              checked={bulkSelected.has(row._key)}
                              onChange={e => toggleBulkSelect(row._key, e.target.checked)}
                              className="rounded accent-indigo-600" />
                          </td>
                          {/* 포함 체크박스 */}
                          <td className="px-2 py-2 text-center">
                            <input type="checkbox" checked={row.include}
                              onChange={e => updateRow(row._key, { include: e.target.checked })}
                              className="rounded" />
                          </td>
                          {/* 날짜 */}
                          <td className="px-3 py-2">
                            <input type="date" value={row.date}
                              onChange={e => updateRow(row._key, { date: e.target.value })}
                              className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </td>
                          {/* 내용 */}
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <input type="text" value={row.description}
                                onChange={e => updateRow(row._key, { description: e.target.value })}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                              {row.autoSuggested && (
                                <span title="카테고리 자동추천됨" className="text-yellow-400 text-xs">✨</span>
                              )}
                            </div>
                          </td>
                          {/* 거래유형 (원본) */}
                          {colTxType >= 0 && (
                            <td className="px-3 py-2">
                              <span className="text-xs text-gray-400 whitespace-nowrap">{row.txType}</span>
                            </td>
                          )}
                          {/* 금액 */}
                          <td className="px-3 py-2 text-right">
                            <input type="number" value={row.amount}
                              onChange={e => updateRow(row._key, { amount: Number(e.target.value) })}
                              className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-28 text-right focus:outline-none focus:ring-1 focus:ring-blue-400" />
                          </td>
                          {/* 유형 */}
                          <td className="px-3 py-2 text-center">
                            <select value={row.type}
                              onChange={e => {
                                const t = e.target.value as 'income' | 'expense' | 'transfer'
                                if (t === 'transfer') {
                                  updateRow(row._key, { type: t, categoryId: 'transfer', autoSuggested: false })
                                } else {
                                  const newCats = t === 'income' ? incomeLeaf : expenseLeaf
                                  updateRow(row._key, { type: t, categoryId: newCats[0]?.id || '', autoSuggested: false })
                                }
                              }}
                              className={`border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                                row.type === 'income'   ? 'border-emerald-200 text-emerald-700 bg-emerald-50' :
                                row.type === 'transfer' ? 'border-blue-200 text-blue-600 bg-blue-50' :
                                                         'border-red-200 text-red-600 bg-red-50'
                              }`}
                            >
                              <option value="income">수입</option>
                              <option value="expense">지출</option>
                              <option value="transfer">이체</option>
                            </select>
                          </td>
                          {/* 카테고리 or 이체 입금계좌 */}
                          <td className="px-3 py-2">
                            {isTransferRow ? (
                              <div className="flex items-center gap-1 text-xs text-blue-500 whitespace-nowrap">
                                <span>→</span>
                                <select value={row.toAccountId}
                                  onChange={e => updateRow(row._key, { toAccountId: e.target.value })}
                                  className="border border-blue-200 bg-blue-50 text-blue-700 rounded-lg px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                >
                                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <select value={row.categoryId}
                                  onChange={e => {
                                    if (e.target.value === '__new__') {
                                      setNewCatRowKey(row._key)
                                      setNewCatType(row.type === 'income' ? 'income' : 'expense')
                                      setNewCatName('')
                                    } else {
                                      updateRow(row._key, { categoryId: e.target.value, autoSuggested: false })
                                    }
                                  }}
                                  className={`border rounded-lg px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                                    row.autoSuggested ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'
                                  }`}
                                >
                                  {catList.map(c => (
                                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                                  ))}
                                  <option value="__new__">➕ 새 카테고리 추가</option>
                                </select>
                                {/* FR-07: 새 카테고리 인라인 추가 UI */}
                                {newCatRowKey === row._key && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <input
                                      autoFocus
                                      type="text"
                                      value={newCatName}
                                      onChange={e => setNewCatName(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') addNewCategory(row._key)
                                        if (e.key === 'Escape') setNewCatRowKey(null)
                                      }}
                                      placeholder="카테고리명"
                                      className="border border-indigo-300 rounded px-1.5 py-0.5 text-[10px] w-20 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                    />
                                    <button
                                      onClick={() => addNewCategory(row._key)}
                                      className="text-[10px] bg-indigo-500 text-white rounded px-1.5 py-0.5 hover:bg-indigo-600"
                                    >추가</button>
                                    <button
                                      onClick={() => setNewCatRowKey(null)}
                                      className="text-[10px] text-gray-400 hover:text-gray-600"
                                    >✕</button>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          {/* 계좌 / 카드 표시 */}
                          {importSourceType === 'card' ? (
                            <td className="px-3 py-2">
                              <span className="text-xs text-purple-600 font-medium whitespace-nowrap">
                                💳 {cards.find(c => c.id === importCardId)?.name || '카드'}
                              </span>
                            </td>
                          ) : (
                            <>
                              <td className="px-3 py-2">
                                <select value={row.accountId}
                                  onChange={e => updateRow(row._key, { accountId: e.target.value })}
                                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                >
                                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                              </td>
                              {/* 결제수단 (이체면 비활성) */}
                              <td className="px-3 py-2">
                                {isTransferRow ? (
                                  <span className="text-xs text-gray-300 px-2">—</span>
                                ) : (
                                  <select value={row.paymentMethod}
                                    onChange={e => updateRow(row._key, { paymentMethod: e.target.value as PaymentMethod })}
                                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  >
                                    <option value="account">통장</option>
                                    <option value="card">카드</option>
                                  </select>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 하단 버튼 */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-white">
              <div className="text-xs text-gray-400">
                선택된 {selectedCount}건을 거래내역에 추가합니다
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">취소</button>
                <button
                  onClick={handleImport}
                  disabled={selectedCount === 0}
                  className="px-6 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40"
                >
                  ✅ {selectedCount}건 반영하기
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
