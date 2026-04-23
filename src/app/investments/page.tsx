'use client'

import { useState, useMemo } from 'react'
import { useApp } from '@/lib/AppContext'
import { Investment, InvestmentTrade, InvestmentAssetType, InvestmentCurrency } from '@/types'
import DeleteConfirmModal from '@/components/DeleteConfirmModal'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function fmtPct(n: number) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%' }
function parseAmt(s: string) { return parseFloat(s.replace(/[^0-9.]/g, '')) || 0 }
function fmtInput(s: string) { const n = parseAmt(s); return n === 0 ? '' : n.toLocaleString('ko-KR') }

const today = new Date().toISOString().slice(0, 10)

const ASSET_TYPE_META: Record<InvestmentAssetType, { label: string; icon: string; color: string }> = {
  domestic_stock: { label: '국내 주식',  icon: '🇰🇷', color: '#3B82F6' },
  foreign_stock:  { label: '해외 주식',  icon: '🌏', color: '#8B5CF6' },
  etf_fund:       { label: 'ETF/펀드',   icon: '📊', color: '#10B981' },
  crypto:         { label: '가상화폐',   icon: '₿',  color: '#F59E0B' },
}

const CURRENCIES: InvestmentCurrency[] = ['KRW', 'USD', 'USDT', 'other']

type PageTab = 'dashboard' | 'holdings' | 'trades'

