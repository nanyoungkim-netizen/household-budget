'use client'

import { useState, useRef } from 'react'
import { useApp } from '@/lib/AppContext'
import { ConsumptionType } from '@/types'
import * as XLSX from 'xlsx'

const BACKUP_VERSION = '2.0'

// 시트명
const S = {
  ACCOUNTS:           '계좌',
  CARDS:              '카드',
  CATEGORIES:         '카테고리',
  BUDGETS:            '예산설정',
  SAVINGS:            '적금예금',
  GOALS:              '재무목표',
  TRANSACTIONS:       '거래내역',
  INV_ACCOUNTS:       '투자계좌',
  INV_HOLDINGS:       '보유종목',
  INV_TRADES:         '투자거래',
  META:               '메타정보',
}

function fmtDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function safeStr(v: unknown): string { return v != null ? String(v) : '' }
function safeNum(v: unknown): number { return Number(v) || 0 }

export default function BackupPage() {
  const {
    data, categories,
    setTransactions, setCategories, setBudgets, setSavings,
    setAccounts, setCards, setGoals,
    setInvestments, setInvestmentTrades, setInvestmentAccounts,
  } = useApp()
  const {
    transactions, accounts, cards, budgets, savings, goals,
    investments, investmentTrades, investmentAccounts,
  } = data

  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<'idle' | 'preview' | 'error' | 'success'>('idle')
  const [importError, setImportError] = useState('')
  const [importPreview, setImportPreview] = useState<{
    accounts: number; cards: number; categories: number; budgets: number
    savings: number; goals: number; transactions: number
    invAccounts: number; holdings: number; trades: number
    dateRange: string
  } | null>(null)
  const [pendingWb, setPendingWb] = useState<ReturnType<typeof XLSX.read> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── 내보내기 ──────────────────────────────────────────────────────────────────
  function handleExport() {
    const wb = XLSX.utils.book_new()
    const today = fmtDate()

    // 1. 계좌
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      accounts.map(a => ({
        계좌ID: a.id, 계좌명: a.name, 은행: a.bank, 잔액: a.balance,
        색상: a.color, 자산유형: a.assetType ?? 'cash', 메모: a.memo ?? '',
      }))
    ), S.ACCOUNTS)

    // 2. 카드
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      cards.map(c => ({
        카드ID: c.id, 카드명: c.name, 은행: c.bank, 결제일: c.billingDate,
        색상: c.color, 연회비금액: c.annualFeeAmount ?? '', 연회비납부일: c.annualFeeDate ?? '',
      }))
    ), S.CARDS)

    // 3. 카테고리
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      categories.map(cat => ({
        카테고리ID: cat.id, 카테고리명: cat.name,
        유형: cat.type, 아이콘: cat.icon, 색상: cat.color,
        부모ID: cat.parentId ?? '', 역할: cat.role ?? '',
        실소비제외: cat.excludeFromReal ? 'Y' : '',
      }))
    ), S.CATEGORIES)

    // 4. 예산설정
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      budgets.map(b => ({
        예산ID: b.id, 카테고리ID: b.categoryId,
        카테고리명: categories.find(c => c.id === b.categoryId)?.name ?? '',
        연도월: b.month, 예산금액: b.amount,
      }))
    ), S.BUDGETS)

    // 5. 적금·예금
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      savings.map(s => ({
        상품ID: s.id, 상품명: s.name, 은행: s.bank, 종류: s.type,
        월납입액: s.monthlyAmount, 현재납입금: s.currentAmount,
        목표금액: s.targetAmount ?? '', 만기예상금: s.expectedAmount,
        연이율: s.interestRate, 이자유형: s.interestType ?? 'simple',
        과세유형: s.taxType ?? 'general', 시작일: s.startDate,
        만기일: s.maturityDate, 상태: s.status ?? 'active',
        납입주기: s.paymentCycle ?? '', 납입일: s.paymentDay ?? '',
        납입요일: s.paymentWeekday ?? '', 회차납입금: s.paymentAmount ?? '',
        주말제외: s.skipWeekends ? 'Y' : '', 계좌번호: s.accountNumber ?? '',
      }))
    ), S.SAVINGS)

    // 6. 재무목표
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      goals.map(g => ({
        목표ID: g.id, 목표명: g.name, 목표금액: g.targetAmount,
        현재금액: g.currentAmount, 마감일: g.deadline, 색상: g.color,
        카테고리: g.goalCategory ?? '', 목표월: g.targetDate ?? '',
      }))
    ), S.GOALS)

    // 7. 거래내역 — 모든 필드 + ID 완전 보존
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      [...transactions].sort((a, b) => a.date.localeCompare(b.date)).map(t => ({
        거래ID: t.id,
        날짜: t.date,
        내용: t.description,
        금액: t.amount,
        유형: t.type,
        카테고리ID: t.categoryId,
        카테고리명: (() => {
          const cat = categories.find(c => c.id === t.categoryId)
          const par = cat?.parentId ? categories.find(c => c.id === cat.parentId) : null
          return par ? `${par.name} > ${cat?.name}` : (cat?.name ?? '')
        })(),
        계좌ID: t.accountId,
        계좌명: accounts.find(a => a.id === t.accountId)?.name ?? '',
        받는계좌ID: t.toAccountId ?? '',
        받는계좌명: t.toAccountId ? (accounts.find(a => a.id === t.toAccountId)?.name ?? '') : '',
        결제방법: t.paymentMethod,
        카드ID: t.cardId ?? '',
        카드명: t.cardId ? (cards.find(c => c.id === t.cardId)?.name ?? '') : '',
        메모: t.note ?? '',
        할부여부: t.isInstallment ? 'Y' : '',
        할부개월: t.installmentMonths ?? '',
        할부회차: t.installmentCurrent ?? '',
        청구월: t.billingMonth ?? '',
        소비유형: t.consumptionType ?? '',
        적금연결: t.savingLinks && t.savingLinks.length > 0 ? JSON.stringify(t.savingLinks) : '',
      }))
    ), S.TRANSACTIONS)

    // 8. 투자 계좌
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      investmentAccounts.map(a => ({
        투자계좌ID: a.id, 계좌명: a.name, 증권사: a.bank,
        유형ID: a.typeId, 색상: a.color,
      }))
    ), S.INV_ACCOUNTS)

    // 9. 보유 종목
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      investments.map(inv => ({
        종목ID: inv.id, 종목명: inv.name, 티커: inv.ticker ?? '',
        자산유형: inv.assetType, 통화: inv.currency,
        투자계좌ID: inv.accountId ?? '', 거래소: inv.exchange ?? '',
        현재가: inv.currentPrice ?? '', 현재가갱신: inv.currentPriceUpdatedAt ?? '',
      }))
    ), S.INV_HOLDINGS)

    // 10. 투자 거래
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      investmentTrades.map(tr => ({
        거래ID: tr.id, 종목ID: tr.investmentId, 유형: tr.type,
        날짜: tr.date, 수량: tr.quantity, 단가: tr.price,
        통화: tr.currency, 환율: tr.exchangeRate ?? '', 수수료: tr.fee ?? '',
        메모: tr.note ?? '', 현금계좌ID: tr.cashAccountId ?? '',
      }))
    ), S.INV_TRADES)

    // 11. 메타정보
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { 항목: '버전', 값: BACKUP_VERSION },
      { 항목: '내보낸날짜', 값: today },
      { 항목: '계좌수', 값: accounts.length },
      { 항목: '카드수', 값: cards.length },
      { 항목: '카테고리수', 값: categories.length },
      { 항목: '예산수', 값: budgets.length },
      { 항목: '적금예금수', 값: savings.length },
      { 항목: '목표수', 값: goals.length },
      { 항목: '거래수', 값: transactions.length },
      { 항목: '투자계좌수', 값: investmentAccounts.length },
      { 항목: '보유종목수', 값: investments.length },
      { 항목: '투자거래수', 값: investmentTrades.length },
    ]), S.META)

    XLSX.writeFile(wb, `가계부_백업_${today}.xlsx`)
    setLastBackupDate(today)
  }

  // ── 파일 읽기 & 미리보기 ───────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus('idle'); setImportError(''); setImportPreview(null); setPendingWb(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type: 'array' })

        // 필수 시트 확인
        const required = [S.TRANSACTIONS, S.CATEGORIES]
        const missing = required.filter(s => !wb.SheetNames.includes(s))
        if (missing.length > 0) {
          setImportError(`유효하지 않은 백업 파일입니다. 누락된 시트: ${missing.join(', ')}`)
          setImportStatus('error'); return
        }

        const rows = <T,>(sheet: string) =>
          wb.SheetNames.includes(sheet)
            ? XLSX.utils.sheet_to_json<T>(wb.Sheets[sheet])
            : [] as T[]

        const txRows   = rows<Record<string, unknown>>(S.TRANSACTIONS)
        const dates    = txRows.map(r => safeStr(r['날짜'])).filter(Boolean).sort()
        const dateRange = dates.length > 0 ? `${dates[0]} ~ ${dates[dates.length-1]}` : '(거래 없음)'

        // 버전 체크
        const metaRows = rows<Record<string, string>>(S.META)
        const fileVersion = metaRows.find(r => r['항목'] === '버전')?.['값'] ?? '?'

        setImportPreview({
          accounts:   rows(S.ACCOUNTS).length,
          cards:      rows(S.CARDS).length,
          categories: rows<Record<string, unknown>>(S.CATEGORIES).length,
          budgets:    rows(S.BUDGETS).length,
          savings:    rows(S.SAVINGS).length,
          goals:      rows(S.GOALS).length,
          transactions: txRows.length,
          invAccounts: rows(S.INV_ACCOUNTS).length,
          holdings:   rows(S.INV_HOLDINGS).length,
          trades:     rows(S.INV_TRADES).length,
          dateRange,
        })
        setPendingWb(wb)
        setImportStatus('preview')
        if (fileVersion !== BACKUP_VERSION) {
          setImportError(`버전 불일치: 백업 파일 v${fileVersion} → 현재 v${BACKUP_VERSION}. 일부 필드가 누락될 수 있습니다.`)
        }
      } catch {
        setImportError('파일을 읽는 중 오류가 발생했습니다. 올바른 .xlsx 파일인지 확인하세요.')
        setImportStatus('error')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  // ── 복구 실행 ──────────────────────────────────────────────────────────────────
  function handleRestore() {
    if (!pendingWb) return
    const wb = pendingWb
    const rows = <T,>(sheet: string) =>
      wb.SheetNames.includes(sheet)
        ? XLSX.utils.sheet_to_json<T>(wb.Sheets[sheet])
        : [] as T[]

    // 1. 계좌
    const accountRows = rows<Record<string, unknown>>(S.ACCOUNTS)
    if (accountRows.length > 0) {
      setAccounts(accountRows.map(r => ({
        id:        safeStr(r['계좌ID']) || `a_${Math.random().toString(36).slice(2)}`,
        name:      safeStr(r['계좌명']),
        bank:      safeStr(r['은행']),
        balance:   safeNum(r['잔액']),
        color:     safeStr(r['색상']) || '#607D8B',
        assetType: (safeStr(r['자산유형']) || 'cash') as 'cash' | 'savings' | 'investment',
        memo:      safeStr(r['메모']) || undefined,
      })))
    }

    // 2. 카드
    const cardRows = rows<Record<string, unknown>>(S.CARDS)
    if (cardRows.length > 0) {
      setCards(cardRows.map(r => ({
        id:              safeStr(r['카드ID']) || `c_${Math.random().toString(36).slice(2)}`,
        name:            safeStr(r['카드명']),
        bank:            safeStr(r['은행']),
        billingDate:     safeNum(r['결제일']) || 25,
        color:           safeStr(r['색상']) || '#607D8B',
        annualFeeAmount: r['연회비금액'] ? safeNum(r['연회비금액']) : undefined,
        annualFeeDate:   safeStr(r['연회비납부일']) || undefined,
      })))
    }

    // 3. 카테고리
    const catRows = rows<Record<string, unknown>>(S.CATEGORIES)
    if (catRows.length > 0) {
      setCategories(catRows.map(r => ({
        id:              safeStr(r['카테고리ID']) || `cat_${Math.random().toString(36).slice(2)}`,
        name:            safeStr(r['카테고리명'] ?? r['소분류명'] ?? r['대분류명']),
        type:            (safeStr(r['유형']) || 'expense') as 'income' | 'expense',
        icon:            safeStr(r['아이콘']) || '📦',
        color:           safeStr(r['색상']) || '#CFD8DC',
        parentId:        safeStr(r['부모ID']) || null,
        role:            safeStr(r['역할']) ? safeStr(r['역할']) as ('card_payment' | 'savings') : undefined,
        excludeFromReal: safeStr(r['실소비제외']) === 'Y' || undefined,
      })))
    }

    // 4. 예산
    const budgetRows = rows<Record<string, unknown>>(S.BUDGETS)
    if (budgetRows.length > 0) {
      setBudgets(budgetRows.map(r => ({
        id:         safeStr(r['예산ID']) || `b_${Math.random().toString(36).slice(2)}`,
        categoryId: safeStr(r['카테고리ID']),
        month:      safeStr(r['연도월']),
        amount:     safeNum(r['예산금액']),
      })))
    }

    // 5. 적금·예금
    const savingsRows = rows<Record<string, unknown>>(S.SAVINGS)
    if (savingsRows.length > 0) {
      const typeMap: Record<string, string> = { saving: 'saving', deposit: 'deposit', subscription: 'subscription', 적금: 'saving', 예금: 'deposit', 청약: 'subscription' }
      setSavings(savingsRows.map(r => ({
        id:             safeStr(r['상품ID']) || `s_${Math.random().toString(36).slice(2)}`,
        name:           safeStr(r['상품명']),
        bank:           safeStr(r['은행']),
        type:           (typeMap[safeStr(r['종류'])] || 'saving') as 'saving' | 'deposit' | 'subscription',
        monthlyAmount:  safeNum(r['월납입액']),
        currentAmount:  safeNum(r['현재납입금']),
        targetAmount:   r['목표금액'] ? safeNum(r['목표금액']) : undefined,
        expectedAmount: safeNum(r['만기예상금']),
        interestRate:   safeNum(r['연이율']),
        interestType:   (safeStr(r['이자유형']) || 'simple') as 'simple' | 'compound',
        taxType:        (safeStr(r['과세유형']) || 'general') as 'general' | 'low_tax' | 'exempt',
        startDate:      safeStr(r['시작일']),
        maturityDate:   safeStr(r['만기일']),
        status:         (safeStr(r['상태']) || 'active') as 'active' | 'matured',
        paymentCycle:   (safeStr(r['납입주기']) || undefined) as ('daily' | 'weekly' | 'monthly' | 'free' | undefined),
        paymentDay:     r['납입일'] ? safeNum(r['납입일']) : undefined,
        paymentWeekday: r['납입요일'] !== '' && r['납입요일'] != null ? safeNum(r['납입요일']) : undefined,
        paymentAmount:  r['회차납입금'] ? safeNum(r['회차납입금']) : undefined,
        skipWeekends:   safeStr(r['주말제외']) === 'Y' || undefined,
        accountNumber:  safeStr(r['계좌번호']) || undefined,
      })))
    }

    // 6. 재무목표
    const goalRows = rows<Record<string, unknown>>(S.GOALS)
    if (goalRows.length > 0) {
      setGoals(goalRows.map(r => ({
        id:            safeStr(r['목표ID']) || `g_${Math.random().toString(36).slice(2)}`,
        name:          safeStr(r['목표명']),
        targetAmount:  safeNum(r['목표금액']),
        currentAmount: safeNum(r['현재금액']),
        deadline:      safeStr(r['마감일']),
        color:         safeStr(r['색상']) || '#607D8B',
        goalCategory:  (safeStr(r['카테고리']) || undefined) as ('travel' | 'wedding' | 'emergency' | 'housing' | 'car' | 'education' | 'other' | undefined),
        targetDate:    safeStr(r['목표월']) || undefined,
      })))
    }

    // 7. 거래내역 — ID 직접 복원, savingLinks JSON 파싱
    const txRows = rows<Record<string, unknown>>(S.TRANSACTIONS)
    if (txRows.length > 0) {
      setTransactions(txRows.map(r => {
        let savingLinks
        const slStr = safeStr(r['적금연결'])
        if (slStr) {
          try { savingLinks = JSON.parse(slStr) } catch { /* ignore */ }
        }
        return {
          id:                  safeStr(r['거래ID']) || `t_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          date:                safeStr(r['날짜']),
          description:         safeStr(r['내용']),
          amount:              safeNum(r['금액']),
          type:                safeStr(r['유형']) as 'income' | 'expense' | 'transfer' | 'refund',
          categoryId:          safeStr(r['카테고리ID']),
          accountId:           safeStr(r['계좌ID']),
          toAccountId:         safeStr(r['받는계좌ID']) || undefined,
          paymentMethod:       (safeStr(r['결제방법']) || 'account') as 'account' | 'card',
          cardId:              safeStr(r['카드ID']) || undefined,
          note:                safeStr(r['메모']) || undefined,
          isInstallment:       safeStr(r['할부여부']) === 'Y' || undefined,
          installmentMonths:   r['할부개월'] ? safeNum(r['할부개월']) : undefined,
          installmentCurrent:  r['할부회차'] ? safeNum(r['할부회차']) : undefined,
          billingMonth:        safeStr(r['청구월']) || undefined,
          consumptionType:     safeStr(r['소비유형']) as ConsumptionType || undefined,
          savingLinks,
        }
      }))
    }

    // 8. 투자 계좌
    const invAccRows = rows<Record<string, unknown>>(S.INV_ACCOUNTS)
    if (invAccRows.length > 0) {
      setInvestmentAccounts(invAccRows.map(r => ({
        id:     safeStr(r['투자계좌ID']) || `ia_${Math.random().toString(36).slice(2)}`,
        name:   safeStr(r['계좌명']),
        bank:   safeStr(r['증권사']),
        typeId: safeStr(r['유형ID']),
        color:  safeStr(r['색상']) || '#607D8B',
      })))
    }

    // 9. 보유 종목
    const holdingRows = rows<Record<string, unknown>>(S.INV_HOLDINGS)
    if (holdingRows.length > 0) {
      setInvestments(holdingRows.map(r => ({
        id:                     safeStr(r['종목ID']) || `inv_${Math.random().toString(36).slice(2)}`,
        name:                   safeStr(r['종목명']),
        ticker:                 safeStr(r['티커']) || undefined,
        assetType:              safeStr(r['자산유형']) as 'domestic_stock' | 'foreign_stock' | 'etf_fund' | 'crypto',
        currency:               safeStr(r['통화']) as 'KRW' | 'USD' | 'USDT' | 'other',
        accountId:              safeStr(r['투자계좌ID']) || undefined,
        exchange:               safeStr(r['거래소']) || undefined,
        currentPrice:           r['현재가'] ? safeNum(r['현재가']) : undefined,
        currentPriceUpdatedAt:  safeStr(r['현재가갱신']) || undefined,
      })))
    }

    // 10. 투자 거래
    const tradeRows = rows<Record<string, unknown>>(S.INV_TRADES)
    if (tradeRows.length > 0) {
      setInvestmentTrades(tradeRows.map(r => ({
        id:            safeStr(r['거래ID']) || `tr_${Math.random().toString(36).slice(2)}`,
        investmentId:  safeStr(r['종목ID']),
        type:          safeStr(r['유형']) as 'buy' | 'sell',
        date:          safeStr(r['날짜']),
        quantity:      safeNum(r['수량']),
        price:         safeNum(r['단가']),
        currency:      safeStr(r['통화']) as 'KRW' | 'USD' | 'USDT' | 'other',
        exchangeRate:  r['환율'] ? safeNum(r['환율']) : undefined,
        fee:           r['수수료'] ? safeNum(r['수수료']) : undefined,
        note:          safeStr(r['메모']) || undefined,
        cashAccountId: safeStr(r['현금계좌ID']) || undefined,
      })))
    }

    setImportStatus('success')
    setPendingWb(null)
    setImportPreview(null)
  }

  const p = importPreview

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">💾 데이터 백업 & 복구</h1>
      </div>

      {/* 백업 섹션 */}
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-4">
        <h2 className="text-base font-bold text-gray-800 mb-1">데이터 내보내기</h2>
        <p className="text-sm text-gray-500 mb-4">
          모든 데이터(계좌·카드·카테고리·거래내역·적금예금·목표·투자)를 엑셀로 백업합니다.
          복구 시 완전히 동일하게 복원됩니다.
        </p>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: '계좌', count: accounts.length, color: 'slate' },
            { label: '거래내역', count: transactions.length, color: 'blue' },
            { label: '적금·예금', count: savings.length, color: 'emerald' },
            { label: '투자거래', count: investmentTrades.length, color: 'purple' },
          ].map(({ label, count, color }) => (
            <div key={label} className={`bg-${color}-50 rounded-xl p-3 text-center`}>
              <div className={`text-base font-bold text-${color}-600`}>{count.toLocaleString('ko-KR')}</div>
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
      </div>

      {/* 복구 섹션 */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-base font-bold text-gray-800 mb-1">데이터 복구</h2>
        <p className="text-sm text-gray-500 mb-4">
          백업 파일을 업로드하면 모든 데이터가 완전히 복원됩니다.
        </p>

        <button
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 hover:border-blue-300 hover:bg-blue-50/30 transition-all">
          <span className="text-3xl">📂</span>
          <span className="text-sm font-medium text-gray-600">파일 선택 (.xlsx)</span>
          <span className="text-xs text-gray-400">백업 파일을 업로드하세요</span>
        </button>
        <input ref={fileRef} type="file" accept=".xlsx" onChange={handleFileChange} className="hidden" />

        {importStatus === 'preview' && importError && (
          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
            <div className="text-xs text-amber-700">⚠️ {importError}</div>
          </div>
        )}

        {importStatus === 'error' && (
          <div className="mt-4 bg-red-50 border border-red-100 rounded-xl p-4">
            <div className="text-sm font-semibold text-red-600 mb-1">⚠️ 파일 오류</div>
            <div className="text-sm text-red-500">{importError}</div>
          </div>
        )}

        {importStatus === 'preview' && p && (
          <div className="mt-4">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-3">
              <div className="text-sm font-semibold text-amber-700 mb-3">📋 복구 예정 데이터</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['계좌', p.accounts], ['카드', p.cards], ['카테고리', p.categories],
                  ['예산', p.budgets], ['적금·예금', p.savings], ['재무목표', p.goals],
                  ['거래내역', p.transactions], ['투자계좌', p.invAccounts], ['투자거래', p.trades],
                ].map(([label, count]) => (
                  <div key={String(label)} className="bg-white rounded-lg p-2 text-center">
                    <div className="text-sm font-bold text-gray-800">{Number(count).toLocaleString('ko-KR')}</div>
                    <div className="text-xs text-gray-500">{label}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-amber-600 mt-2">기간: {p.dateRange}</div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3">
              <div className="text-xs text-red-600 font-medium">
                ⚠️ 복구 시 현재 데이터를 모두 덮어씁니다. 계속하시겠습니까?
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setImportStatus('idle'); setImportPreview(null); setPendingWb(null); setImportError('') }}
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

        {importStatus === 'success' && (
          <div className="mt-4 bg-green-50 border border-green-100 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">✅</div>
            <div className="text-sm font-semibold text-green-700">데이터 복구가 완료되었습니다</div>
            <button onClick={() => setImportStatus('idle')} className="mt-2 text-xs text-green-600 hover:text-green-800 underline">확인</button>
          </div>
        )}
      </div>

      <div className="mt-4 bg-gray-50 rounded-2xl p-4">
        <div className="text-xs font-semibold text-gray-500 mb-2">📌 백업 파일 시트 구성 (v{BACKUP_VERSION})</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {[
            ['계좌', '계좌ID·계좌명·은행·잔액·자산유형'],
            ['카드', '카드ID·카드명·은행·결제일'],
            ['카테고리', '카테고리ID·유형·아이콘·부모ID'],
            ['예산설정', '예산ID·카테고리ID·연도월·금액'],
            ['적금예금', '상품ID·종류·이율·만기일·상태'],
            ['재무목표', '목표ID·목표명·목표금액·마감일'],
            ['거래내역', 'ID·카테고리ID·계좌ID·카드ID·적금연결'],
            ['투자계좌', '투자계좌ID·증권사·유형'],
            ['보유종목', '종목ID·티커·자산유형·현재가'],
            ['투자거래', '거래ID·종목ID·유형·수량·단가'],
          ].map(([sheet, cols]) => (
            <div key={sheet} className="flex gap-1.5">
              <span className="text-xs font-medium text-gray-600 w-14 flex-shrink-0">{sheet}</span>
              <span className="text-xs text-gray-400">{cols}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
