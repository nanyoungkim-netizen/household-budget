'use client'

import { useState, useRef } from 'react'
import { useApp } from '@/lib/AppContext'
import * as XLSX from 'xlsx'

const BACKUP_VERSION = '1.1'
const SHEET_TRANSACTIONS = '거래내역'
const SHEET_SAVINGS      = '적금예금'
const SHEET_INVESTMENTS  = '투자'
const SHEET_CATEGORIES   = '카테고리'
const SHEET_BUDGETS      = '예산설정'
const SHEET_META         = '메타정보'

const TYPE_LABELS: Record<string, string> = {
  income: '수입', expense: '지출', transfer: '이체', refund: '환급',
}
const CAT_TYPE_LABELS: Record<string, string> = {
  income: '수입', expense: '지출',
}

function fmtDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function BackupPage() {
  const {
    data, categories, setTransactions, setCategories, setBudgets, setSavings,
  } = useApp()
  const { transactions, accounts, cards, budgets, savings, investments, investmentTrades } = data

  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<'idle' | 'preview' | 'error' | 'success'>('idle')
  const [importError, setImportError] = useState('')
  const [importPreview, setImportPreview] = useState<{
    txCount: number; savingsCount: number; invCount: number
    catCount: number; budgetCount: number; dateRange: string
  } | null>(null)
  const [pendingData, setPendingData] = useState<{
    txRows: Record<string, string | number>[]
    catRows: Record<string, string | number>[]
    budgetRows: Record<string, string | number>[]
    savingsRows: Record<string, string | number>[]
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── 내보내기 ─────────────────────────────────────────────────────────────────
  function handleExport() {
    const wb = XLSX.utils.book_new()

    // 1. 거래내역 시트
    const txRows = transactions.map(t => {
      const cat = categories.find(c => c.id === t.categoryId)
      const parentCat = cat?.parentId ? categories.find(c => c.id === cat.parentId) : null
      const acc = accounts.find(a => a.id === t.accountId)
      const toAcc = t.toAccountId ? accounts.find(a => a.id === t.toAccountId) : null
      const card = t.cardId ? cards.find(c => c.id === t.cardId) : null
      return {
        날짜: t.date,
        내용: t.description,
        금액: t.amount,
        유형: TYPE_LABELS[t.type] ?? t.type,
        대분류: parentCat?.name ?? (cat?.parentId === null ? cat?.name : ''),
        소분류: cat?.parentId !== null ? (cat?.name ?? '') : '',
        계좌: acc?.name ?? '',
        받는계좌: toAcc?.name ?? '',
        카드: card?.name ?? '',
        메모: t.note ?? '',
        거래ID: t.id,
      }
    }).sort((a, b) => a.날짜.localeCompare(b.날짜))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), SHEET_TRANSACTIONS)

    // 2. 적금·예금 시트
    const savingsRows = savings.map(s => ({
      상품ID: s.id,
      상품명: s.name,
      은행: s.bank,
      종류: s.type === 'saving' ? '적금' : s.type === 'deposit' ? '예금' : '청약',
      월납입액: s.monthlyAmount,
      현재납입금: s.currentAmount,
      목표금액: s.targetAmount ?? '',
      만기예상금: s.expectedAmount,
      연이율: s.interestRate,
      이자유형: s.interestType ?? 'simple',
      과세유형: s.taxType ?? 'general',
      시작일: s.startDate,
      만기일: s.maturityDate,
      상태: s.status ?? 'active',
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(savingsRows.length ? savingsRows : [{}]), SHEET_SAVINGS)

    // 3. 투자 시트
    const invRows = investments.map(inv => {
      const trades = investmentTrades.filter(tr => tr.investmentId === inv.id)
      const totalQty   = trades.reduce((s, tr) => s + (tr.type === 'buy' ? tr.quantity : -tr.quantity), 0)
      const totalBuy   = trades.reduce((s, tr) => tr.type === 'buy' ? s + tr.price * tr.quantity : s, 0)
      return {
        종목ID: inv.id,
        종목명: inv.name,
        종목코드: inv.ticker ?? '',
        구분: inv.assetType ?? '',
        보유수량: totalQty,
        평균매입가: totalQty > 0 ? Math.round(totalBuy / totalQty) : 0,
        현재가: inv.currentPrice ?? 0,
        평가금액: (inv.currentPrice ?? 0) * totalQty,
      }
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invRows.length ? invRows : [{}]), SHEET_INVESTMENTS)

    // 4. 카테고리 시트
    const catRows = categories.map(cat => {
      const parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
      return {
        카테고리ID: cat.id,
        대분류명: parent?.name ?? (cat.parentId === null ? cat.name : ''),
        소분류명: cat.parentId !== null ? cat.name : '',
        유형: CAT_TYPE_LABELS[cat.type] ?? cat.type,
        아이콘: cat.icon,
        색상: cat.color,
        역할: cat.role ?? '',
        부모ID: cat.parentId ?? '',
      }
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRows), SHEET_CATEGORIES)

    // 5. 예산설정 시트
    const budgetRows = budgets.map(b => {
      const cat = categories.find(c => c.id === b.categoryId)
      return {
        카테고리: cat?.name ?? b.categoryId,
        카테고리ID: b.categoryId,
        연도월: b.month,
        예산금액: b.amount,
        예산ID: b.id,
      }
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(budgetRows.length ? budgetRows : [{}]), SHEET_BUDGETS)

    // 6. 메타정보 시트
    const today = fmtDate()
    const metaRows = [
      { 항목: '버전', 값: BACKUP_VERSION },
      { 항목: '내보낸날짜', 값: today },
      { 항목: '총거래건수', 값: transactions.length },
      { 항목: '적금예금수', 값: savings.length },
      { 항목: '투자종목수', 값: investments.length },
      { 항목: '카테고리수', 값: categories.length },
      { 항목: '예산설정수', 값: budgets.length },
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metaRows), SHEET_META)

    XLSX.writeFile(wb, `가계부_백업_${today}.xlsx`)
    setLastBackupDate(today)
  }

  // ── 파일 업로드 후 검증 ───────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus('idle')
    setImportError('')
    setImportPreview(null)
    setPendingData(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const rawData = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(rawData, { type: 'array' })

        // 필수 시트명 검증
        const required = [SHEET_TRANSACTIONS, SHEET_CATEGORIES, SHEET_META]
        const missing = required.filter(s => !wb.SheetNames.includes(s))
        if (missing.length > 0) {
          setImportError(`유효하지 않은 백업 파일입니다. 누락된 시트: ${missing.join(', ')}`)
          setImportStatus('error')
          return
        }

        const txRows      = XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets[SHEET_TRANSACTIONS])
        const catRows     = XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets[SHEET_CATEGORIES])
        const budgetRows  = XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets[SHEET_BUDGETS] ?? {})
        const savingsRows = wb.SheetNames.includes(SHEET_SAVINGS)
          ? XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets[SHEET_SAVINGS])
          : []

        // 열 구조 검증
        if (txRows.length > 0) {
          const requiredCols = ['날짜', '내용', '금액', '유형']
          const missingCols = requiredCols.filter(col => !(col in txRows[0]))
          if (missingCols.length > 0) {
            setImportError(`거래내역 시트 열 구조 불일치: ${missingCols.join(', ')} 열이 없습니다.`)
            setImportStatus('error')
            return
          }
        }

        // 버전 체크 (경고만)
        const metaRows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[SHEET_META])
        const versionRow = metaRows.find(r => r['항목'] === '버전')
        const fileVersion = versionRow?.['값'] ?? '?'

        const dates = txRows.map(r => String(r['날짜'])).filter(Boolean).sort()
        const dateRange = dates.length > 0 ? `${dates[0]} ~ ${dates[dates.length-1]}` : '(거래 없음)'

        setImportPreview({
          txCount: txRows.length,
          savingsCount: savingsRows.length,
          invCount: 0,
          catCount: catRows.length,
          budgetCount: budgetRows.length,
          dateRange,
        })
        setPendingData({ txRows, catRows, budgetRows, savingsRows })
        setImportStatus('preview')
        if (fileVersion !== BACKUP_VERSION) {
          setImportError(`백업 파일 버전(${fileVersion})이 현재 버전(${BACKUP_VERSION})과 다릅니다. 복구를 진행하면 일부 데이터가 누락될 수 있습니다.`)
        }
      } catch {
        setImportError('파일을 읽는 중 오류가 발생했습니다. 올바른 .xlsx 파일인지 확인하세요.')
        setImportStatus('error')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  // ── 복구 실행 ─────────────────────────────────────────────────────────────────
  function handleRestore() {
    if (!pendingData) return
    const { txRows, catRows, budgetRows, savingsRows } = pendingData

    // 카테고리 복구
    if (catRows.length > 0) {
      const restoredCats = catRows.map(r => ({
        id: String(r['카테고리ID'] || `cat_${Math.random().toString(36).slice(2)}`),
        name: String(r['소분류명'] || r['대분류명'] || ''),
        type: r['유형'] === '수입' ? 'income' as const : 'expense' as const,
        icon: String(r['아이콘'] || '📦'),
        color: String(r['색상'] || '#CFD8DC'),
        parentId: r['부모ID'] ? String(r['부모ID']) : null,
        role: r['역할'] ? r['역할'] as ('card_payment' | 'savings') : undefined,
      }))
      setCategories(restoredCats)
    }

    // 예산 복구
    if (budgetRows.length > 0) {
      const restoredBudgets = budgetRows.map(r => ({
        id: String(r['예산ID'] || `b_${Math.random().toString(36).slice(2)}`),
        categoryId: String(r['카테고리ID'] || ''),
        month: String(r['연도월'] || ''),
        amount: Number(r['예산금액']) || 0,
      }))
      setBudgets(restoredBudgets)
    }

    // 적금·예금 복구
    if (savingsRows.length > 0) {
      const typeMap: Record<string, string> = { 적금: 'saving', 예금: 'deposit', 청약: 'subscription' }
      const restoredSavings = savingsRows.map(r => ({
        id: String(r['상품ID'] || `s_${Math.random().toString(36).slice(2)}`),
        name: String(r['상품명'] || ''),
        bank: String(r['은행'] || ''),
        type: (typeMap[String(r['종류'])] || 'saving') as 'saving' | 'deposit' | 'subscription',
        monthlyAmount: Number(r['월납입액']) || 0,
        currentAmount: Number(r['현재납입금']) || 0,
        expectedAmount: Number(r['만기예상금']) || 0,
        interestRate: Number(r['연이율']) || 0,
        interestType: (r['이자유형'] as 'simple' | 'compound') || 'simple',
        taxType: (r['과세유형'] as 'general' | 'low_tax' | 'exempt') || 'general',
        startDate: String(r['시작일'] || ''),
        maturityDate: String(r['만기일'] || ''),
        status: (r['상태'] as 'active' | 'matured') || 'active',
      }))
      setSavings(restoredSavings)
    }

    // 거래내역 복구
    const txTypeMap: Record<string, string> = { 수입: 'income', 지출: 'expense', 이체: 'transfer', 환급: 'refund' }
    const restoredTxs = txRows.map(r => {
      const accName = String(r['계좌'] || '')
      const acc = accounts.find(a => a.name === accName) ?? accounts[0]
      const toAccName = String(r['받는계좌'] || '')
      const toAcc = toAccName ? accounts.find(a => a.name === toAccName) : undefined
      return {
        id: String(r['거래ID'] || `t_${Date.now()}_${Math.random().toString(36).slice(2)}`),
        date: String(r['날짜'] || ''),
        description: String(r['내용'] || ''),
        amount: Number(r['금액']) || 0,
        type: (txTypeMap[String(r['유형'])] || 'expense') as 'income' | 'expense' | 'transfer' | 'refund',
        accountId: acc?.id || '',
        toAccountId: toAcc?.id,
        categoryId: '',
        paymentMethod: 'account' as const,
        note: r['메모'] ? String(r['메모']) : undefined,
      }
    })
    setTransactions(restoredTxs)

    setImportStatus('success')
    setPendingData(null)
    setImportPreview(null)
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">💾 데이터 백업 & 복구</h1>
      </div>

      {/* 백업 섹션 */}
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-4">
        <h2 className="text-base font-bold text-gray-800 mb-1">데이터 내보내기</h2>
        <p className="text-sm text-gray-500 mb-4">
          거래내역·적금예금·투자·카테고리·예산을 엑셀 파일로 다운로드합니다.
        </p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            ['거래내역', transactions.length, 'blue'],
            ['적금·예금', savings.length, 'emerald'],
            ['투자종목', investments.length, 'purple'],
          ].map(([label, count, color]) => (
            <div key={String(label)} className={`bg-${color}-50 rounded-xl p-3 text-center`}>
              <div className={`text-lg font-bold text-${color}-600`}>{Number(count).toLocaleString('ko-KR')}</div>
              <div className={`text-xs text-${color}-400 mt-0.5`}>{label}</div>
            </div>
          ))}
        </div>
        {lastBackupDate && (
          <div className="text-xs text-gray-400 mb-3">마지막 백업: {lastBackupDate}</div>
        )}
        <button
          onClick={handleExport}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
          <span>⬇️</span>
          <span>가계부_백업_{fmtDate()}.xlsx 다운로드</span>
        </button>
        <p className="text-xs text-gray-400 mt-2 text-center">
          엑셀에서 바로 열어 데이터 확인·분석이 가능합니다
        </p>
      </div>

      {/* 복구 섹션 */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-base font-bold text-gray-800 mb-1">데이터 복구</h2>
        <p className="text-sm text-gray-500 mb-4">
          이전에 내보낸 .xlsx 파일을 업로드하면 데이터가 복구됩니다.
        </p>

        <button
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-blue-300 hover:bg-blue-50/30 transition-all">
          <span className="text-3xl">📂</span>
          <span className="text-sm font-medium text-gray-600">파일 선택 (.xlsx)</span>
          <span className="text-xs text-gray-400">백업 파일을 업로드하세요</span>
        </button>
        <input ref={fileRef} type="file" accept=".xlsx" onChange={handleFileChange} className="hidden" />

        {/* 버전 불일치 경고 (preview 상태에서만) */}
        {importStatus === 'preview' && importError && (
          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
            <div className="text-xs text-amber-700">⚠️ {importError}</div>
          </div>
        )}

        {/* 에러 */}
        {importStatus === 'error' && !importPreview && (
          <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-4">
            <div className="text-sm font-semibold text-red-600 mb-1">⚠️ 파일 오류</div>
            <div className="text-sm text-red-500">{importError}</div>
          </div>
        )}

        {/* 미리보기 */}
        {importStatus === 'preview' && importPreview && (
          <div className="mt-4">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-3">
              <div className="text-sm font-semibold text-amber-700 mb-2">📋 백업 파일 요약</div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="bg-white rounded-lg p-2 text-center">
                  <div className="text-base font-bold text-gray-800">{importPreview.txCount.toLocaleString('ko-KR')}</div>
                  <div className="text-xs text-gray-500">거래내역</div>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <div className="text-base font-bold text-gray-800">{importPreview.savingsCount}</div>
                  <div className="text-xs text-gray-500">적금·예금</div>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <div className="text-base font-bold text-gray-800">{importPreview.catCount}</div>
                  <div className="text-xs text-gray-500">카테고리</div>
                </div>
              </div>
              <div className="text-xs text-amber-600">기간: {importPreview.dateRange}</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3">
              <div className="text-xs text-red-600 font-medium">
                ⚠️ 복구 시 현재 데이터를 모두 덮어씁니다. 계속하시겠습니까?
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setImportStatus('idle'); setImportPreview(null); setPendingData(null); setImportError('') }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                취소
              </button>
              <button
                onClick={handleRestore}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors">
                복구하기
              </button>
            </div>
          </div>
        )}

        {/* 성공 */}
        {importStatus === 'success' && (
          <div className="mt-4 bg-green-50 border border-green-100 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">✅</div>
            <div className="text-sm font-semibold text-green-700">데이터 복구가 완료되었습니다</div>
            <button onClick={() => setImportStatus('idle')} className="mt-2 text-xs text-green-600 hover:text-green-800 underline">확인</button>
          </div>
        )}
      </div>

      {/* 시트 구조 안내 */}
      <div className="mt-4 bg-gray-50 rounded-2xl p-4">
        <div className="text-xs font-semibold text-gray-500 mb-2">📌 백업 파일 시트 구조 (v{BACKUP_VERSION})</div>
        <div className="space-y-1.5">
          {[
            ['거래내역', '날짜, 내용, 금액, 유형, 대분류, 소분류, 계좌, 카드, 메모'],
            ['적금예금', '상품명, 은행, 종류, 월납입액, 현재납입금, 연이율, 시작일, 만기일'],
            ['투자',     '종목명, 종목코드, 구분, 보유수량, 평균매입가, 현재가, 평가금액'],
            ['카테고리', '카테고리ID, 대분류명, 소분류명, 유형, 아이콘, 색상'],
            ['예산설정', '카테고리, 카테고리ID, 연도월, 예산금액'],
            ['메타정보', '버전, 내보낸날짜, 총거래건수'],
          ].map(([sheet, cols]) => (
            <div key={sheet} className="flex gap-2">
              <span className="text-xs font-medium text-gray-600 w-14 flex-shrink-0">{sheet}</span>
              <span className="text-xs text-gray-400">{cols}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
