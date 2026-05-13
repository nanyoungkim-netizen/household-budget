'use client'

import { useState, useRef } from 'react'
import { useApp } from '@/lib/AppContext'
import * as XLSX from 'xlsx'

const BACKUP_VERSION = '1.0'
const SHEET_TRANSACTIONS = '거래내역'
const SHEET_CATEGORIES = '카테고리'
const SHEET_BUDGETS = '예산설정'
const SHEET_META = '메타정보'

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
    data, categories, setTransactions, setCategories, setBudgets,
    addTransaction, setAccounts, setSavings,
  } = useApp()
  const { transactions, accounts, cards, budgets, savings } = data

  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<'idle' | 'preview' | 'error' | 'success'>('idle')
  const [importError, setImportError] = useState('')
  const [importPreview, setImportPreview] = useState<{
    txCount: number; catCount: number; budgetCount: number
    dateRange: string
  } | null>(null)
  const [pendingData, setPendingData] = useState<{
    txRows: Record<string, string>[]
    catRows: Record<string, string>[]
    budgetRows: Record<string, string>[]
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── 내보내기 ─────────────────────────────────────────────────────────────────
  function handleExport() {
    const wb = XLSX.utils.book_new()

    // 거래내역 시트
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
    const txSheet = XLSX.utils.json_to_sheet(txRows)
    XLSX.utils.book_append_sheet(wb, txSheet, SHEET_TRANSACTIONS)

    // 카테고리 시트
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
    const catSheet = XLSX.utils.json_to_sheet(catRows)
    XLSX.utils.book_append_sheet(wb, catSheet, SHEET_CATEGORIES)

    // 예산설정 시트
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
    const budgetSheet = XLSX.utils.json_to_sheet(budgetRows)
    XLSX.utils.book_append_sheet(wb, budgetSheet, SHEET_BUDGETS)

    // 메타정보 시트
    const today = fmtDate()
    const metaRows = [
      { 항목: '버전', 값: BACKUP_VERSION },
      { 항목: '내보낸날짜', 값: today },
      { 항목: '총거래건수', 값: transactions.length },
      { 항목: '카테고리수', 값: categories.length },
      { 항목: '예산설정수', 값: budgets.length },
    ]
    const metaSheet = XLSX.utils.json_to_sheet(metaRows)
    XLSX.utils.book_append_sheet(wb, metaSheet, SHEET_META)

    const fileName = `가계부_백업_${today}.xlsx`
    XLSX.writeFile(wb, fileName)
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
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })

        // 시트명 검증
        const required = [SHEET_TRANSACTIONS, SHEET_CATEGORIES, SHEET_BUDGETS, SHEET_META]
        const missing = required.filter(s => !wb.SheetNames.includes(s))
        if (missing.length > 0) {
          setImportError(`유효하지 않은 백업 파일입니다. 누락된 시트: ${missing.join(', ')}`)
          setImportStatus('error')
          return
        }

        const txRows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[SHEET_TRANSACTIONS])
        const catRows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[SHEET_CATEGORIES])
        const budgetRows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[SHEET_BUDGETS])

        // 열 구조 검증
        if (txRows.length > 0) {
          const requiredCols = ['날짜', '내용', '금액', '유형']
          const missing = requiredCols.filter(col => !(col in txRows[0]))
          if (missing.length > 0) {
            setImportError(`거래내역 시트 열 구조 불일치: ${missing.join(', ')} 열이 없습니다.`)
            setImportStatus('error')
            return
          }
        }

        // 미리보기 정보
        const dates = txRows.map(r => r['날짜']).filter(Boolean).sort()
        const dateRange = dates.length > 0
          ? `${dates[0]} ~ ${dates[dates.length-1]}`
          : '(거래 없음)'

        setImportPreview({ txCount: txRows.length, catCount: catRows.length, budgetCount: budgetRows.length, dateRange })
        setPendingData({ txRows, catRows, budgetRows })
        setImportStatus('preview')
      } catch {
        setImportError('파일을 읽는 중 오류가 발생했습니다. 올바른 .xlsx 파일인지 확인하세요.')
        setImportStatus('error')
      }
    }
    reader.readAsArrayBuffer(file)
    // input 값 초기화 (같은 파일 재선택 가능하도록)
    e.target.value = ''
  }

  // ── 복구 실행 ─────────────────────────────────────────────────────────────────
  function handleRestore() {
    if (!pendingData) return
    const { txRows, catRows, budgetRows } = pendingData

    // 카테고리 복구
    if (catRows.length > 0) {
      const restoredCats = catRows.map(r => ({
        id: r['카테고리ID'] || `cat_${Math.random().toString(36).slice(2)}`,
        name: r['소분류명'] || r['대분류명'] || '',
        type: r['유형'] === '수입' ? 'income' as const : 'expense' as const,
        icon: r['아이콘'] || '📦',
        color: r['색상'] || '#CFD8DC',
        parentId: r['부모ID'] || null,
        role: r['역할'] ? r['역할'] as ('card_payment' | 'savings') : undefined,
      }))
      setCategories(restoredCats)
    }

    // 예산 복구
    if (budgetRows.length > 0) {
      const restoredBudgets = budgetRows.map(r => ({
        id: r['예산ID'] || `b_${Math.random().toString(36).slice(2)}`,
        categoryId: r['카테고리ID'] || '',
        month: r['연도월'] || '',
        amount: Number(r['예산금액']) || 0,
      }))
      setBudgets(restoredBudgets)
    }

    // 거래내역 복구
    const typeMap: Record<string, string> = { 수입: 'income', 지출: 'expense', 이체: 'transfer', 환급: 'refund' }
    const allAccounts = [...accounts]
    const restoredTxs = txRows.map(r => {
      const accName = r['계좌'] || ''
      const acc = allAccounts.find(a => a.name === accName) ?? allAccounts[0]
      const toAccName = r['받는계좌'] || ''
      const toAcc = toAccName ? allAccounts.find(a => a.name === toAccName) : undefined
      return {
        id: r['거래ID'] || `t_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        date: r['날짜'] || '',
        description: r['내용'] || '',
        amount: Number(r['금액']) || 0,
        type: (typeMap[r['유형']] || 'expense') as 'income' | 'expense' | 'transfer' | 'refund',
        accountId: acc?.id || '',
        toAccountId: toAcc?.id,
        categoryId: r['카테고리ID'] || r['소분류명'] || r['대분류명'] || '',
        paymentMethod: 'account' as const,
        note: r['메모'] || undefined,
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
          현재까지 입력된 모든 거래내역, 카테고리, 예산 설정을 엑셀 파일로 다운로드합니다.
        </p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-blue-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-blue-600">{transactions.length.toLocaleString('ko-KR')}</div>
            <div className="text-xs text-blue-400 mt-0.5">거래내역</div>
          </div>
          <div className="bg-purple-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-purple-600">{categories.length}</div>
            <div className="text-xs text-purple-400 mt-0.5">카테고리</div>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-green-600">{budgets.length}</div>
            <div className="text-xs text-green-400 mt-0.5">예산 설정</div>
          </div>
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
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* 에러 */}
        {importStatus === 'error' && (
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
                  <div className="text-base font-bold text-gray-800">{importPreview.catCount}</div>
                  <div className="text-xs text-gray-500">카테고리</div>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <div className="text-base font-bold text-gray-800">{importPreview.budgetCount}</div>
                  <div className="text-xs text-gray-500">예산 설정</div>
                </div>
              </div>
              <div className="text-xs text-amber-600">기간: {importPreview.dateRange}</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3">
              <div className="text-xs text-red-600 font-medium">
                ⚠️ 복구 시 현재 거래내역, 카테고리, 예산 데이터가 백업 파일로 덮어씌워집니다.
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setImportStatus('idle'); setImportPreview(null); setPendingData(null) }}
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
            <button
              onClick={() => setImportStatus('idle')}
              className="mt-2 text-xs text-green-600 hover:text-green-800 underline">
              확인
            </button>
          </div>
        )}
      </div>

      {/* 안내 */}
      <div className="mt-4 bg-gray-50 rounded-2xl p-4">
        <div className="text-xs font-semibold text-gray-500 mb-2">📌 백업 파일 시트 구조</div>
        <div className="space-y-1.5">
          {[
            ['거래내역', '날짜, 내용, 금액, 유형, 대분류, 소분류, 계좌, 카드, 메모'],
            ['카테고리', '카테고리ID, 대분류명, 소분류명, 유형, 아이콘, 색상'],
            ['예산설정', '카테고리, 카테고리ID, 연도월, 예산금액'],
            ['메타정보', '버전, 내보낸날짜, 총거래건수'],
          ].map(([sheet, cols]) => (
            <div key={sheet} className="flex gap-2">
              <span className="text-xs font-medium text-gray-600 w-16 flex-shrink-0">{sheet}</span>
              <span className="text-xs text-gray-400">{cols}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
