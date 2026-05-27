'use client'

import { useState, useRef } from 'react'
import { useApp, MultiData } from '@/lib/AppContext'
import { ConsumptionType, InvestmentSubType } from '@/types'
import * as XLSX from 'xlsx'

const BACKUP_VERSION = '3.1'

// 시트명
const S = {
  // ★ 자동 백업 시트 — 새 기능이 추가돼도 이 시트가 항상 전체를 커버함
  RAW_DATA:           '__raw_data__',
  // 사람이 읽을 수 있는 개별 시트
  ACCOUNTS:           '계좌',
  CARDS:              '카드',
  CATEGORIES:         '카테고리',
  BUDGETS:            '예산설정',
  SAVINGS:            '적금예금',
  SAVING_PAYMENTS:    '적금납입이력',
  GOALS:              '재무목표',
  GOAL_PAYMENTS:      '목표납입이력',
  TRANSACTIONS:       '거래내역',
  INSTALLMENTS:       '할부내역',
  CARD_BILLINGS:      '카드청구납부',
  MAPPING_RULES:      '매핑규칙',
  INV_ACCOUNTS:       '투자계좌',
  INV_ACCOUNT_TYPES:  '투자계좌유형',
  INV_HOLDINGS:       '보유종목',
  INV_TRADES:         '투자거래',
  INV_DIVIDENDS:      '투자배당금',
  INV_CASH_DEPOSITS:  '예수금내역',
  PORTFOLIO_PLANS:    '포트폴리오',
  WATCHLIST:          '관심종목',
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
    data, multiData, categories,
    setTransactions, setCategories, setBudgets, setSavings, setSavingPayments,
    setAccounts, setCards, setGoals, setGoalPayments, setCardBillings,
    setInstallments, setMappingRules,
    setInvestments, setInvestmentTrades, setInvestmentAccounts, setInvestmentDividends,
    setInvestmentCashDeposits, setInvestmentAccountTypes, setPortfolioPlans, setWatchlist,
    restoreBudgetData, restoreAllData,
  } = useApp()
  const {
    transactions, accounts, cards, budgets, savings, goals,
    investments, investmentTrades, investmentAccounts, investmentDividends,
    investmentCashDeposits, investmentAccountTypes, portfolioPlans, watchlist,
    savingPayments, goalPayments, cardBillings, installments, mappingRules,
  } = data

  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<'idle' | 'preview' | 'error' | 'success'>('idle')
  const [importError, setImportError] = useState('')
  const [importPreview, setImportPreview] = useState<{
    budgetCount: number    // ★ 포함된 가계부 수
    accounts: number; cards: number; categories: number; budgets: number
    savings: number; savingPayments: number; goals: number; goalPayments: number
    transactions: number; installments: number; cardBillings: number; mappingRules: number
    invAccounts: number; holdings: number; trades: number
    dividends: number; cashDeposits: number; portfolioPlans: number; watchlist: number
    dateRange: string
    usedRawJson: boolean  // ★ true면 JSON 시트로 완전 복원, false면 구 시트별 방식
  } | null>(null)
  const [pendingWb, setPendingWb] = useState<ReturnType<typeof XLSX.read> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── 내보내기 ──────────────────────────────────────────────────────────────────
  function handleExport() {
    setExportError(null)
    try {
    const wb = XLSX.utils.book_new()
    const today = fmtDate()

    // ★ 0. 전체 데이터 JSON 시트 (자동 완전 백업 — 새 기능·새 가계부도 자동 포함)
    //    복구 시 이 시트를 우선 사용하므로 아래 개별 시트들은 "사람이 읽기 위한 참고용"
    //    multiData 전체를 저장 → 가계부가 여러 개여도 모두 백업됨
    //    JSON이 길어도 청크로 분할해서 셀 한도(32767자) 초과 방지
    const rawJson = JSON.stringify(multiData)
    const CHUNK = 30000
    const chunks = Array.from({ length: Math.ceil(rawJson.length / CHUNK) }, (_, i) =>
      rawJson.slice(i * CHUNK, (i + 1) * CHUNK)
    )
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      chunks.map((chunk, i) => ({
        version: i === 0 ? BACKUP_VERSION : '',
        date: i === 0 ? today : '',
        budgetCount: i === 0 ? multiData.budgetList.length : '',
        part: i + 1,
        total: chunks.length,
        json: chunk,
      }))
    ), S.RAW_DATA)

    // 1. 계좌
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      accounts.map(a => ({
        계좌ID: a.id, 계좌명: a.name, 은행: a.bank, 잔액: a.balance,
        색상: a.color, 자산유형: a.assetType ?? 'cash',
        투자세부유형: a.investmentSubType ?? '', 메모: a.memo ?? '', 계좌번호: a.accountNumber ?? '',
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
        실제수령이자: s.actualInterest ?? '', 메모: s.memo ?? '',
      }))
    ), S.SAVINGS)

    // 6. 적금 납입이력
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      (savingPayments ?? []).map(p => ({
        납입ID: p.id, 상품ID: p.savingId, 납입일: p.date, 납입금액: p.amount, 메모: p.note ?? '',
      }))
    ), S.SAVING_PAYMENTS)

    // 7. 재무목표
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      goals.map(g => ({
        목표ID: g.id, 목표명: g.name, 목표금액: g.targetAmount,
        현재금액: g.currentAmount, 마감일: g.deadline, 색상: g.color,
        카테고리: g.goalCategory ?? '', 목표월: g.targetDate ?? '', 시작월: g.startDate ?? '',
      }))
    ), S.GOALS)

    // 8. 재무목표 납입이력
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      (goalPayments ?? []).map(p => ({
        납입ID: p.id, 목표ID: p.goalId, 납입일: p.date, 납입금액: p.amount, 메모: p.note ?? '',
      }))
    ), S.GOAL_PAYMENTS)

    // 9. 거래내역
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      [...transactions].sort((a, b) => a.date.localeCompare(b.date)).map(t => ({
        거래ID: t.id, 날짜: t.date, 내용: t.description, 금액: t.amount, 유형: t.type,
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
        결제방법: t.paymentMethod, 카드ID: t.cardId ?? '',
        카드명: t.cardId ? (cards.find(c => c.id === t.cardId)?.name ?? '') : '',
        메모: t.note ?? '', 할부여부: t.isInstallment ? 'Y' : '',
        할부개월: t.installmentMonths ?? '', 할부회차: t.installmentCurrent ?? '',
        청구월: t.billingMonth ?? '', 소비유형: t.consumptionType ?? '',
        적금연결: t.savingLinks && t.savingLinks.length > 0 ? JSON.stringify(t.savingLinks) : '',
      }))
    ), S.TRANSACTIONS)

    // 10. 할부 내역
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      (installments ?? []).map(i => ({
        할부ID: i.id, 카드ID: i.cardId, 내용: i.description,
        총금액: i.totalAmount, 월납입액: i.monthlyAmount,
        총개월: i.totalMonths, 납입완료개월: i.paidMonths, 시작일: i.startDate,
      }))
    ), S.INSTALLMENTS)

    // 11. 카드 청구·납부
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      (cardBillings ?? []).map(b => ({
        청구ID: b.id, 카드ID: b.cardId, 사용월: b.billingMonth,
        납부월: b.paymentMonth, 청구총액: b.totalAmount, 납부완료금액: b.paidAmount,
      }))
    ), S.CARD_BILLINGS)

    // 12. 가맹점-카테고리 매핑
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      (mappingRules ?? []).map(r => ({
        규칙ID: r.id, 키워드: r.keyword, 카테고리ID: r.categoryId,
        카테고리명: categories.find(c => c.id === r.categoryId)?.name ?? '',
      }))
    ), S.MAPPING_RULES)

    // 13. 투자 계좌
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      investmentAccounts.map(a => ({
        투자계좌ID: a.id, 계좌명: a.name, 증권사: a.bank,
        유형ID: a.typeId, 색상: a.color, 계좌번호: a.accountNumber ?? '',
      }))
    ), S.INV_ACCOUNTS)

    // 14. 투자 계좌 유형 (커스텀 포함 전체)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      (investmentAccountTypes ?? []).map(t => ({
        유형ID: t.id, 유형명: t.name, 기본제공: t.isDefault ? 'Y' : '',
      }))
    ), S.INV_ACCOUNT_TYPES)

    // 15. 보유 종목
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      investments.map(inv => ({
        종목ID: inv.id, 종목명: inv.name, 티커: inv.ticker ?? '',
        자산유형: inv.assetType, 통화: inv.currency,
        투자계좌ID: inv.accountId ?? '', 거래소: inv.exchange ?? '',
        현재가: inv.currentPrice ?? '', 현재가갱신: inv.currentPriceUpdatedAt ?? '',
        전일대비금액: inv.prevCloseDiff ?? '', 전일대비율: inv.prevCloseDiffRate ?? '',
      }))
    ), S.INV_HOLDINGS)

    // 16. 투자 거래
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      investmentTrades.map(tr => ({
        거래ID: tr.id, 종목ID: tr.investmentId, 유형: tr.type,
        날짜: tr.date ?? '', 수량: tr.quantity, 단가: tr.price,
        통화: tr.currency, 환율: tr.exchangeRate ?? '', 수수료: tr.fee ?? '',
        메모: tr.note ?? '', 현금계좌ID: tr.cashAccountId ?? '',
      }))
    ), S.INV_TRADES)

    // 17. 배당금 기록
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      (investmentDividends ?? []).map(d => ({
        배당ID: d.id, 투자계좌ID: d.accountId, 종목ID: d.investmentId ?? '',
        입금일: d.date, 세전배당금: d.grossAmount, 원천징수세: d.tax,
        실수령액: d.netAmount, 메모: d.note ?? '', 현금계좌ID: d.cashAccountId ?? '',
      }))
    ), S.INV_DIVIDENDS)

    // 18. 예수금 입금내역
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      (investmentCashDeposits ?? []).map(d => ({
        입금ID: d.id, 투자계좌ID: d.accountId, 입금일: d.date, 금액: d.amount, 메모: d.note ?? '',
      }))
    ), S.INV_CASH_DEPOSITS)

    // 19. 포트폴리오 플랜 (JSON 직렬화)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      (portfolioPlans ?? []).map(plan => ({
        투자계좌ID: plan.accountId,
        플랜데이터: JSON.stringify({ items: plan.items, groups: plan.groups }),
      }))
    ), S.PORTFOLIO_PLANS)

    // 20. 관심종목
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      (watchlist ?? []).map(w => ({
        관심종목ID: w.id, 종목명: w.name, 티커: w.ticker ?? '',
        거래소: w.exchange ?? '', 자산유형: w.assetType, 통화: w.currency,
        현재가: w.currentPrice ?? '', 전일대비금액: w.prevCloseDiff ?? '',
        전일대비율: w.prevCloseDiffRate ?? '', 현재가갱신: w.currentPriceUpdatedAt ?? '',
      }))
    ), S.WATCHLIST)

    // 21. 메타정보
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { 항목: '버전',           값: BACKUP_VERSION },
      { 항목: '내보낸날짜',     값: today },
      { 항목: '계좌수',         값: accounts.length },
      { 항목: '카드수',         값: cards.length },
      { 항목: '카테고리수',     값: categories.length },
      { 항목: '예산수',         값: budgets.length },
      { 항목: '적금예금수',     값: savings.length },
      { 항목: '적금납입수',     값: (savingPayments ?? []).length },
      { 항목: '목표수',         값: goals.length },
      { 항목: '목표납입수',     값: (goalPayments ?? []).length },
      { 항목: '거래수',         값: transactions.length },
      { 항목: '할부수',         값: (installments ?? []).length },
      { 항목: '카드청구수',     값: (cardBillings ?? []).length },
      { 항목: '매핑규칙수',     값: (mappingRules ?? []).length },
      { 항목: '투자계좌수',     값: investmentAccounts.length },
      { 항목: '보유종목수',     값: investments.length },
      { 항목: '투자거래수',     값: investmentTrades.length },
      { 항목: '배당금수',       값: (investmentDividends ?? []).length },
      { 항목: '예수금내역수',   값: (investmentCashDeposits ?? []).length },
      { 항목: '포트폴리오수',   값: (portfolioPlans ?? []).length },
      { 항목: '관심종목수',     값: (watchlist ?? []).length },
    ]), S.META)

    // Blob 방식으로 다운로드 — XLSX.writeFile보다 브라우저 호환성 높음
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `가계부_백업_${today}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setLastBackupDate(today)
    } catch (e) {
      setExportError(`백업 파일 생성 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
    }
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

        // ★ RAW_DATA 시트 있는지 확인 (v3.1+)
        const rawRows = rows<Record<string, unknown>>(S.RAW_DATA)
        // 청크 분할된 JSON을 합치기 (단일 행이면 그냥 사용)
        const rawJson = rawRows.length > 0
          ? rawRows.map(r => safeStr(r['json'])).join('')
          : null

        // RAW_DATA 시트 파싱 — multiData 전체 구조
        let parsedMulti: MultiData | null = null
        // 활성 가계부의 AppData (카운트 표시용)
        let parsedActiveData: Record<string, unknown[]> | null = null
        if (rawJson) {
          try {
            const parsed = JSON.parse(rawJson)
            // v3.1+: MultiData 구조 (budgetList, budgets, activeBudgetId)
            if (parsed.budgetList && parsed.budgets) {
              parsedMulti = parsed as MultiData
              const activeId = parsedMulti.activeBudgetId
              parsedActiveData = (parsedMulti.budgets[activeId] ?? Object.values(parsedMulti.budgets)[0] ?? {}) as unknown as Record<string, unknown[]>
            } else {
              // v3.0: AppData 구조 (단일 가계부)
              parsedActiveData = parsed as Record<string, unknown[]>
            }
          } catch { /* ignore */ }
        }

        function countRaw(field: string, sheetFallback: string): number {
          if (parsedActiveData && Array.isArray(parsedActiveData[field])) return (parsedActiveData[field] as unknown[]).length
          return rows(sheetFallback).length
        }

        // 거래 날짜 범위 계산
        const txSource: Record<string, unknown>[] = parsedActiveData?.transactions
          ? (parsedActiveData.transactions as Record<string, unknown>[])
          : rows<Record<string, unknown>>(S.TRANSACTIONS)
        const dates     = txSource.map(r => safeStr(r['date'] ?? r['날짜'])).filter(Boolean).sort()
        const dateRange = dates.length > 0 ? `${dates[0]} ~ ${dates[dates.length-1]}` : '(거래 없음)'

        // 가계부 수
        const budgetCount = parsedMulti
          ? parsedMulti.budgetList.length
          : rawRows[0]?.budgetCount ? safeNum(rawRows[0].budgetCount) : 1

        // 버전 체크
        const metaRows    = rows<Record<string, string>>(S.META)
        const rawVersion  = rawRows[0]?.version ? safeStr(rawRows[0].version) : null
        const sheetVersion = metaRows.find(r => r['항목'] === '버전')?.['값'] ?? '?'
        const fileVersion  = rawVersion ?? sheetVersion

        setImportPreview({
          budgetCount,
          accounts:      countRaw('accounts',               S.ACCOUNTS),
          cards:         countRaw('cards',                  S.CARDS),
          categories:    countRaw('categories',             S.CATEGORIES),
          budgets:       countRaw('budgets',                S.BUDGETS),
          savings:       countRaw('savings',                S.SAVINGS),
          savingPayments: countRaw('savingPayments',        S.SAVING_PAYMENTS),
          goals:         countRaw('goals',                  S.GOALS),
          goalPayments:  countRaw('goalPayments',           S.GOAL_PAYMENTS),
          transactions:  txSource.length,
          installments:  countRaw('installments',          S.INSTALLMENTS),
          cardBillings:  countRaw('cardBillings',          S.CARD_BILLINGS),
          mappingRules:  countRaw('mappingRules',          S.MAPPING_RULES),
          invAccounts:   countRaw('investmentAccounts',    S.INV_ACCOUNTS),
          holdings:      countRaw('investments',           S.INV_HOLDINGS),
          trades:        countRaw('investmentTrades',      S.INV_TRADES),
          dividends:     countRaw('investmentDividends',   S.INV_DIVIDENDS),
          cashDeposits:  countRaw('investmentCashDeposits',S.INV_CASH_DEPOSITS),
          portfolioPlans: countRaw('portfolioPlans',       S.PORTFOLIO_PLANS),
          watchlist:     countRaw('watchlist',             S.WATCHLIST),
          dateRange,
          usedRawJson:   !!rawJson,
        })
        setPendingWb(wb)
        setImportStatus('preview')
        if (!rawJson && fileVersion !== BACKUP_VERSION) {
          setImportError(`구 버전 백업 파일(v${fileVersion})입니다. 시트별 방식으로 최대한 복원합니다.`)
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

    // ★ RAW_DATA 시트가 있으면 JSON 통째로 복원 (v3.1+ — 새 필드·모든 가계부 자동 포함)
    if (wb.SheetNames.includes(S.RAW_DATA)) {
      const rawRows = rows<Record<string, unknown>>(S.RAW_DATA)
      // 청크 분할된 JSON을 합치기
      const jsonStr = rawRows.length > 0
        ? rawRows.map(r => safeStr(r['json'])).join('')
        : null
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr)
          // v3.1+: MultiData 전체 구조
          if (parsed.budgetList && parsed.budgets) {
            restoreAllData(parsed as MultiData)
          } else {
            // v3.0: AppData 단일 가계부 구조
            restoreBudgetData(parsed)
          }
          setImportStatus('success')
          setPendingWb(null)
          setImportPreview(null)
          return
        } catch { /* JSON 파싱 실패 시 아래 시트별 방식으로 fallback */ }
      }
    }

    // ── Fallback: 구 버전 백업(v3.0 이하) — 시트별 수동 복원 ──────────────────
    // 1. 계좌
    const accountRows = rows<Record<string, unknown>>(S.ACCOUNTS)
    if (accountRows.length > 0) {
      setAccounts(accountRows.map(r => ({
        id:                safeStr(r['계좌ID']) || `a_${Math.random().toString(36).slice(2)}`,
        name:              safeStr(r['계좌명']),
        bank:              safeStr(r['은행']),
        balance:           safeNum(r['잔액']),
        color:             safeStr(r['색상']) || '#607D8B',
        assetType:         (safeStr(r['자산유형']) || 'cash') as 'cash' | 'savings' | 'investment',
        investmentSubType: (safeStr(r['투자세부유형']) || undefined) as InvestmentSubType | undefined,
        memo:              safeStr(r['메모']) || undefined,
        accountNumber:     safeStr(r['계좌번호']) || undefined,
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
        actualInterest: r['실제수령이자'] ? safeNum(r['실제수령이자']) : undefined,
        memo:           safeStr(r['메모']) || undefined,
      })))
    }

    // 6. 적금 납입이력
    const savingPaymentRows = rows<Record<string, unknown>>(S.SAVING_PAYMENTS)
    if (savingPaymentRows.length > 0) {
      setSavingPayments(savingPaymentRows.map(r => ({
        id:       safeStr(r['납입ID']) || `sp_${Math.random().toString(36).slice(2)}`,
        savingId: safeStr(r['상품ID']),
        date:     safeStr(r['납입일']),
        amount:   safeNum(r['납입금액']),
        note:     safeStr(r['메모']) || undefined,
      })))
    }

    // 7. 재무목표
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
        startDate:     safeStr(r['시작월']) || undefined,
      })))
    }

    // 8. 재무목표 납입이력
    const goalPaymentRows = rows<Record<string, unknown>>(S.GOAL_PAYMENTS)
    if (goalPaymentRows.length > 0) {
      setGoalPayments(goalPaymentRows.map(r => ({
        id:     safeStr(r['납입ID']) || `gp_${Math.random().toString(36).slice(2)}`,
        goalId: safeStr(r['목표ID']),
        date:   safeStr(r['납입일']),
        amount: safeNum(r['납입금액']),
        note:   safeStr(r['메모']) || undefined,
      })))
    }

    // 9. 거래내역
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

    // 10. 할부 내역
    const installmentRows = rows<Record<string, unknown>>(S.INSTALLMENTS)
    if (installmentRows.length > 0) {
      setInstallments(installmentRows.map(r => ({
        id:           safeStr(r['할부ID']) || `inst_${Math.random().toString(36).slice(2)}`,
        cardId:       safeStr(r['카드ID']),
        description:  safeStr(r['내용']),
        totalAmount:  safeNum(r['총금액']),
        monthlyAmount: safeNum(r['월납입액']),
        totalMonths:  safeNum(r['총개월']),
        paidMonths:   safeNum(r['납입완료개월']),
        startDate:    safeStr(r['시작일']),
      })))
    }

    // 11. 카드 청구·납부
    const cardBillingRows = rows<Record<string, unknown>>(S.CARD_BILLINGS)
    if (cardBillingRows.length > 0) {
      setCardBillings(cardBillingRows.map(r => ({
        id:           safeStr(r['청구ID']) || `cb_${Math.random().toString(36).slice(2)}`,
        cardId:       safeStr(r['카드ID']),
        billingMonth: safeStr(r['사용월']),
        paymentMonth: safeStr(r['납부월']),
        totalAmount:  safeNum(r['청구총액']),
        paidAmount:   safeNum(r['납부완료금액']),
      })))
    }

    // 12. 가맹점-카테고리 매핑
    const mappingRows = rows<Record<string, unknown>>(S.MAPPING_RULES)
    if (mappingRows.length > 0) {
      setMappingRules(mappingRows.map(r => ({
        id:         safeStr(r['규칙ID']) || `mr_${Math.random().toString(36).slice(2)}`,
        keyword:    safeStr(r['키워드']),
        categoryId: safeStr(r['카테고리ID']),
      })))
    }

    // 13. 투자 계좌
    const invAccRows = rows<Record<string, unknown>>(S.INV_ACCOUNTS)
    if (invAccRows.length > 0) {
      setInvestmentAccounts(invAccRows.map(r => ({
        id:            safeStr(r['투자계좌ID']) || `ia_${Math.random().toString(36).slice(2)}`,
        name:          safeStr(r['계좌명']),
        bank:          safeStr(r['증권사']),
        typeId:        safeStr(r['유형ID']),
        color:         safeStr(r['색상']) || '#607D8B',
        accountNumber: safeStr(r['계좌번호']) || undefined,
      })))
    }

    // 14. 투자 계좌 유형 (커스텀만 복원, 기본값은 항상 존재)
    const invTypeRows = rows<Record<string, unknown>>(S.INV_ACCOUNT_TYPES)
    if (invTypeRows.length > 0) {
      setInvestmentAccountTypes(invTypeRows.map(r => ({
        id:        safeStr(r['유형ID']) || `iat_${Math.random().toString(36).slice(2)}`,
        name:      safeStr(r['유형명']),
        isDefault: safeStr(r['기본제공']) === 'Y',
      })))
    }

    // 15. 보유 종목
    const holdingRows = rows<Record<string, unknown>>(S.INV_HOLDINGS)
    if (holdingRows.length > 0) {
      setInvestments(holdingRows.map(r => ({
        id:                    safeStr(r['종목ID']) || `inv_${Math.random().toString(36).slice(2)}`,
        name:                  safeStr(r['종목명']),
        ticker:                safeStr(r['티커']) || undefined,
        assetType:             safeStr(r['자산유형']) as 'domestic_stock' | 'foreign_stock' | 'etf_fund' | 'crypto',
        currency:              safeStr(r['통화']) as 'KRW' | 'USD' | 'USDT' | 'other',
        accountId:             safeStr(r['투자계좌ID']) || undefined,
        exchange:              safeStr(r['거래소']) || undefined,
        currentPrice:          r['현재가'] ? safeNum(r['현재가']) : undefined,
        currentPriceUpdatedAt: safeStr(r['현재가갱신']) || undefined,
        prevCloseDiff:         r['전일대비금액'] ? safeNum(r['전일대비금액']) : undefined,
        prevCloseDiffRate:     r['전일대비율'] ? safeNum(r['전일대비율']) : undefined,
      })))
    }

    // 16. 투자 거래
    const tradeRows = rows<Record<string, unknown>>(S.INV_TRADES)
    if (tradeRows.length > 0) {
      setInvestmentTrades(tradeRows.map(r => ({
        id:           safeStr(r['거래ID']) || `tr_${Math.random().toString(36).slice(2)}`,
        investmentId: safeStr(r['종목ID']),
        type:         safeStr(r['유형']) as 'buy' | 'sell',
        date:         safeStr(r['날짜']) || undefined,
        quantity:     safeNum(r['수량']),
        price:        safeNum(r['단가']),
        currency:     safeStr(r['통화']) as 'KRW' | 'USD' | 'USDT' | 'other',
        exchangeRate: r['환율'] ? safeNum(r['환율']) : undefined,
        fee:          r['수수료'] ? safeNum(r['수수료']) : undefined,
        note:         safeStr(r['메모']) || undefined,
        cashAccountId: safeStr(r['현금계좌ID']) || undefined,
      })))
    }

    // 17. 배당금 기록
    const dividendRows = rows<Record<string, unknown>>(S.INV_DIVIDENDS)
    if (dividendRows.length > 0) {
      setInvestmentDividends(dividendRows.map(r => ({
        id:           safeStr(r['배당ID']) || `div_${Math.random().toString(36).slice(2)}`,
        accountId:    safeStr(r['투자계좌ID']),
        investmentId: safeStr(r['종목ID']) || undefined,
        date:         safeStr(r['입금일']),
        grossAmount:  safeNum(r['세전배당금']),
        tax:          safeNum(r['원천징수세']),
        netAmount:    safeNum(r['실수령액']),
        note:         safeStr(r['메모']) || undefined,
        cashAccountId: safeStr(r['현금계좌ID']) || undefined,
      })))
    }

    // 18. 예수금 입금내역
    const cashDepositRows = rows<Record<string, unknown>>(S.INV_CASH_DEPOSITS)
    if (cashDepositRows.length > 0) {
      setInvestmentCashDeposits(cashDepositRows.map(r => ({
        id:        safeStr(r['입금ID']) || `cd_${Math.random().toString(36).slice(2)}`,
        accountId: safeStr(r['투자계좌ID']),
        date:      safeStr(r['입금일']),
        amount:    safeNum(r['금액']),
        note:      safeStr(r['메모']) || undefined,
      })))
    }

    // 19. 포트폴리오 플랜
    const portfolioPlanRows = rows<Record<string, unknown>>(S.PORTFOLIO_PLANS)
    if (portfolioPlanRows.length > 0) {
      const plans = portfolioPlanRows.flatMap(r => {
        try {
          const parsed = JSON.parse(safeStr(r['플랜데이터']))
          return [{ accountId: safeStr(r['투자계좌ID']), items: parsed.items ?? [], groups: parsed.groups ?? [] }]
        } catch { return [] }
      })
      if (plans.length > 0) setPortfolioPlans(plans)
    }

    // 20. 관심종목
    const watchlistRows = rows<Record<string, unknown>>(S.WATCHLIST)
    if (watchlistRows.length > 0) {
      setWatchlist(watchlistRows.map(r => ({
        id:                    safeStr(r['관심종목ID']) || `w_${Math.random().toString(36).slice(2)}`,
        name:                  safeStr(r['종목명']),
        ticker:                safeStr(r['티커']) || undefined,
        exchange:              safeStr(r['거래소']) || undefined,
        assetType:             safeStr(r['자산유형']) as 'domestic_stock' | 'foreign_stock' | 'etf_fund' | 'crypto',
        currency:              safeStr(r['통화']) as 'KRW' | 'USD' | 'USDT' | 'other',
        currentPrice:          r['현재가'] ? safeNum(r['현재가']) : undefined,
        prevCloseDiff:         r['전일대비금액'] ? safeNum(r['전일대비금액']) : undefined,
        prevCloseDiffRate:     r['전일대비율'] ? safeNum(r['전일대비율']) : undefined,
        currentPriceUpdatedAt: safeStr(r['현재가갱신']) || undefined,
      })))
    }

    setImportStatus('success')
    setPendingWb(null)
    setImportPreview(null)
  }

  const p = importPreview

  // 카운트 그리드용 데이터
  const exportStats = [
    { label: '거래내역',   count: transactions.length,                    color: 'blue' },
    { label: '계좌',       count: accounts.length,                        color: 'slate' },
    { label: '적금·예금',  count: savings.length,                         color: 'emerald' },
    { label: '적금납입',   count: (savingPayments ?? []).length,           color: 'teal' },
    { label: '재무목표',   count: goals.length,                            color: 'amber' },
    { label: '목표납입',   count: (goalPayments ?? []).length,             color: 'yellow' },
    { label: '투자거래',   count: investmentTrades.length,                 color: 'purple' },
    { label: '배당금',     count: (investmentDividends ?? []).length,      color: 'violet' },
    { label: '예수금',     count: (investmentCashDeposits ?? []).length,   color: 'indigo' },
    { label: '관심종목',   count: (watchlist ?? []).length,                color: 'pink' },
    { label: '할부',       count: (installments ?? []).length,             color: 'rose' },
    { label: '매핑규칙',   count: (mappingRules ?? []).length,             color: 'orange' },
  ]

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">💾 데이터 백업 & 복구</h1>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">v{BACKUP_VERSION}</span>
      </div>

      {/* 백업 섹션 */}
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-4">
        <h2 className="text-base font-bold text-gray-800 mb-1">데이터 내보내기</h2>
        <p className="text-sm text-gray-500 mb-4">
          모든 데이터를 엑셀(.xlsx)로 백업합니다. 총 21개 시트에 빠짐없이 저장됩니다.
        </p>
        {/* 가계부 수 표시 */}
        <div className="flex items-center gap-2 mb-3 bg-blue-50 rounded-xl px-3 py-2">
          <span className="text-base">📒</span>
          <span className="text-sm font-semibold text-blue-700">
            {multiData.budgetList.length}개 가계부
          </span>
          <span className="text-xs text-blue-400">
            ({multiData.budgetList.map(b => b.name).join(', ')}) 전체 백업
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {exportStats.map(({ label, count, color }) => (
            <div key={label} className={`bg-${color}-50 rounded-xl p-2.5 text-center`}>
              <div className={`text-sm font-bold text-${color}-600`}>{count.toLocaleString('ko-KR')}</div>
              <div className={`text-[11px] text-${color}-400 mt-0.5`}>{label}</div>
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
        {exportError && (
          <div className="mt-2 bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600">
            ⚠️ {exportError}
          </div>
        )}
      </div>

      {/* 복구 섹션 */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="text-base font-bold text-gray-800 mb-1">데이터 복구</h2>
        <p className="text-sm text-gray-500 mb-4">
          이전에 내보낸 백업 파일을 업로드하면 모든 데이터가 완전히 복원됩니다.
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
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-amber-700">📋 복구 예정 데이터</div>
                {p.usedRawJson
                  ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✅ 완전 자동 복원</span>
                  : <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">⚠️ 구 버전 (일부만)</span>
                }
              </div>
              {p.budgetCount > 0 && (
                <div className="text-xs text-amber-600 bg-amber-100 rounded-lg px-2 py-1 mb-2">
                  📒 가계부 {p.budgetCount}개 포함
                  {p.budgetCount > 1 && ' (전체 가계부 복원)'}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['계좌',       p.accounts],
                  ['카드',       p.cards],
                  ['카테고리',   p.categories],
                  ['예산',       p.budgets],
                  ['적금·예금',  p.savings],
                  ['적금납입',   p.savingPayments],
                  ['재무목표',   p.goals],
                  ['목표납입',   p.goalPayments],
                  ['거래내역',   p.transactions],
                  ['할부',       p.installments],
                  ['카드청구',   p.cardBillings],
                  ['매핑규칙',   p.mappingRules],
                  ['투자계좌',   p.invAccounts],
                  ['보유종목',   p.holdings],
                  ['투자거래',   p.trades],
                  ['배당금',     p.dividends],
                  ['예수금',     p.cashDeposits],
                  ['포트폴리오', p.portfolioPlans],
                  ['관심종목',   p.watchlist],
                ].map(([label, count]) => (
                  <div key={String(label)} className="bg-white rounded-lg p-2 text-center">
                    <div className="text-sm font-bold text-gray-800">{Number(count).toLocaleString('ko-KR')}</div>
                    <div className="text-xs text-gray-500">{label}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-amber-600 mt-2">거래 기간: {p.dateRange}</div>
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
            <div className="text-sm font-semibold text-green-700">데이터 복구가 완료되었습니다!</div>
            <div className="text-xs text-green-500 mt-1">새로운 기능 데이터도 포함하여 완전히 복원되었습니다.</div>
            <button onClick={() => setImportStatus('idle')} className="mt-2 text-xs text-green-600 hover:text-green-800 underline">확인</button>
          </div>
        )}
      </div>

      {/* 시트 구성 안내 */}
      <div className="mt-4 bg-gray-50 rounded-2xl p-4">
        <div className="text-xs font-semibold text-gray-500 mb-2">📌 백업 파일 시트 구성 (v{BACKUP_VERSION}) — 총 22개 시트</div>
        <div className="mb-2 bg-blue-50 rounded-xl px-3 py-2 flex items-start gap-2">
          <span className="text-blue-500 text-sm shrink-0">★</span>
          <div>
            <span className="text-xs font-semibold text-blue-700">__raw_data__ 시트</span>
            <span className="text-xs text-blue-500 ml-1">— 전체 데이터 JSON (복구 시 이 시트 우선 사용. 새 기능 추가돼도 자동 포함)</span>
          </div>
        </div>
        <div className="text-xs text-gray-400 mb-2">아래 시트들은 엑셀로 직접 확인하기 위한 참고용입니다.</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {[
            ['계좌',         '계좌ID·은행·잔액·자산유형·계좌번호'],
            ['카드',         '카드ID·결제일·연회비'],
            ['카테고리',     '카테고리ID·유형·아이콘·부모ID'],
            ['예산설정',     '예산ID·카테고리ID·연도월·금액'],
            ['적금예금',     '상품ID·이율·만기일·납입주기·상태'],
            ['적금납입이력', '납입ID·상품ID·납입일·금액'],
            ['재무목표',     '목표ID·목표금액·마감일·카테고리'],
            ['목표납입이력', '납입ID·목표ID·납입일·금액'],
            ['거래내역',     'ID·카테고리ID·계좌ID·카드ID·적금연결'],
            ['할부내역',     '할부ID·카드ID·총금액·개월·납입완료'],
            ['카드청구납부', '청구ID·카드ID·사용월·납부월'],
            ['매핑규칙',     '규칙ID·키워드·카테고리ID'],
            ['투자계좌',     '투자계좌ID·증권사·유형ID'],
            ['투자계좌유형', '유형ID·유형명·기본제공여부'],
            ['보유종목',     '종목ID·티커·자산유형·현재가'],
            ['투자거래',     '거래ID·종목ID·수량·단가·수수료'],
            ['투자배당금',   '배당ID·투자계좌ID·세전금액·원천징수세'],
            ['예수금내역',   '입금ID·투자계좌ID·입금일·금액'],
            ['포트폴리오',   '투자계좌ID·플랜데이터(JSON)'],
            ['관심종목',     '종목ID·티커·현재가·전일대비'],
            ['메타정보',     '버전·날짜·각 항목 개수'],
          ].map(([sheet, cols]) => (
            <div key={sheet} className="flex gap-1.5">
              <span className="text-xs font-medium text-gray-600 w-16 flex-shrink-0">{sheet}</span>
              <span className="text-xs text-gray-400">{cols}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
