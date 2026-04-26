'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useApp, DEFAULT_INVESTMENT_ACCOUNT_TYPES } from '@/lib/AppContext'
import {
  Investment, InvestmentTrade, InvestmentAccount, InvestmentDividend,
  InvestmentAssetType, InvestmentCurrency, InvestmentAccountType, InvestmentTargetAllocation,
} from '@/types'
import DeleteConfirmModal from '@/components/DeleteConfirmModal'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function fmtPct(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%' }
function parseAmt(s: string) { return parseFloat(s.replace(/[^0-9.]/g, '')) || 0 }

const today = new Date().toISOString().slice(0, 10)

const ASSET_TYPE_META: Record<InvestmentAssetType, { label: string; icon: string; color: string }> = {
  domestic_stock: { label: '국내 주식',  icon: '🇰🇷', color: '#3B82F6' },
  foreign_stock:  { label: '해외 주식',  icon: '🌏', color: '#8B5CF6' },
  etf_fund:       { label: 'ETF/펀드',   icon: '📊', color: '#10B981' },
  crypto:         { label: '가상화폐',   icon: '₿',  color: '#F59E0B' },
}

const CURRENCIES: InvestmentCurrency[] = ['KRW', 'USD', 'USDT', 'other']

const ACCOUNT_COLORS = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6']

type PageTab = 'dashboard' | 'holdings' | 'trades' | 'portfolio'

const EMPTY_INVESTMENT: Omit<Investment, 'id'> = {
  assetType: 'domestic_stock',
  name: '',
  ticker: '',
  exchange: '',
  currency: 'KRW',
  currentPrice: undefined,
  accountId: undefined,
}

const EMPTY_TRADE: Omit<InvestmentTrade, 'id' | 'investmentId'> = {
  type: 'buy',
  date: today,
  quantity: 0,
  price: 0,
  currency: 'KRW',
  exchangeRate: undefined,
  fee: undefined,
  note: '',
}

const EMPTY_ACCOUNT: Omit<InvestmentAccount, 'id'> = {
  name: '',
  bank: '',
  typeId: 'iat_general',
  color: ACCOUNT_COLORS[0],
}

const EMPTY_DIVIDEND: Omit<InvestmentDividend, 'id'> = {
  accountId: '',
  investmentId: undefined,
  date: today,
  grossAmount: 0,
  tax: 0,
  netAmount: 0,
  note: '',
}

export default function InvestmentsPage() {
  const { data, setInvestments, setInvestmentTrades, setInvestmentAccounts, setInvestmentDividends, setInvestmentAccountTypes, setInvestmentTargetAllocations } = useApp()
  const { investments, investmentTrades, investmentAccounts, investmentDividends } = data
  const investmentAccountTypes: InvestmentAccountType[] = data.investmentAccountTypes ?? DEFAULT_INVESTMENT_ACCOUNT_TYPES
  const investmentTargetAllocations: InvestmentTargetAllocation[] = data.investmentTargetAllocations ?? []

  const [pageTab, setPageTab] = useState<PageTab>('dashboard')

  // 종목 모달
  const [showInvestmentModal, setShowInvestmentModal] = useState(false)
  const [editInvestmentId, setEditInvestmentId] = useState<string | null>(null)
  const [investmentForm, setInvestmentForm] = useState<Omit<Investment, 'id'>>(EMPTY_INVESTMENT)
  const [initialBuy, setInitialBuy] = useState<{ date: string; quantity: string; price: string; fee: string } | null>(null)
  const [deleteInvestmentId, setDeleteInvestmentId] = useState<string | null>(null)
  const [currentPriceInput, setCurrentPriceInput] = useState<Record<string, string>>({})

  // F-04: 종목명 자동완성
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const nameDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        nameDropdownRef.current && !nameDropdownRef.current.contains(e.target as Node) &&
        nameInputRef.current && !nameInputRef.current.contains(e.target as Node)
      ) {
        setNameDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const nameSuggestions = useMemo(() => {
    const q = investmentForm.name.trim()
    if (!q) return []
    return investments
      .filter(inv => inv.id !== editInvestmentId && inv.name.includes(q))
      .map(inv => inv.name)
      .filter((name, idx, arr) => arr.indexOf(name) === idx)
      .slice(0, 5)
  }, [investmentForm.name, investments, editInvestmentId])

  // 거래 모달
  const [showTradeModal, setShowTradeModal] = useState(false)
  const [editTradeId, setEditTradeId] = useState<string | null>(null)
  const [tradeInvestmentId, setTradeInvestmentId] = useState<string | null>(null)
  const [tradeForm, setTradeForm] = useState<Omit<InvestmentTrade, 'id' | 'investmentId'>>(EMPTY_TRADE)
  const [deleteTradeId, setDeleteTradeId] = useState<string | null>(null)
  const [selectedInvestmentId, setSelectedInvestmentId] = useState<string | null>(null)
  const [selectedTradeAccountId, setSelectedTradeAccountId] = useState<string | null>(null)
  const [collapsedTradeInvIds, setCollapsedTradeInvIds] = useState<Set<string>>(new Set())

  // 계좌 모달
  const [showAccountModal, setShowAccountModal] = useState(false)
  const [editAccountId, setEditAccountId] = useState<string | null>(null)
  const [accountForm, setAccountForm] = useState<Omit<InvestmentAccount, 'id'>>(EMPTY_ACCOUNT)
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null)

  // F-03: 계좌 유형 관리 모달
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [editTypeId, setEditTypeId] = useState<string | null>(null)
  const [editTypeName, setEditTypeName] = useState('')
  const [deleteTypeId, setDeleteTypeId] = useState<string | null>(null)

  // 배당금 모달
  const [showDividendModal, setShowDividendModal] = useState(false)
  const [dividendAccountId, setDividendAccountId] = useState<string | null>(null)
  const [editDividendId, setEditDividendId] = useState<string | null>(null)
  const [dividendForm, setDividendForm] = useState<Omit<InvestmentDividend, 'id'>>(EMPTY_DIVIDEND)
  const [deleteDividendId, setDeleteDividendId] = useState<string | null>(null)
  const [expandedDividendAccId, setExpandedDividendAccId] = useState<string | null>(null)

  // 계좌별 접기/펼치기
  const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string>>(new Set())
  function toggleCollapse(id: string) {
    setCollapsedAccounts(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // F-05: 포트폴리오 관리
  const [targetInputs, setTargetInputs] = useState<Record<string, string>>({})
  const [additionalInvestment, setAdditionalInvestment] = useState('')
  const [rebalanceResult, setRebalanceResult] = useState<{ id: string; name: string; addAmt: number; expectedPct: number }[] | null>(null)

  // ── 보유 종목별 계산 ────────────────────────────────────────────────────────
  const holdingsMap = useMemo(() => {
    const map = new Map<string, {
      investment: Investment
      avgPrice: number
      holdingQty: number
      totalBuyAmt: number
      totalFee: number
      realizedPnl: number
    }>()

    investments.forEach(inv => {
      const trades = investmentTrades
        .filter(t => t.investmentId === inv.id)
        .sort((a, b) => a.date.localeCompare(b.date))

      let holdingQty = 0
      let totalBuyAmt = 0
      let totalFee = 0
      let realizedPnl = 0

      trades.forEach(trade => {
        const tradeAmt = trade.quantity * trade.price
        const fee = trade.fee ?? 0
        totalFee += fee
        if (trade.type === 'buy') {
          holdingQty += trade.quantity
          totalBuyAmt += tradeAmt
        } else {
          const avgCost = holdingQty > 0 ? totalBuyAmt / holdingQty : 0
          realizedPnl += (tradeAmt - fee) - avgCost * trade.quantity
          holdingQty = Math.max(0, holdingQty - trade.quantity)
          totalBuyAmt = holdingQty * avgCost
        }
      })

      const avgPrice = holdingQty > 0 ? totalBuyAmt / holdingQty : 0
      map.set(inv.id, { investment: inv, avgPrice, holdingQty, totalBuyAmt, totalFee, realizedPnl })
    })
    return map
  }, [investments, investmentTrades])

  // ── 포트폴리오 요약 ────────────────────────────────────────────────────────
  const portfolio = useMemo(() => {
    let totalBuy = 0, totalEval = 0, totalRealized = 0, totalFee = 0
    const byType: Record<string, number> = {}
    const byAccount: Record<string, { buy: number; eval: number; divs: number }> = {}

    holdingsMap.forEach(({ investment, holdingQty, totalBuyAmt, totalFee: invFee, realizedPnl }) => {
      const currentPrice = investment.currentPrice ?? 0
      const evalAmt = holdingQty * currentPrice
      totalBuy += totalBuyAmt
      totalEval += evalAmt
      totalRealized += realizedPnl
      totalFee += invFee
      const type = investment.assetType
      byType[type] = (byType[type] || 0) + evalAmt
      const aId = investment.accountId ?? '__none__'
      if (!byAccount[aId]) byAccount[aId] = { buy: 0, eval: 0, divs: 0 }
      byAccount[aId].buy += totalBuyAmt
      byAccount[aId].eval += evalAmt
    })

    // 배당금 → 계좌별 예수금(현금 잔고)에 합산
    const totalDividend = investmentDividends.reduce((s, d) => s + d.netAmount, 0)
    investmentDividends.forEach(d => {
      const aId = d.accountId ?? '__none__'
      if (!byAccount[aId]) byAccount[aId] = { buy: 0, eval: 0, divs: 0 }
      byAccount[aId].divs = (byAccount[aId].divs ?? 0) + d.netAmount
    })

    const unrealizedPnl = totalEval - totalBuy
    const returnRate = totalBuy > 0 ? (unrealizedPnl / totalBuy) * 100 : 0
    const totalReturn = unrealizedPnl + totalRealized + totalDividend
    return { totalBuy, totalEval, unrealizedPnl, returnRate, totalRealized, totalDividend, totalFee, totalReturn, byType, byAccount }
  }, [holdingsMap, investmentDividends])

  // ── F-03: 계좌 유형 헬퍼 ─────────────────────────────────────────────────
  function getTypeLabel(typeId: string): string {
    return investmentAccountTypes.find(t => t.id === typeId)?.name ?? typeId
  }

  function handleAddType() {
    const name = newTypeName.trim()
    if (!name) return
    const newType: InvestmentAccountType = { id: `iat_${Date.now()}`, name, isDefault: false }
    setInvestmentAccountTypes([...investmentAccountTypes, newType])
    setNewTypeName('')
  }

  function handleSaveTypeName() {
    if (!editTypeId || !editTypeName.trim()) return
    setInvestmentAccountTypes(investmentAccountTypes.map(t => t.id === editTypeId ? { ...t, name: editTypeName.trim() } : t))
    setEditTypeId(null)
    setEditTypeName('')
  }

  function handleDeleteType(id: string) {
    const usedCount = investmentAccounts.filter(a => a.typeId === id).length
    if (usedCount > 0) {
      alert(`${usedCount}개 계좌에서 사용 중입니다. 삭제할 수 없습니다.`)
      return
    }
    setInvestmentAccountTypes(investmentAccountTypes.filter(t => t.id !== id))
    setDeleteTypeId(null)
  }

  // ── 계좌 CRUD ──────────────────────────────────────────────────────────────
  function openAddAccount() {
    setEditAccountId(null)
    setAccountForm({ ...EMPTY_ACCOUNT, color: ACCOUNT_COLORS[investmentAccounts.length % ACCOUNT_COLORS.length] })
    setShowAccountModal(true)
  }

  function openEditAccount(acc: InvestmentAccount) {
    setEditAccountId(acc.id)
    setAccountForm({ name: acc.name, bank: acc.bank, typeId: acc.typeId, color: acc.color })
    setShowAccountModal(true)
  }

  function handleSaveAccount() {
    if (!accountForm.name) return
    if (editAccountId) {
      setInvestmentAccounts(investmentAccounts.map(a => a.id === editAccountId ? { id: editAccountId, ...accountForm } : a))
    } else {
      setInvestmentAccounts([...investmentAccounts, { id: `ia${Date.now()}`, ...accountForm }])
    }
    setShowAccountModal(false)
    setEditAccountId(null)
  }

  function handleDeleteAccount(id: string) {
    setInvestments(investments.map(inv => inv.accountId === id ? { ...inv, accountId: undefined } : inv))
    setInvestmentAccounts(investmentAccounts.filter(a => a.id !== id))
    setDeleteAccountId(null)
  }

  // ── 종목 CRUD ──────────────────────────────────────────────────────────────
  function openAddInvestment(presetAccountId?: string) {
    setEditInvestmentId(null)
    setInvestmentForm({ ...EMPTY_INVESTMENT, accountId: presetAccountId })
    setInitialBuy({ date: today, quantity: '', price: '', fee: '' })
    setShowInvestmentModal(true)
  }

  function openEditInvestment(inv: Investment) {
    setEditInvestmentId(inv.id)
    setInvestmentForm({
      assetType: inv.assetType, name: inv.name, ticker: inv.ticker, exchange: inv.exchange,
      currency: inv.currency, currentPrice: inv.currentPrice, accountId: inv.accountId,
    })
    setInitialBuy(null)
    setShowInvestmentModal(true)
  }

  function handleSaveInvestment() {
    if (!investmentForm.name) return
    const invId = editInvestmentId ?? `inv${Date.now()}`
    const newInv: Investment = { id: invId, ...investmentForm }
    if (editInvestmentId) {
      setInvestments(investments.map(i => i.id === editInvestmentId ? newInv : i))
    } else {
      let finalInv = newInv
      if (initialBuy && initialBuy.quantity && initialBuy.price) {
        const qty = parseAmt(initialBuy.quantity)
        const price = parseAmt(initialBuy.price)
        const fee = parseAmt(initialBuy.fee)
        if (qty > 0 && price > 0) {
          finalInv = { ...finalInv, currentPrice: price, currentPriceUpdatedAt: new Date().toISOString() }
          const trade: InvestmentTrade = {
            id: `tr${Date.now()}`,
            investmentId: invId,
            type: 'buy',
            date: initialBuy.date,
            quantity: qty,
            price,
            currency: investmentForm.currency,
            fee: fee > 0 ? fee : undefined,
          }
          setInvestmentTrades([...investmentTrades, trade])
        }
      }
      setInvestments([...investments, finalInv])
    }
    setShowInvestmentModal(false)
    setEditInvestmentId(null)
    setInitialBuy(null)
  }

  function handleDeleteInvestment(id: string) {
    setInvestments(investments.filter(i => i.id !== id))
    setInvestmentTrades(investmentTrades.filter(t => t.investmentId !== id))
    setDeleteInvestmentId(null)
    if (selectedInvestmentId === id) setSelectedInvestmentId(null)
  }

  function handleUpdateCurrentPrice(invId: string) {
    const price = parseAmt(currentPriceInput[invId] ?? '')
    if (price <= 0) return
    setInvestments(investments.map(i => i.id === invId ? { ...i, currentPrice: price, currentPriceUpdatedAt: new Date().toISOString() } : i))
    setCurrentPriceInput(prev => ({ ...prev, [invId]: '' }))
  }

  // ── 거래 CRUD ──────────────────────────────────────────────────────────────
  function openAddTrade(investmentId: string) {
    setTradeInvestmentId(investmentId)
    setEditTradeId(null)
    setTradeForm({ ...EMPTY_TRADE, currency: investments.find(i => i.id === investmentId)?.currency ?? 'KRW' })
    setShowTradeModal(true)
  }

  function openEditTrade(trade: InvestmentTrade) {
    setTradeInvestmentId(trade.investmentId)
    setEditTradeId(trade.id)
    setTradeForm({ type: trade.type, date: trade.date, quantity: trade.quantity, price: trade.price, currency: trade.currency, exchangeRate: trade.exchangeRate, fee: trade.fee, note: trade.note })
    setShowTradeModal(true)
  }

  function handleSaveTrade() {
    if (!tradeInvestmentId || !tradeForm.quantity || !tradeForm.price) return
    if (editTradeId) {
      setInvestmentTrades(investmentTrades.map(t => t.id === editTradeId ? { ...t, ...tradeForm } : t))
    } else {
      const newTrade: InvestmentTrade = { id: `tr${Date.now()}`, investmentId: tradeInvestmentId, ...tradeForm }
      setInvestmentTrades([...investmentTrades, newTrade])
    }
    setShowTradeModal(false)
    setEditTradeId(null)
  }

  function handleDeleteTrade(id: string) {
    setInvestmentTrades(investmentTrades.filter(t => t.id !== id))
    setDeleteTradeId(null)
  }

  // ── 배당금 CRUD ────────────────────────────────────────────────────────────
  function openAddDividend(accountId: string) {
    setDividendAccountId(accountId)
    setEditDividendId(null)
    setDividendForm({ ...EMPTY_DIVIDEND, accountId, investmentId: undefined })
    setShowDividendModal(true)
  }

  function openEditDividend(d: InvestmentDividend) {
    setDividendAccountId(d.accountId)
    setEditDividendId(d.id)
    setDividendForm({ accountId: d.accountId, investmentId: d.investmentId, date: d.date, grossAmount: d.grossAmount, tax: d.tax, netAmount: d.netAmount, note: d.note })
    setShowDividendModal(true)
  }

  function handleSaveDividend() {
    if (!dividendAccountId || dividendForm.netAmount <= 0) return
    const formWithAccount = { ...dividendForm, accountId: dividendAccountId }
    if (editDividendId) {
      setInvestmentDividends(investmentDividends.map(d => d.id === editDividendId ? { ...d, ...formWithAccount } : d))
    } else {
      setInvestmentDividends([...investmentDividends, { id: `div${Date.now()}`, ...formWithAccount }])
    }
    setShowDividendModal(false)
    setEditDividendId(null)
  }

  function handleDeleteDividend(id: string) {
    setInvestmentDividends(investmentDividends.filter(d => d.id !== id))
    setDeleteDividendId(null)
  }

  // ── F-05: 포트폴리오 관리 ────────────────────────────────────────────────────
  // 보유 종목 (holdingQty > 0)
  const holdingInvestments = useMemo(() =>
    investments.filter(inv => (holdingsMap.get(inv.id)?.holdingQty ?? 0) > 0)
  , [investments, holdingsMap])

  const totalEvalForPortfolio = useMemo(() =>
    holdingInvestments.reduce((s, inv) => {
      const h = holdingsMap.get(inv.id)
      return s + (h ? h.holdingQty * (inv.currentPrice ?? 0) : 0)
    }, 0)
  , [holdingInvestments, holdingsMap])

  // 현재 비율 계산
  const currentPctMap = useMemo(() => {
    const map: Record<string, number> = {}
    holdingInvestments.forEach(inv => {
      const h = holdingsMap.get(inv.id)
      const evalAmt = h ? h.holdingQty * (inv.currentPrice ?? 0) : 0
      map[inv.id] = totalEvalForPortfolio > 0 ? (evalAmt / totalEvalForPortfolio) * 100 : 0
    })
    return map
  }, [holdingInvestments, holdingsMap, totalEvalForPortfolio])

  // 목표 비율 합계
  const targetPctSum = useMemo(() => {
    return holdingInvestments.reduce((s, inv) => {
      const v = parseFloat(targetInputs[inv.id] ?? '') || 0
      return s + v
    }, 0)
  }, [holdingInvestments, targetInputs])

  // 저장된 목표 비율 합계
  const savedTargetPctSum = investmentTargetAllocations.reduce((s, a) => s + a.targetPct, 0)

  function handleSaveTargetAllocations() {
    const allocations: InvestmentTargetAllocation[] = holdingInvestments.map(inv => ({
      investmentId: inv.id,
      targetPct: parseFloat(targetInputs[inv.id] ?? '') || 0,
    }))
    setInvestmentTargetAllocations(allocations)
  }

  function initTargetInputs() {
    const inputs: Record<string, string> = {}
    holdingInvestments.forEach(inv => {
      const saved = investmentTargetAllocations.find(a => a.investmentId === inv.id)
      inputs[inv.id] = saved ? String(saved.targetPct) : ''
    })
    setTargetInputs(inputs)
  }

  useEffect(() => {
    initTargetInputs()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdingInvestments.length, investmentTargetAllocations.length])

  function handleCalcRebalance() {
    const addAmt = parseFloat(additionalInvestment) || 0
    const currentEval = totalEvalForPortfolio
    const totalAfter = currentEval + addAmt
    const results = holdingInvestments.map(inv => {
      const saved = investmentTargetAllocations.find(a => a.investmentId === inv.id)
      const targetPct = saved?.targetPct ?? 0
      const h = holdingsMap.get(inv.id)
      const currentInvEval = h ? h.holdingQty * (inv.currentPrice ?? 0) : 0
      const targetAmt = (targetPct / 100) * totalAfter
      const addInv = Math.max(0, targetAmt - currentInvEval)
      const expectedPct = totalAfter > 0 ? ((currentInvEval + addInv) / totalAfter) * 100 : 0
      return { id: inv.id, name: inv.name, addAmt: addInv, expectedPct }
    })
    setRebalanceResult(results)
  }

  // ── 그룹: 계좌별 종목 목록 ───────────────────────────────────────────────
  const investmentsByAccount = useMemo(() => {
    const map = new Map<string, Investment[]>()
    investments.forEach(inv => {
      const key = inv.accountId ?? '__none__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(inv)
    })
    return map
  }, [investments])

  // 거래 이력 필터
  const tradeFilteredByAccount = selectedTradeAccountId
    ? investmentTrades.filter(t => {
        const inv = investments.find(i => i.id === t.investmentId)
        return inv?.accountId === selectedTradeAccountId
      })
    : investmentTrades
  const selectedTrades = (selectedInvestmentId
    ? tradeFilteredByAccount.filter(t => t.investmentId === selectedInvestmentId)
    : tradeFilteredByAccount
  ).slice().sort((a, b) => b.date.localeCompare(a.date))

  // 거래 이력 - 계좌 필터에 맞는 종목만
  const tradeInvestments = selectedTradeAccountId
    ? investments.filter(inv => inv.accountId === selectedTradeAccountId)
    : investments

  // 거래 이력 - 종목별 그룹화
  const tradeGroupsByInv = (() => {
    if (selectedInvestmentId) return null // 특정 종목 선택시 그룹화 X
    const map = new Map<string, typeof selectedTrades>()
    for (const t of selectedTrades) {
      const arr = map.get(t.investmentId) ?? []
      arr.push(t)
      map.set(t.investmentId, arr)
    }
    return map
  })()

  // ── 종목 카드 렌더 헬퍼 ──────────────────────────────────────────────────
  function renderInvestmentCard(inv: Investment) {
    const h = holdingsMap.get(inv.id)
    const meta = ASSET_TYPE_META[inv.assetType]
    const currentPrice = inv.currentPrice ?? 0
    const evalAmt = (h?.holdingQty ?? 0) * currentPrice
    const evalPnl = evalAmt - (h?.totalBuyAmt ?? 0)
    const evalRate = h?.totalBuyAmt ? (evalPnl / h.totalBuyAmt) * 100 : 0
    const isProfit = evalPnl >= 0
    const invDividends = investmentDividends.filter(d => d.investmentId === inv.id)
    const totalDividend = invDividends.reduce((s, d) => s + d.netAmount, 0)

    return (
      <div key={inv.id} className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: meta.color + '20' }}>
              {meta.icon}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{inv.name}</div>
              <div className="text-xs text-gray-400">
                {meta.label} {inv.ticker ? `· ${inv.ticker}` : ''} {inv.currency !== 'KRW' ? `· ${inv.currency}` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => openAddTrade(inv.id)} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors">+ 거래</button>
            <button onClick={() => openEditInvestment(inv)} className="text-xs text-gray-400 hover:text-blue-500 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">수정</button>
            <button onClick={() => setDeleteInvestmentId(inv.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">삭제</button>
          </div>
        </div>

        {h && h.holdingQty > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-gray-50 rounded-xl p-2.5">
              <div className="text-xs text-gray-400 mb-0.5">보유수량</div>
              <div className="text-sm font-semibold text-gray-900">{h.holdingQty.toLocaleString()}주</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-2.5">
              <div className="text-xs text-gray-400 mb-0.5">총 매수금액</div>
              <div className="text-sm font-semibold text-gray-900">{fmtKRW(Math.round(h.totalBuyAmt))}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-2.5">
              <div className="text-xs text-gray-400 mb-0.5">평균매수단가</div>
              <div className="text-sm font-semibold text-gray-900">{h.avgPrice.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-2.5">
              <div className="text-xs text-gray-400 mb-0.5">현재가</div>
              {currentPrice > 0 ? (() => {
                const priceDiff = currentPrice - h.avgPrice
                const priceRate = h.avgPrice > 0 ? (priceDiff / h.avgPrice) * 100 : 0
                return (
                  <>
                    <div className="text-sm font-semibold text-gray-900">{currentPrice.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</div>
                    <div className={`text-xs mt-0.5 ${priceDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {priceDiff >= 0 ? '+' : ''}{priceDiff.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ({fmtPct(priceRate)})
                    </div>
                  </>
                )
              })() : <div className="text-sm font-semibold text-gray-400">미입력</div>}
            </div>
            <div className={`col-span-2 rounded-xl p-2.5 ${isProfit ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div className={`text-xs mb-0.5 ${isProfit ? 'text-emerald-500' : 'text-red-500'}`}>평가손익 (총 평가금액)</div>
              <div className="flex items-baseline justify-between">
                <div className={`text-base font-bold ${isProfit ? 'text-emerald-700' : 'text-red-600'}`}>
                  {isProfit ? '+' : ''}{fmtKRW(Math.round(evalPnl))} <span className="text-xs font-normal">({fmtPct(evalRate)})</span>
                </div>
                <div className="text-xs text-gray-500">{fmtKRW(Math.round(evalAmt))}</div>
              </div>
            </div>
            {(h.totalFee > 0 || totalDividend > 0) && (
              <div className="col-span-2 flex gap-2">
                {h.totalFee > 0 && (
                  <div className="flex-1 bg-gray-50 rounded-xl p-2.5">
                    <div className="text-xs text-gray-400 mb-0.5">납부 수수료</div>
                    <div className="text-sm font-semibold text-gray-500">-{fmtKRW(Math.round(h.totalFee))}</div>
                  </div>
                )}
                {totalDividend > 0 && (
                  <div className="flex-1 bg-emerald-50 rounded-xl p-2.5">
                    <div className="text-xs text-emerald-500 mb-0.5">배당 수령</div>
                    <div className="text-sm font-semibold text-emerald-700">+{fmtKRW(Math.round(totalDividend))}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <input type="text" inputMode="numeric"
            placeholder="현재가 입력"
            value={currentPriceInput[inv.id] ?? ''}
            onChange={e => setCurrentPriceInput(prev => ({ ...prev, [inv.id]: e.target.value }))}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={() => handleUpdateCurrentPrice(inv.id)}
            className="px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors">
            업데이트
          </button>
          <button onClick={() => { setSelectedInvestmentId(prev => prev === inv.id ? null : inv.id); setPageTab('trades') }}
            className="px-3 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-xl hover:bg-gray-200 transition-colors">
            이력 보기
          </button>
        </div>
        {inv.currentPriceUpdatedAt && (
          <div className="text-xs text-gray-400 mt-1">현재가 기준: {new Date(inv.currentPriceUpdatedAt).toLocaleString('ko-KR')}</div>
        )}
        <div className="text-xs text-gray-400 mt-1.5">💡 매수·매도 내역 수정은 <button onClick={() => { setSelectedInvestmentId(inv.id); setPageTab('trades') }} className="text-blue-500 underline">거래 이력 탭</button>에서 가능합니다</div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">투자 내역 관리</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTypeModal(true)}
            className="bg-gray-100 text-gray-600 text-sm font-medium px-3 py-2 rounded-xl hover:bg-gray-200 transition-colors">
            계좌유형 관리
          </button>
          <button onClick={() => openAddAccount()}
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors">
            + 계좌 추가
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-5 gap-1 overflow-x-auto">
        {([['dashboard','📊 대시보드'],['holdings','💼 보유 종목'],['trades','📋 거래 이력'],['portfolio','🎯 포트폴리오']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setPageTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${pageTab === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ══ 대시보드 탭 ══════════════════════════════════════════════════════ */}
      {pageTab === 'dashboard' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
            <div className="text-xs opacity-70 mb-3">투자 현황 요약</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-xs opacity-70 mb-1">총 투자금액</div>
                <div className="text-lg font-bold">{fmtKRW(Math.round(portfolio.totalBuy))}</div>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-xs opacity-70 mb-1">총 평가금액</div>
                <div className="text-lg font-bold">{fmtKRW(Math.round(portfolio.totalEval + portfolio.totalDividend))}</div>
                {portfolio.totalDividend > 0 && (
                  <div className="text-xs opacity-60 mt-0.5">주식 {fmtKRW(Math.round(portfolio.totalEval))} + 예수금 {fmtKRW(Math.round(portfolio.totalDividend))}</div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className={`rounded-xl p-3 ${portfolio.unrealizedPnl >= 0 ? 'bg-emerald-400/30' : 'bg-red-400/30'}`}>
                <div className="text-xs opacity-70 mb-1">평가손익</div>
                <div className="text-base font-bold">{portfolio.unrealizedPnl >= 0 ? '+' : ''}{fmtKRW(Math.round(portfolio.unrealizedPnl))}</div>
                <div className="text-xs opacity-80">{fmtPct(portfolio.returnRate)}</div>
              </div>
              <div className={`rounded-xl p-3 ${portfolio.totalRealized >= 0 ? 'bg-emerald-400/20' : 'bg-red-400/20'}`}>
                <div className="text-xs opacity-70 mb-1">실현손익</div>
                <div className="text-base font-bold">{portfolio.totalRealized >= 0 ? '+' : ''}{fmtKRW(Math.round(portfolio.totalRealized))}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-xs opacity-70 mb-1">배당수익 합계</div>
                <div className="text-base font-bold text-emerald-300">+{fmtKRW(Math.round(portfolio.totalDividend))}</div>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-xs opacity-70 mb-1">납부 수수료</div>
                <div className="text-base font-bold text-white/60">-{fmtKRW(Math.round(portfolio.totalFee))}</div>
              </div>
            </div>
            {(portfolio.totalDividend > 0 || portfolio.totalRealized !== 0) && (
              <div className={`mt-3 rounded-xl p-3 ${portfolio.totalReturn >= 0 ? 'bg-emerald-400/30' : 'bg-red-400/30'}`}>
                <div className="text-xs opacity-70 mb-1">총 수익 (평가손익 + 실현손익 + 배당)</div>
                <div className="text-lg font-bold">{portfolio.totalReturn >= 0 ? '+' : ''}{fmtKRW(Math.round(portfolio.totalReturn))}</div>
              </div>
            )}
          </div>

          {investmentAccounts.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-3">계좌별 현황</div>
              <div className="space-y-3">
                {investmentAccounts.map(acc => {
                  const stats = portfolio.byAccount[acc.id]
                  if (!stats) return (
                    <div key={acc.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ backgroundColor: acc.color + '20', color: acc.color }}>
                        {getTypeLabel(acc.typeId).slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{acc.name}</div>
                        <div className="text-xs text-gray-400">{acc.bank} · {getTypeLabel(acc.typeId)}</div>
                      </div>
                      <div className="text-xs text-gray-400">종목 없음</div>
                    </div>
                  )
                  const pnl = stats.eval - stats.buy
                  const rate = stats.buy > 0 ? (pnl / stats.buy) * 100 : 0
                  return (
                    <div key={acc.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ backgroundColor: acc.color + '20', color: acc.color }}>
                        {getTypeLabel(acc.typeId).slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{acc.name}</div>
                        <div className="text-xs text-gray-400">{acc.bank} · {getTypeLabel(acc.typeId)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-gray-900">
                          {fmtKRW(Math.round(stats.eval + (stats.divs ?? 0)))}
                        </div>
                        <div className={`text-xs ${pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{pnl >= 0 ? '+' : ''}{fmtKRW(Math.round(pnl))} ({fmtPct(rate)})</div>
                        {(stats.divs ?? 0) > 0 && (
                          <div className="text-xs text-emerald-500">예수금 {fmtKRW(Math.round(stats.divs ?? 0))}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {Object.keys(portfolio.byType).length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-3">자산 유형별 비중</div>
              <div className="space-y-2">
                {Object.entries(portfolio.byType).sort((a, b) => b[1] - a[1]).map(([type, amt]) => {
                  const meta = ASSET_TYPE_META[type as InvestmentAssetType]
                  const pct = portfolio.totalEval > 0 ? (amt / portfolio.totalEval) * 100 : 0
                  return (
                    <div key={type}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700">{meta.icon} {meta.label}</span>
                        <span className="text-sm font-semibold text-gray-900">{fmtKRW(Math.round(amt))} <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span></span>
                      </div>
                      <div className="bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {investments.length === 0 && investmentAccounts.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">📈</div>
              <div className="text-sm">투자 계좌를 추가하고 종목을 기록해보세요!</div>
              <button onClick={() => openAddAccount()} className="mt-4 bg-indigo-600 text-white text-sm px-6 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors">+ 계좌 추가</button>
            </div>
          )}
        </div>
      )}

      {/* ══ 보유 종목 탭 ══════════════════════════════════════════════════════ */}
      {pageTab === 'holdings' && (
        <div className="space-y-5">
          {investmentAccounts.length === 0 && investments.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">💼</div>
              <div className="text-sm mb-1">먼저 투자 계좌를 추가해보세요</div>
              <div className="text-xs text-gray-400 mb-4">계좌별로 종목을 관리할 수 있습니다</div>
              <button onClick={() => openAddAccount()} className="bg-indigo-600 text-white text-sm px-6 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors">+ 계좌 추가</button>
            </div>
          )}

          {investmentAccounts.map(acc => {
            const accInvestments = investmentsByAccount.get(acc.id) ?? []
            const stats = portfolio.byAccount[acc.id]
            const isCollapsed = collapsedAccounts.has(acc.id)
            return (
              <div key={acc.id}>
                <div className="flex items-center gap-3 mb-3 cursor-pointer select-none"
                  onClick={() => toggleCollapse(acc.id)}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0" style={{ backgroundColor: acc.color + '20', color: acc.color }}>
                    {getTypeLabel(acc.typeId).slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                      {acc.name}
                      <span className="text-xs text-gray-400">{isCollapsed ? '▶' : '▼'}</span>
                    </div>
                    <div className="text-xs text-gray-400">{acc.bank} · {getTypeLabel(acc.typeId)} · {accInvestments.length}종목</div>
                  </div>
                  {stats && (
                    <div className="text-right mr-1">
                      <div className="text-sm font-semibold text-gray-900">
                        {fmtKRW(Math.round(stats.eval + (stats.divs ?? 0)))}
                      </div>
                      <div className={`text-xs ${stats.eval - stats.buy >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {stats.eval - stats.buy >= 0 ? '+' : ''}{fmtKRW(Math.round(stats.eval - stats.buy))}
                      </div>
                      {(stats.divs ?? 0) > 0 && (
                        <div className="text-xs text-emerald-500 font-medium">
                          예수금 {fmtKRW(Math.round(stats.divs ?? 0))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openAddInvestment(acc.id)}
                      className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors font-medium">
                      + 종목
                    </button>
                    <button onClick={() => openAddDividend(acc.id)}
                      className="text-xs bg-emerald-50 text-emerald-600 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors font-medium">
                      + 배당
                    </button>
                    <button onClick={() => openEditAccount(acc)}
                      className="text-xs text-gray-400 hover:text-blue-500 px-2 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                      ✏️
                    </button>
                    <button onClick={() => setDeleteAccountId(acc.id)}
                      className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                      🗑️
                    </button>
                  </div>
                </div>

                {!isCollapsed && (() => {
                  const accDividends = investmentDividends
                    .filter(d => d.accountId === acc.id)
                    .sort((a, b) => b.date.localeCompare(a.date))
                  const isAccDivExpanded = expandedDividendAccId === acc.id
                  const displayDividends = isAccDivExpanded ? accDividends : accDividends.slice(0, 3)
                  return (
                    <>
                      {accInvestments.length === 0 ? (
                        <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-400 border-2 border-dashed border-gray-200 mb-4">
                          <div className="text-2xl mb-1">📭</div>
                          <div className="text-xs">등록된 종목이 없습니다</div>
                          <button onClick={() => openAddInvestment(acc.id)} className="mt-2 text-xs text-blue-500 underline">+ 종목 추가</button>
                        </div>
                      ) : (
                        <div className="space-y-3 pl-1 border-l-2 mb-4" style={{ borderColor: acc.color + '60' }}>
                          {accInvestments.map(inv => renderInvestmentCard(inv))}
                        </div>
                      )}

                      {accDividends.length > 0 && (
                        <div className="bg-emerald-50 rounded-xl p-3 mt-2 mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="text-xs font-semibold text-emerald-700">💰 예수금 잔고 (배당 누계)</div>
                              <div className="text-base font-bold text-emerald-700">
                                +{fmtKRW(accDividends.reduce((s, d) => s + d.netAmount, 0))}
                              </div>
                            </div>
                            <div className="text-xs text-emerald-500">{accDividends.length}건</div>
                          </div>
                          <div className="space-y-1">
                            {displayDividends.map(d => {
                              const invName = d.investmentId ? investments.find(i => i.id === d.investmentId)?.name : undefined
                              return (
                                <div key={d.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-gray-700 font-medium">{d.date}</div>
                                    {invName && <div className="text-xs text-gray-400">{invName}</div>}
                                    {d.note && <div className="text-xs text-gray-400">{d.note}</div>}
                                  </div>
                                  <div className="text-right text-xs text-gray-400 flex-shrink-0">
                                    세후 <span className="text-emerald-600 font-semibold">{fmtKRW(d.netAmount)}</span>
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0">
                                    <button onClick={() => openEditDividend(d)} className="text-gray-400 hover:text-blue-500 px-1 py-0.5 rounded text-xs">✏️</button>
                                    <button onClick={() => setDeleteDividendId(d.id)} className="text-red-400 hover:text-red-600 px-1 py-0.5 rounded text-xs">🗑️</button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          {accDividends.length > 3 && (
                            <button
                              onClick={() => setExpandedDividendAccId(prev => prev === acc.id ? null : acc.id)}
                              className="mt-2 w-full text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                              {isAccDivExpanded ? '접기 ▲' : `더보기 (${accDividends.length - 3}건 더) ▼`}
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )
          })}

          {(investmentsByAccount.get('__none__') ?? []).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg">📦</div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-700">미분류</div>
                  <div className="text-xs text-gray-400">계좌가 지정되지 않은 종목</div>
                </div>
              </div>
              <div className="space-y-3 pl-1 border-l-2 border-gray-200">
                {(investmentsByAccount.get('__none__') ?? []).map(inv => renderInvestmentCard(inv))}
              </div>
            </div>
          )}

          {investmentAccounts.length > 0 && (
            <button onClick={() => openAddAccount()}
              className="w-full py-3 border-2 border-dashed border-indigo-200 text-indigo-500 rounded-2xl text-sm hover:bg-indigo-50 transition-colors">
              + 새 계좌 추가
            </button>
          )}
        </div>
      )}

      {/* ══ 거래 이력 탭 ══════════════════════════════════════════════════════ */}
      {pageTab === 'trades' && (
        <div>
          {/* 계좌 필터 (Row 1) */}
          {investmentAccounts.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              <button onClick={() => { setSelectedTradeAccountId(null); setSelectedInvestmentId(null) }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${!selectedTradeAccountId ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                전체 계좌
              </button>
              {investmentAccounts.map(acc => (
                <button key={acc.id} onClick={() => { setSelectedTradeAccountId(prev => prev === acc.id ? null : acc.id); setSelectedInvestmentId(null) }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${selectedTradeAccountId === acc.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                  {acc.name}
                </button>
              ))}
            </div>
          )}

          {/* 종목 필터 (Row 2) */}
          {tradeInvestments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => setSelectedInvestmentId(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${!selectedInvestmentId ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                전체 종목
              </button>
              {tradeInvestments.map(inv => (
                <button key={inv.id} onClick={() => setSelectedInvestmentId(prev => prev === inv.id ? null : inv.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${selectedInvestmentId === inv.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                  {ASSET_TYPE_META[inv.assetType].icon} {inv.name}
                </button>
              ))}
            </div>
          )}

          {/* 거래 목록 */}
          {tradeGroupsByInv ? (
            /* 전체 보기: 종목별 그룹화 */
            <div className="space-y-3">
              {tradeGroupsByInv.size === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-3xl mb-2">📋</div>
                  <div className="text-sm">거래 이력이 없습니다</div>
                </div>
              )}
              {Array.from(tradeGroupsByInv.entries()).map(([invId, trades]) => {
                const inv = investments.find(i => i.id === invId)
                const acc = inv?.accountId ? investmentAccounts.find(a => a.id === inv.accountId) : null
                const meta = inv ? ASSET_TYPE_META[inv.assetType] : null
                const isCollapsed = collapsedTradeInvIds.has(invId)
                const buyTotal = trades.filter(t => t.type === 'buy').reduce((s, t) => s + t.quantity * t.price, 0)
                const sellTotal = trades.filter(t => t.type === 'sell').reduce((s, t) => s + t.quantity * t.price, 0)
                const buyCount = trades.filter(t => t.type === 'buy').length
                const sellCount = trades.filter(t => t.type === 'sell').length
                return (
                  <div key={invId} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    {/* 그룹 헤더 */}
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                      onClick={() => setCollapsedTradeInvIds(prev => {
                        const next = new Set(prev)
                        if (next.has(invId)) next.delete(invId); else next.add(invId)
                        return next
                      })}>
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-base flex-shrink-0">
                        {meta?.icon ?? '📦'}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-semibold text-gray-900 truncate">{inv?.name ?? '알 수 없는 종목'}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                          {acc && <span className="text-indigo-400">{acc.name}</span>}
                          {acc && <span>·</span>}
                          <span>총 {trades.length}건</span>
                          {buyCount > 0 && <span className="text-blue-500">매수 {buyCount}건</span>}
                          {sellCount > 0 && <span className="text-red-400">매도 {sellCount}건</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 mr-1">
                        {buyTotal > 0 && <div className="text-xs text-red-400">매수 {fmtKRW(Math.round(buyTotal))}</div>}
                        {sellTotal > 0 && <div className="text-xs text-emerald-600">매도 +{fmtKRW(Math.round(sellTotal))}</div>}
                      </div>
                      <div className="text-gray-400 text-sm flex-shrink-0">{isCollapsed ? '▶' : '▼'}</div>
                    </button>
                    {/* 그룹 내 거래 목록 */}
                    {!isCollapsed && (
                      <div className="border-t border-gray-100 divide-y divide-gray-50">
                        {trades.map(trade => {
                          const isBuy = trade.type === 'buy'
                          const tradeAmt = trade.quantity * trade.price
                          return (
                            <div key={trade.id} className="flex items-center gap-3 px-4 py-3">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${isBuy ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-500'}`}>
                                {isBuy ? '매수' : '매도'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-gray-500">
                                  {trade.date} · {trade.quantity.toLocaleString()}주 × {trade.price.toLocaleString()}{trade.currency !== 'KRW' ? ` ${trade.currency}` : '원'}
                                </div>
                                {trade.note && <div className="text-xs text-gray-400">{trade.note}</div>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className={`text-sm font-semibold ${isBuy ? 'text-red-500' : 'text-emerald-600'}`}>
                                  {isBuy ? '-' : '+'}{fmtKRW(Math.round(tradeAmt))}
                                </div>
                                {trade.fee ? <div className="text-xs text-gray-400">수수료 {fmtKRW(trade.fee)}</div> : null}
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <button onClick={() => openEditTrade(trade)} className="text-xs text-gray-400 hover:text-blue-500 px-1.5 py-1 rounded-lg hover:bg-blue-50 transition-colors">✏️</button>
                                <button onClick={() => setDeleteTradeId(trade.id)} className="text-red-400 hover:text-red-600 text-xs px-1.5 py-1 rounded-lg hover:bg-red-50 transition-colors">🗑️</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            /* 특정 종목 선택: 기존 플랫 리스트 */
            <div className="space-y-2">
              {selectedTrades.map(trade => {
                const inv = investments.find(i => i.id === trade.investmentId)
                const acc = inv?.accountId ? investmentAccounts.find(a => a.id === inv.accountId) : null
                const isBuy = trade.type === 'buy'
                const tradeAmt = trade.quantity * trade.price
                return (
                  <div key={trade.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${isBuy ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-500'}`}>
                      {isBuy ? '매수' : '매도'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{inv?.name ?? '-'}</div>
                      <div className="text-xs text-gray-400">
                        {trade.date} · {trade.quantity.toLocaleString()}주 × {trade.price.toLocaleString()}{trade.currency !== 'KRW' ? ` ${trade.currency}` : '원'}
                        {acc && <span className="ml-1 text-indigo-400">· {acc.name}</span>}
                      </div>
                      {trade.note && <div className="text-xs text-gray-400">{trade.note}</div>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`text-sm font-semibold ${isBuy ? 'text-red-500' : 'text-emerald-600'}`}>
                        {isBuy ? '-' : '+'}{fmtKRW(Math.round(tradeAmt))}
                      </div>
                      {trade.fee ? <div className="text-xs text-gray-400">수수료 {fmtKRW(trade.fee)}</div> : null}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEditTrade(trade)} className="text-xs text-gray-400 hover:text-blue-500 px-1.5 py-1 rounded-lg hover:bg-blue-50 transition-colors">✏️</button>
                      <button onClick={() => setDeleteTradeId(trade.id)} className="text-red-400 hover:text-red-600 text-xs px-1.5 py-1 rounded-lg hover:bg-red-50 transition-colors">🗑️</button>
                    </div>
                  </div>
                )
              })}
              {selectedTrades.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-3xl mb-2">📋</div>
                  <div className="text-sm">거래 이력이 없습니다</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ 포트폴리오 관리 탭 (F-05) ══════════════════════════════════════════ */}
      {pageTab === 'portfolio' && (
        <div className="space-y-4">
          {holdingInvestments.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">🎯</div>
              <div className="text-sm">등록된 투자 내역이 없습니다</div>
              <div className="text-xs mt-1">보유 종목이 있어야 포트폴리오 관리를 사용할 수 있습니다</div>
            </div>
          ) : (
            <>
              {/* 목표 비율 설정 테이블 */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-gray-800">목표 비율 설정</div>
                  <div className={`text-xs font-medium px-2 py-1 rounded-lg ${Math.abs(targetPctSum - 100) < 0.01 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                    합계 {targetPctSum.toFixed(1)}%
                    {Math.abs(targetPctSum - 100) >= 0.01 && ' ⚠️ 100% 필요'}
                  </div>
                </div>
                <div className="space-y-2 mb-3">
                  {holdingInvestments.map(inv => (
                    <div key={inv.id} className="flex items-center gap-3">
                      <div className="flex-1 text-sm text-gray-700 truncate">{ASSET_TYPE_META[inv.assetType].icon} {inv.name}</div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min={0} max={100} step={0.1}
                          placeholder="0"
                          value={targetInputs[inv.id] ?? ''}
                          onChange={e => setTargetInputs(prev => ({ ...prev, [inv.id]: e.target.value }))}
                          className="w-20 text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-xs text-gray-400">%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleSaveTargetAllocations}
                  disabled={Math.abs(targetPctSum - 100) >= 0.01}
                  className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  저장하기
                </button>
              </div>

              {/* 현재 vs 목표 비율 비교 */}
              {investmentTargetAllocations.length > 0 && Math.abs(savedTargetPctSum - 100) < 0.01 && (
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-800 mb-3">현재 vs 목표 비율</div>
                  <div className="grid grid-cols-4 text-xs font-semibold text-gray-400 mb-2 px-1">
                    <span>종목</span>
                    <span className="text-right">목표</span>
                    <span className="text-right">현재</span>
                    <span className="text-right">차이</span>
                  </div>
                  <div className="space-y-1.5">
                    {holdingInvestments.map(inv => {
                      const saved = investmentTargetAllocations.find(a => a.investmentId === inv.id)
                      const targetPct = saved?.targetPct ?? 0
                      const curPct = currentPctMap[inv.id] ?? 0
                      const diff = curPct - targetPct
                      return (
                        <div key={inv.id} className="grid grid-cols-4 items-center py-1.5 border-b border-gray-50 last:border-0">
                          <div className="text-sm text-gray-700 truncate">{inv.name}</div>
                          <div className="text-right text-sm text-gray-600">{targetPct.toFixed(1)}%</div>
                          <div className="text-right text-sm text-gray-600">{curPct.toFixed(1)}%</div>
                          <div className={`text-right text-sm font-semibold ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 리밸런싱 추천 */}
              {investmentTargetAllocations.length > 0 && Math.abs(savedTargetPctSum - 100) < 0.01 && (
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-800 mb-3">리밸런싱 추천</div>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="number" min={0} placeholder="추가 투자 가능 금액 (원)"
                      value={additionalInvestment}
                      onChange={e => setAdditionalInvestment(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button onClick={handleCalcRebalance}
                      className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
                      계산
                    </button>
                  </div>
                  {rebalanceResult && (
                    <div>
                      <div className="grid grid-cols-3 text-xs font-semibold text-gray-400 mb-2 px-1">
                        <span>종목</span>
                        <span className="text-right">추천 매수금액</span>
                        <span className="text-right">예상 비율</span>
                      </div>
                      <div className="space-y-1.5">
                        {rebalanceResult.map(r => (
                          <div key={r.id} className="grid grid-cols-3 items-center py-1.5 border-b border-gray-50 last:border-0">
                            <div className="text-sm text-gray-700 truncate">{r.name}</div>
                            <div className="text-right text-sm font-semibold text-blue-600">{r.addAmt > 0 ? fmtKRW(Math.round(r.addAmt)) : '-'}</div>
                            <div className="text-right text-sm text-gray-600">{r.expectedPct.toFixed(1)}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── F-03: 계좌 유형 관리 모달 ─────────────────────────────────────────── */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">계좌유형 관리</h2>
              <button onClick={() => { setShowTypeModal(false); setEditTypeId(null); setNewTypeName('') }} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-2 mb-4">
              {investmentAccountTypes.map(t => (
                <div key={t.id} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                  {editTypeId === t.id ? (
                    <>
                      <input
                        type="text" value={editTypeName}
                        onChange={e => setEditTypeName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveTypeName(); if (e.key === 'Escape') setEditTypeId(null) }}
                        className="flex-1 border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <button onClick={handleSaveTypeName} className="text-xs text-blue-600 font-semibold px-2 py-1.5 rounded-lg hover:bg-blue-50">저장</button>
                      <button onClick={() => setEditTypeId(null)} className="text-xs text-gray-400 px-2 py-1.5 rounded-lg hover:bg-gray-100">취소</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-gray-800">{t.name}</span>
                      {t.isDefault && (
                        <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-medium">기본</span>
                      )}
                      <button onClick={() => { setEditTypeId(t.id); setEditTypeName(t.name) }}
                        className="text-xs text-gray-400 hover:text-blue-500 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                        수정
                      </button>
                      {!t.isDefault && (
                        <button onClick={() => handleDeleteType(t.id)}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                          삭제
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text" placeholder="새 유형 이름"
                value={newTypeName}
                onChange={e => setNewTypeName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddType() }}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button onClick={handleAddType} disabled={!newTypeName.trim()}
                className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-40">
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 계좌 추가/수정 모달 ────────────────────────────────────────────── */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editAccountId ? '계좌 수정' : '투자 계좌 추가'}</h2>
              <button onClick={() => setShowAccountModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <input type="text" placeholder="계좌명 * (예: 미래에셋 연금저축)" value={accountForm.name}
                onChange={e => setAccountForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <input type="text" placeholder="증권사 / 금융기관 (예: 미래에셋증권)" value={accountForm.bank}
                onChange={e => setAccountForm(f => ({ ...f, bank: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">계좌 유형</label>
                <div className="flex gap-2 flex-wrap">
                  {investmentAccountTypes.map(t => (
                    <button key={t.id} onClick={() => setAccountForm(f => ({ ...f, typeId: t.id }))}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${accountForm.typeId === t.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1.5">색상</label>
                <div className="flex gap-2 flex-wrap">
                  {ACCOUNT_COLORS.map(c => (
                    <button key={c} onClick={() => setAccountForm(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${accountForm.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                {editAccountId && (
                  <button onClick={() => setDeleteAccountId(editAccountId)}
                    className="px-4 py-3 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
                    삭제
                  </button>
                )}
                <button onClick={handleSaveAccount}
                  className="flex-1 bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-colors">
                  {editAccountId ? '수정 완료' : '계좌 추가'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 종목 등록/수정 모달 (F-04 자동완성 포함) ──────────────────────────── */}
      {showInvestmentModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editInvestmentId ? '종목 수정' : '종목 추가'}</h2>
              <button onClick={() => setShowInvestmentModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              {investmentAccounts.length > 0 && (
                <div>
                  <label className="text-xs text-gray-400 block mb-1.5">소속 계좌</label>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setInvestmentForm(f => ({ ...f, accountId: undefined }))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${!investmentForm.accountId ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200'}`}>
                      미분류
                    </button>
                    {investmentAccounts.map(acc => (
                      <button key={acc.id} onClick={() => setInvestmentForm(f => ({ ...f, accountId: acc.id }))}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${investmentForm.accountId === acc.id ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200'}`}
                        style={investmentForm.accountId === acc.id ? { backgroundColor: acc.color } : {}}>
                        {getTypeLabel(acc.typeId).slice(0, 1)} {acc.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-1.5 flex-wrap">
                {(Object.entries(ASSET_TYPE_META) as [InvestmentAssetType, typeof ASSET_TYPE_META[InvestmentAssetType]][]).map(([type, meta]) => (
                  <button key={type} onClick={() => setInvestmentForm(f => ({ ...f, assetType: type }))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${investmentForm.assetType === type ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                    {meta.icon} {meta.label}
                  </button>
                ))}
              </div>
              {/* F-04: 종목명 자동완성 */}
              <div className="relative">
                <input
                  ref={nameInputRef}
                  type="text" placeholder="종목명 / 코인명 *"
                  value={investmentForm.name}
                  onChange={e => { setInvestmentForm(f => ({ ...f, name: e.target.value })); setNameDropdownOpen(true) }}
                  onFocus={() => setNameDropdownOpen(true)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {nameDropdownOpen && nameSuggestions.length > 0 && (
                  <div ref={nameDropdownRef} className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                    {nameSuggestions.map((name, idx) => (
                      <button
                        key={idx}
                        onMouseDown={e => { e.preventDefault(); setInvestmentForm(f => ({ ...f, name })); setNameDropdownOpen(false) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors border-b border-gray-50 last:border-0">
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="티커 / 종목코드" value={investmentForm.ticker ?? ''}
                  onChange={e => setInvestmentForm(f => ({ ...f, ticker: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <input type="text" placeholder="거래소 / 운용사" value={investmentForm.exchange ?? ''}
                  onChange={e => setInvestmentForm(f => ({ ...f, exchange: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">거래 통화</label>
                <div className="flex gap-1.5">
                  {CURRENCIES.map(c => (
                    <button key={c} onClick={() => setInvestmentForm(f => ({ ...f, currency: c }))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${investmentForm.currency === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {!editInvestmentId && initialBuy && (
                <div className="border border-blue-100 bg-blue-50/50 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-semibold text-blue-600">첫 매수 정보 입력</div>
                  <input type="date" value={initialBuy.date}
                    onChange={e => setInitialBuy(b => b && ({ ...b, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">매수 수량 (주)</label>
                      <input type="number" min={0} step="any" placeholder="0"
                        value={initialBuy.quantity}
                        onChange={e => setInitialBuy(b => b && ({ ...b, quantity: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">매수 단가</label>
                      <input type="number" min={0} step="any" placeholder="0"
                        value={initialBuy.price}
                        onChange={e => setInitialBuy(b => b && ({ ...b, price: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">수수료 (선택)</label>
                    <input type="number" min={0} step="any" placeholder="0"
                      value={initialBuy.fee}
                      onChange={e => setInitialBuy(b => b && ({ ...b, fee: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  {initialBuy.quantity && initialBuy.price && (
                    <div className="text-xs text-blue-600 font-medium">
                      총 원금: {fmtKRW(Math.round(parseAmt(initialBuy.quantity) * parseAmt(initialBuy.price) + parseAmt(initialBuy.fee)))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                {editInvestmentId && (
                  <button onClick={() => setDeleteInvestmentId(editInvestmentId)}
                    className="px-4 py-3 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
                    삭제
                  </button>
                )}
                <button onClick={handleSaveInvestment}
                  className="flex-1 bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors">
                  {editInvestmentId ? '수정 완료' : '추가하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 거래 등록 모달 ────────────────────────────────────────────────── */}
      {showTradeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editTradeId ? '거래 수정' : '거래 등록'}</h2>
              <button onClick={() => { setShowTradeModal(false); setEditTradeId(null) }} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div className="flex bg-gray-100 rounded-xl p-1">
                {(['buy','sell'] as const).map(type => (
                  <button key={type} onClick={() => setTradeForm(f => ({ ...f, type }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tradeForm.type === type ? (type === 'buy' ? 'bg-blue-600 text-white' : 'bg-red-500 text-white') : 'text-gray-500'}`}>
                    {type === 'buy' ? '매수' : '매도'}
                  </button>
                ))}
              </div>
              <input type="date" value={tradeForm.date}
                onChange={e => setTradeForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">거래 수량 *</label>
                  <input type="number" min={0} step="any" placeholder="0" value={tradeForm.quantity || ''}
                    onChange={e => setTradeForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">거래 단가 *</label>
                  <input type="number" min={0} step="any" placeholder="0" value={tradeForm.price || ''}
                    onChange={e => setTradeForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {tradeForm.quantity > 0 && tradeForm.price > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 text-xs">
                  <span className="text-gray-500">거래금액: </span>
                  <span className="font-bold text-gray-900">{fmtKRW(Math.round(tradeForm.quantity * tradeForm.price))}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">수수료 (선택)</label>
                  <input type="number" min={0} placeholder="0" value={tradeForm.fee ?? ''}
                    onChange={e => setTradeForm(f => ({ ...f, fee: parseFloat(e.target.value) || undefined }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">환율 (외화 시)</label>
                  <input type="number" min={0} placeholder="예: 1380" value={tradeForm.exchangeRate ?? ''}
                    onChange={e => setTradeForm(f => ({ ...f, exchangeRate: parseFloat(e.target.value) || undefined }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <input type="text" placeholder="메모 (선택)" value={tradeForm.note ?? ''}
                onChange={e => setTradeForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={handleSaveTrade}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors">
                {editTradeId ? '수정 완료' : '거래 등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 배당금 입력 모달 ──────────────────────────────────────────────── */}
      {showDividendModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editDividendId ? '배당금 수정' : '배당금 입력'}</h2>
              <button onClick={() => { setShowDividendModal(false); setEditDividendId(null) }} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              {dividendAccountId && (
                <div className="bg-emerald-50 rounded-xl px-3 py-2 text-xs text-emerald-700 font-medium">
                  계좌: {investmentAccounts.find(a => a.id === dividendAccountId)?.name ?? dividendAccountId}
                </div>
              )}
              <div>
                <label className="text-xs text-gray-400 block mb-1">배당 종목 (선택)</label>
                <select
                  value={dividendForm.investmentId ?? ''}
                  onChange={e => setDividendForm(f => ({ ...f, investmentId: e.target.value || undefined }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white">
                  <option value="">선택 안함 (계좌 전체)</option>
                  {investments.filter(inv => inv.accountId === dividendAccountId).map(inv => (
                    <option key={inv.id} value={inv.id}>{inv.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">입금일 *</label>
                <input type="date" value={dividendForm.date}
                  onChange={e => setDividendForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">세전 배당금</label>
                  <input type="number" min={0} placeholder="0" value={dividendForm.grossAmount || ''}
                    onChange={e => {
                      const gross = parseFloat(e.target.value) || 0
                      const tax = dividendForm.tax
                      setDividendForm(f => ({ ...f, grossAmount: gross, netAmount: Math.max(0, gross - tax) }))
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">원천징수세액</label>
                  <input type="number" min={0} placeholder="0" value={dividendForm.tax || ''}
                    onChange={e => {
                      const tax = parseFloat(e.target.value) || 0
                      setDividendForm(f => ({ ...f, tax, netAmount: Math.max(0, f.grossAmount - tax) }))
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">실수령액 (세후) *</label>
                <input type="number" min={0} placeholder="0" value={dividendForm.netAmount || ''}
                  onChange={e => setDividendForm(f => ({ ...f, netAmount: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <input type="text" placeholder="메모 (선택)" value={dividendForm.note ?? ''}
                onChange={e => setDividendForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              {dividendForm.netAmount > 0 && (
                <div className="bg-emerald-50 rounded-xl p-3 text-xs">
                  <span className="text-gray-500">실수령액: </span>
                  <span className="font-bold text-emerald-700">{fmtKRW(dividendForm.netAmount)}</span>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                {editDividendId && (
                  <button onClick={() => { setDeleteDividendId(editDividendId); setShowDividendModal(false) }}
                    className="px-4 py-3 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors">
                    삭제
                  </button>
                )}
                <button onClick={handleSaveDividend}
                  disabled={!dividendAccountId || dividendForm.netAmount <= 0}
                  className="flex-1 bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {editDividendId ? '수정 완료' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteAccountId && (
        <DeleteConfirmModal
          message="계좌를 삭제해도 종목은 삭제되지 않으며 미분류로 이동됩니다."
          onConfirm={() => handleDeleteAccount(deleteAccountId)}
          onCancel={() => setDeleteAccountId(null)}
        />
      )}
      {deleteInvestmentId && (
        <DeleteConfirmModal
          message="종목을 삭제하면 해당 종목의 모든 거래 이력도 함께 삭제됩니다."
          onConfirm={() => handleDeleteInvestment(deleteInvestmentId)}
          onCancel={() => setDeleteInvestmentId(null)}
        />
      )}
      {deleteTradeId && (
        <DeleteConfirmModal
          onConfirm={() => handleDeleteTrade(deleteTradeId)}
          onCancel={() => setDeleteTradeId(null)}
        />
      )}
      {deleteDividendId && (
        <DeleteConfirmModal
          message="배당금 기록을 삭제합니다."
          onConfirm={() => handleDeleteDividend(deleteDividendId)}
          onCancel={() => setDeleteDividendId(null)}
        />
      )}
    </div>
  )
}
