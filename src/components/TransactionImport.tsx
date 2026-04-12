'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useApp } from '@/lib/AppContext'
import { Transaction, PaymentMethod } from '@/types'

// ── 키워드 → 카테고리 자동 매핑 ────────────────────────────────────────────
const KEYWORD_MAP: { keywords: string[]; catId: string; type: 'income' | 'expense' }[] = [
  // 수입
  { keywords: ['급여','월급','임금','급료','상여','인센티브','성과금'], catId: 'salary', type: 'income' },
  { keywords: ['통장이자','이자입금','이자수익','예금이자','적금이자'], catId: 'interest', type: 'income' },
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

// 토스뱅크 거래유형 → income/expense 판단
function txTypeToDir(txType: string): 'income' | 'expense' | null {
  const t = txType.trim()
  if (['입금','이자입금','환급','지원금'].includes(t)) return 'income'
  if (['출금','자동이체','결제'].includes(t)) return 'expense'
  return null
}

function suggestCategory(desc: string, txType: string, type: 'income' | 'expense'): string {
  const lower = (desc + txType).toLowerCase().replace(/\s/g, '')
  for (const rule of KEYWORD_MAP) {
    if (rule.type !== type) continue
    if (rule.keywords.some(kw => lower.includes(kw.toLowerCase().replace(/\s/g, '')))) {
      return rule.catId
    }
  }
  // 한국 이름처럼 보이면 → 지출은 송금, 수입은 other_income
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
  type: 'income' | 'expense'
  categoryId: string
  accountId: string
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
  const { data, categories, addTransaction } = useApp()
  const { accounts, cards } = data
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')

  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawRows, setRawRows]       = useState<unknown[][]>([])

  const [colDate,       setColDate]       = useState(-1)
  const [colDesc,       setColDesc]       = useState(-1)
  const [colTxType,     setColTxType]     = useState(-1)
  const [colWithdrawal, setColWithdrawal] = useState(-1)
  const [colDeposit,    setColDeposit]    = useState(-1)
  const [colAmount,     setColAmount]     = useState(-1)

  const [rows, setRows] = useState<ImportRow[]>([])

  const defaultAccountId = accounts[0]?.id || ''
  const defaultCardId    = cards[0]?.id || ''

  // ── 파일 파싱 ──────────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setFileName(file.name)
    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(buf, { type: 'array', cellDates: false })
    const ws  = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    if (data.length < 2) return alert('데이터가 없습니다.')

    const headers = (data[0] as unknown[]).map(h => String(h || ''))
    const body    = data.slice(1) as unknown[][]

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
        // 거래유형 컬럼이 있으면 우선 활용
        const dirFromType = txType ? txTypeToDir(txType) : null
        if (dirFromType) {
          type = dirFromType
        } else {
          type = signed < 0 ? 'expense' : 'income'
        }
        amount = Math.abs(signed)
      }

      if (amount === 0) return

      const suggestedCatId = suggestCategory(desc, txType, type)
      const catList = type === 'income' ? incomeLeaf : expenseLeaf
      const catExists = catList.some(c => c.id === suggestedCatId)
      const categoryId = catExists ? suggestedCatId : (catList[0]?.id || '')
      const autoSuggested = catExists && suggestedCatId !== (type === 'income' ? 'other_income' : 'etc')

      importRows.push({
        _key: `import_${i}_${Date.now()}`,
        date,
        description: desc || '(내용 없음)',
        txType,
        amount,
        type,
        categoryId,
        accountId: defaultAccountId,
        paymentMethod: 'account',
        cardId: defaultCardId,
        include: true,
        autoSuggested,
      })
    })

    setRows(importRows)
    setStep('review')
  }

  // ── 행 업데이트 ───────────────────────────────────────────────────────────
  function updateRow(key: string, patch: Partial<ImportRow>) {
    setRows(rs => rs.map(r => r._key === key ? { ...r, ...patch } : r))
  }

  function toggleAll(checked: boolean) {
    setRows(rs => rs.map(r => ({ ...r, include: checked })))
  }

  // ── 최종 반영 ─────────────────────────────────────────────────────────────
  function handleImport() {
    const selected = rows.filter(r => r.include && r.amount > 0)
    selected.forEach(r => {
      const tx: Transaction = {
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
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div
              className={`w-full max-w-md border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <div className="text-5xl mb-4">📊</div>
              <div className="text-sm font-semibold text-gray-700 mb-1">엑셀 파일을 드래그하거나 클릭해서 선택</div>
              <div className="text-xs text-gray-400">.xlsx, .xls, .csv 지원</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
            </div>
            <div className="mt-6 text-xs text-gray-400 text-center space-y-1">
              <p>💡 토스뱅크 · 카카오뱅크 · 국민은행 등 거래내역 엑셀 파일을 지원합니다</p>
              <p>음수 금액은 지출, 양수는 수입으로 자동 구분됩니다</p>
            </div>
          </div>
        )}

        {/* ── Step 2: 컬럼 매핑 ── */}
        {step === 'map' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-1">📄 <span className="font-medium">{fileName}</span></p>
              <p className="text-xs text-gray-400">자동으로 컬럼을 감지했습니다. 맞지 않으면 직접 선택하세요.</p>
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
                <div className="text-sm text-blue-700">
                  총 <span className="font-bold">{rows.length}</span>건 중{' '}
                  <span className="font-bold">{selectedCount}</span>건 선택
                  {suggestedCount > 0 && (
                    <span className="ml-2 text-xs text-blue-500">✨ {suggestedCount}건 카테고리 자동추천됨</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleAll(true)}  className="text-xs text-blue-600 hover:underline">전체 선택</button>
                  <button onClick={() => toggleAll(false)} className="text-xs text-gray-400 hover:underline">전체 해제</button>
                  <button onClick={() => setStep('map')}   className="text-xs text-gray-400 hover:underline">← 컬럼 재설정</button>
                </div>
              </div>

              {/* 검토 테이블 */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2.5 text-center w-10">
                        <input type="checkbox"
                          checked={rows.every(r => r.include)}
                          onChange={e => toggleAll(e.target.checked)}
                          className="rounded"
                        />
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">날짜</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">내용</th>
                      {colTxType >= 0 && <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">거래유형</th>}
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">금액</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500">유형</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">카테고리</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">계좌</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">결제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const catList = row.type === 'income' ? incomeLeaf : expenseLeaf
                      return (
                        <tr
                          key={row._key}
                          className={`border-b border-gray-50 transition-colors ${row.include ? 'hover:bg-gray-50/50' : 'opacity-40 bg-gray-50'}`}
                        >
                          {/* 체크박스 */}
                          <td className="px-3 py-2 text-center">
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
                                const t = e.target.value as 'income' | 'expense'
                                const newCats = t === 'income' ? incomeLeaf : expenseLeaf
                                updateRow(row._key, { type: t, categoryId: newCats[0]?.id || '', autoSuggested: false })
                              }}
                              className={`border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                                row.type === 'income'
                                  ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                                  : 'border-red-200 text-red-600 bg-red-50'
                              }`}
                            >
                              <option value="income">수입</option>
                              <option value="expense">지출</option>
                            </select>
                          </td>
                          {/* 카테고리 */}
                          <td className="px-3 py-2">
                            <select value={row.categoryId}
                              onChange={e => updateRow(row._key, { categoryId: e.target.value, autoSuggested: false })}
                              className={`border rounded-lg px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                                row.autoSuggested ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'
                              }`}
                            >
                              {catList.map(c => (
                                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                              ))}
                            </select>
                          </td>
                          {/* 계좌 */}
                          <td className="px-3 py-2">
                            <select value={row.accountId}
                              onChange={e => updateRow(row._key, { accountId: e.target.value })}
                              className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            >
                              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </td>
                          {/* 결제수단 */}
                          <td className="px-3 py-2">
                            <select value={row.paymentMethod}
                              onChange={e => updateRow(row._key, { paymentMethod: e.target.value as PaymentMethod })}
                              className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            >
                              <option value="account">통장</option>
                              <option value="card">카드</option>
                            </select>
                          </td>
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