const EMPTY_INVESTMENT: Omit<Investment, 'id'> = {
  assetType: 'domestic_stock',
  name: '',
  ticker: '',
  exchange: '',
  currency: 'KRW',
  currentPrice: undefined,
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

export default function InvestmentsPage() {
  const { data, setInvestments, setInvestmentTrades } = useApp()
  const { investments, investmentTrades } = data

  const [pageTab, setPageTab] = useState<PageTab>('dashboard')
  const [showInvestmentModal, setShowInvestmentModal] = useState(false)
  const [showTradeModal, setShowTradeModal] = useState(false)
  const [editInvestmentId, setEditInvestmentId] = useState<string | null>(null)
  const [editTradeId, setEditTradeId] = useState<string | null>(null)
  const [tradeInvestmentId, setTradeInvestmentId] = useState<string | null>(null)
  const [selectedInvestmentId, setSelectedInvestmentId] = useState<string | null>(null)
  const [deleteInvestmentId, setDeleteInvestmentId] = useState<string | null>(null)
  const [deleteTradeId, setDeleteTradeId] = useState<string | null>(null)

  const [investmentForm, setInvestmentForm] = useState<Omit<Investment, 'id'>>(EMPTY_INVESTMENT)
  const [tradeForm, setTradeForm] = useState<Omit<InvestmentTrade, 'id' | 'investmentId'>>(EMPTY_TRADE)
  const [currentPriceInput, setCurrentPriceInput] = useState<Record<string, string>>({})
  const [initialBuy, setInitialBuy] = useState<{ date: string; quantity: string; price: string; fee: string } | null>(null)

  // ── 보유 종목별 계산 ────────────────────────────────────────────────────────
  const holdingsMap = useMemo(() => {
    const map = new Map<string, {
      investment: Investment
      avgPrice: number
      holdingQty: number
      totalBuyAmt: number
      realizedPnl: number
    }>()

    investments.forEach(inv => {
      const trades = investmentTrades
        .filter(t => t.investmentId === inv.id)
        .sort((a, b) => a.date.localeCompare(b.date))

      let holdingQty = 0
      let totalBuyAmt = 0
      let realizedPnl = 0

      trades.forEach(trade => {
        const tradeAmt = trade.quantity * trade.price
        const fee = trade.fee ?? 0
        if (trade.type === 'buy') {
          holdingQty += trade.quantity
          totalBuyAmt += tradeAmt + fee
        } else {
          const avgCost = holdingQty > 0 ? totalBuyAmt / holdingQty : 0
          const sellRevenue = tradeAmt - fee
          realizedPnl += sellRevenue - avgCost * trade.quantity
          holdingQty = Math.max(0, holdingQty - trade.quantity)
          totalBuyAmt = holdingQty * avgCost
        }
      })

      const avgPrice = holdingQty > 0 ? totalBuyAmt / holdingQty : 0
      map.set(inv.id, { investment: inv, avgPrice, holdingQty, totalBuyAmt, realizedPnl })
    })
    return map
  }, [investments, investmentTrades])

  // ── 포트폴리오 요약 ────────────────────────────────────────────────────────
  const portfolio = useMemo(() => {
    let totalBuy = 0, totalEval = 0, totalRealized = 0
    const byType: Record<string, number> = {}

    holdingsMap.forEach(({ investment, holdingQty, totalBuyAmt, realizedPnl }) => {
      const currentPrice = investment.currentPrice ?? 0
      const evalAmt = holdingQty * currentPrice
      totalBuy += totalBuyAmt
      totalEval += evalAmt
      totalRealized += realizedPnl
      const type = investment.assetType
      byType[type] = (byType[type] || 0) + evalAmt
    })

    const unrealizedPnl = totalEval - totalBuy
    const returnRate = totalBuy > 0 ? (unrealizedPnl / totalBuy) * 100 : 0
    return { totalBuy, totalEval, unrealizedPnl, returnRate, totalRealized, byType }
  }, [holdingsMap])

  // ── 종목 등록/수정 ─────────────────────────────────────────────────────────
  function openAddInvestment() {
    setEditInvestmentId(null)
    setInvestmentForm(EMPTY_INVESTMENT)
    setInitialBuy({ date: today, quantity: '', price: '', fee: '' })
    setShowInvestmentModal(true)
  }

  function openEditInvestment(inv: Investment) {
    setEditInvestmentId(inv.id)
    setInvestmentForm({ assetType: inv.assetType, name: inv.name, ticker: inv.ticker, exchange: inv.exchange, currency: inv.currency, currentPrice: inv.currentPrice })
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
      // 첫 매수 정보 입력된 경우 거래 이력에도 추가, 현재가를 매수 단가로 자동 설정
      if (initialBuy && initialBuy.quantity && initialBuy.price) {
        const qty = parseAmt(initialBuy.quantity)
        const price = parseAmt(initialBuy.price)
        const fee = parseAmt(initialBuy.fee)
        if (qty > 0 && price > 0) {
          // 현재가 자동 = 매수 단가
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

  // ── 거래 등록 ──────────────────────────────────────────────────────────────
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

  // ── 보유 종목 목록 ─────────────────────────────────────────────────────────
  const holdingsList = Array.from(holdingsMap.values()).filter(h => h.holdingQty > 0)

  // 선택된 종목의 거래 이력
  const selectedTrades = selectedInvestmentId
    ? investmentTrades.filter(t => t.investmentId === selectedInvestmentId).sort((a, b) => b.date.localeCompare(a.date))
    : investmentTrades.sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">투자 내역 관리</h1>
        <button onClick={openAddInvestment}
          className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">
          + 종목 추가
        </button>
      </div>

      {/* 탭 */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-5 gap-1">
        {([['dashboard','📊 대시보드'],['holdings','💼 보유 종목'],['trades','📋 거래 이력']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setPageTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${pageTab === key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ══ 대시보드 탭 ══════════════════════════════════════════════════════ */}
      {pageTab === 'dashboard' && (
        <div className="space-y-4">
          {/* 총 요약 */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
            <div className="text-xs opacity-70 mb-3">투자 현황 요약</div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-xs opacity-70 mb-1">총 투자금액</div>
                <div className="text-lg font-bold">{fmtKRW(Math.round(portfolio.totalBuy))}</div>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-xs opacity-70 mb-1">총 평가금액</div>
                <div className="text-lg font-bold">{fmtKRW(Math.round(portfolio.totalEval))}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-xl p-3 ${portfolio.unrealizedPnl >= 0 ? 'bg-emerald-400/30' : 'bg-red-400/30'}`}>
                <div className="text-xs opacity-70 mb-1">평가손익</div>
                <div className="text-base font-bold">{fmtKRW(Math.round(portfolio.unrealizedPnl))}</div>
                <div className="text-xs opacity-80">{fmtPct(portfolio.returnRate)}</div>
              </div>
              <div className={`rounded-xl p-3 ${portfolio.totalRealized >= 0 ? 'bg-emerald-400/20' : 'bg-red-400/20'}`}>
                <div className="text-xs opacity-70 mb-1">실현손익</div>
                <div className="text-base font-bold">{fmtKRW(Math.round(portfolio.totalRealized))}</div>
              </div>
            </div>
          </div>

          {/* 자산 유형별 비중 */}
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

          {investments.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">📈</div>
              <div className="text-sm">종목을 추가하고 투자를 기록해보세요!</div>
              <button onClick={openAddInvestment} className="mt-4 bg-blue-600 text-white text-sm px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-colors">+ 종목 추가</button>
            </div>
          )}
        </div>
      )}

      {/* ══ 보유 종목 탭 ══════════════════════════════════════════════════════ */}
      {pageTab === 'holdings' && (
        <div className="space-y-3">
          {holdingsList.length === 0 && investments.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-2">💼</div>
              <div className="text-sm">보유 중인 종목이 없습니다</div>
              <button onClick={openAddInvestment} className="mt-4 bg-blue-600 text-white text-sm px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-colors">+ 종목 추가</button>
            </div>
          )}
          {/* 미보유 종목 포함 전체 목록 */}
          {investments.map(inv => {
            const h = holdingsMap.get(inv.id)
            const meta = ASSET_TYPE_META[inv.assetType]
            const currentPrice = inv.currentPrice ?? 0
            const evalAmt = (h?.holdingQty ?? 0) * currentPrice
            const evalPnl = evalAmt - (h?.totalBuyAmt ?? 0)
            const evalRate = h?.totalBuyAmt ? (evalPnl / h.totalBuyAmt) * 100 : 0
            const isProfit = evalPnl >= 0

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
                  </div>
                )}

                {/* 현재가 수동 업데이트 */}
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
              </div>
            )
          })}
        </div>
      )}

      {/* ══ 거래 이력 탭 ══════════════════════════════════════════════════════ */}
      {pageTab === 'trades' && (
        <div>
          {/* 종목 필터 */}
          {investments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => setSelectedInvestmentId(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${!selectedInvestmentId ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                전체
              </button>
              {investments.map(inv => (
                <button key={inv.id} onClick={() => setSelectedInvestmentId(prev => prev === inv.id ? null : inv.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${selectedInvestmentId === inv.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                  {ASSET_TYPE_META[inv.assetType].icon} {inv.name}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {selectedTrades.map(trade => {
              const inv = investments.find(i => i.id === trade.investmentId)
              const isBuy = trade.type === 'buy'
              const tradeAmt = trade.quantity * trade.price
              return (
                <div key={trade.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${isBuy ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-500'}`}>
                    {isBuy ? '매수' : '매도'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{inv?.name ?? '-'}</div>
                    <div className="text-xs text-gray-400">{trade.date} · {trade.quantity.toLocaleString()}주 × {trade.price.toLocaleString()}{trade.currency !== 'KRW' ? ` ${trade.currency}` : '원'}</div>
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
        </div>
      )}

      {/* ── 종목 등록/수정 모달 ────────────────────────────────────────────── */}
      {showInvestmentModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">{editInvestmentId ? '종목 수정' : '종목 추가'}</h2>
              <button onClick={() => setShowInvestmentModal(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              {/* 자산 유형 */}
              <div className="flex gap-1.5 flex-wrap">
                {(Object.entries(ASSET_TYPE_META) as [InvestmentAssetType, typeof ASSET_TYPE_META[InvestmentAssetType]][]).map(([type, meta]) => (
                  <button key={type} onClick={() => setInvestmentForm(f => ({ ...f, assetType: type }))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${investmentForm.assetType === type ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                    {meta.icon} {meta.label}
                  </button>
                ))}
              </div>
              <input type="text" placeholder="종목명 / 코인명 *" value={investmentForm.name}
                onChange={e => setInvestmentForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
              {/* 첫 매수 정보 (신규 등록 시만) */}
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
              {/* 매수/매도 */}
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
    </div>
  )
}
