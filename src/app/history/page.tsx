'use client'

import { useState, useRef, useCallback } from 'react'
import { parseExcelFile, summarizeByMonth, ParseResult, HistoryRecord } from '@/lib/excelParser'
import { DEFAULT_CATEGORIES } from '@/lib/AppContext'

function fmtKRW(n: number) { return n.toLocaleString('ko-KR') + '원' }
function fmtShort(n: number) {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억'
  if (n >= 10000) return (n / 10000).toFixed(0) + '만'
  return n.toLocaleString()
}

type ViewMode = 'monthly' | 'detail' | 'category'

export default function HistoryPage() {
  const [result, setResult] = useState<ParseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('monthly')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFile(file: File) {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const parsed = await parseExcelFile(file)
      setResult(parsed)
      setSelectedMonth(null)
    } catch (e) {
      setError('파일을 읽는 중 오류가 발생했습니다. 엑셀 파일을 확인해주세요.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [])

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  // 필터 적용된 전체 records
  const filteredRecords = result ? result.allRecords.filter(r => {
    if (yearFilter !== 'all' && !r.date.startsWith(yearFilter)) return false
    if (typeFilter !== 'all' && r.type !== typeFilter) return false
    return true
  }) : []

  const monthlySummary = summarizeByMonth(filteredRecords)
  const availableYears = result
    ? [...new Set(result.allRecords.map(r => r.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a))
    : []

  // 선택된 월 상세 데이터
  const selectedData = selectedMonth
    ? monthlySummary.find(m => m.month === selectedMonth)
    : null

  // 카테고리별 집계
  const catSummary = filteredRecords
    .filter(r => r.type === 'expense')
    .reduce<Record<string, number>>((acc, r) => {
      acc[r.categoryId] = (acc[r.categoryId] || 0) + r.amount
      return acc
    }, {})
  const sortedCats = Object.entries(catSummary)
    .sort(([, a], [, b]) => b - a)
  const totalCatExpense = sortedCats.reduce((s, [, v]) => s + v, 0)

  const totalIncome = filteredRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
  const totalExpense = filteredRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">이전 가계부</h1>
        <p className="text-sm text-gray-500 mt-1">기존 엑셀 파일을 업로드해서 과거 데이터를 조회해보세요</p>
      </div>

      {/* 업로드 영역 */}
      {!result && (
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
            dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          {loading ? (
            <div>
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-sm text-gray-600">파일을 읽는 중...</p>
            </div>
          ) : (
            <div>
              <div className="text-5xl mb-4">📂</div>
              <p className="text-base font-semibold text-gray-700 mb-1">엑셀 파일을 드래그하거나 클릭해서 업로드</p>
              <p className="text-sm text-gray-400">.xlsx, .xls 파일 지원</p>
              {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            </div>
          )}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div>
          {/* 상단 요약 + 다시 업로드 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 rounded-xl px-3 py-1.5 text-xs font-medium text-blue-600">
                총 {result.totalRecords.toLocaleString()}건 · {result.sheets.length}개 시트
              </div>
              <div className="bg-gray-100 rounded-xl px-3 py-1.5 text-xs font-medium text-gray-600">
                {result.sheets[result.sheets.length - 1]?.year}년 ~ {result.sheets[0]?.year}년
              </div>
            </div>
            <button
              onClick={() => { setResult(null); setSelectedMonth(null); if (inputRef.current) inputRef.current.value = '' }}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
            >
              <span>🔄</span> 다시 업로드
            </button>
          </div>

          {/* 필터 */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select value={yearFilter} onChange={e => { setYearFilter(e.target.value); setSelectedMonth(null) }}
              className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="all">전체 연도</option>
              {availableYears.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="all">수입+지출</option>
              <option value="income">수입만</option>
              <option value="expense">지출만</option>
            </select>
            <div className="flex bg-white rounded-xl p-0.5 border border-gray-200">
              {([['monthly', '월별'], ['category', '카테고리'], ['detail', '상세']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setViewMode(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === k ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* 총계 카드 */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs text-gray-500 mb-1">총 수입</div>
              <div className="text-base font-bold text-emerald-600">+{fmtShort(totalIncome)}원</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs text-gray-500 mb-1">총 지출</div>
              <div className="text-base font-bold text-red-500">-{fmtShort(totalExpense)}원</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-xs text-gray-500 mb-1">순수입</div>
              <div className={`text-base font-bold ${totalIncome - totalExpense >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
                {fmtShort(totalIncome - totalExpense)}원
              </div>
            </div>
          </div>

          {/* 월별 보기 */}
          {viewMode === 'monthly' && (
            <div className="space-y-2">
              {monthlySummary.map(({ month, income, expense, items }) => {
                const isSelected = selectedMonth === month
                return (
                  <div key={month} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <button
                      onClick={() => setSelectedMonth(isSelected ? null : month)}
                      className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-900">{month}</span>
                        <span className="text-xs text-gray-400">{items.length}건</span>
                      </div>
                      <div className="flex items-center gap-4">
                        {income > 0 && <span className="text-sm font-medium text-emerald-600">+{fmtShort(income)}</span>}
                        {expense > 0 && <span className="text-sm font-medium text-red-500">-{fmtShort(expense)}</span>}
                        <span className={`text-xs transition-transform ${isSelected ? 'rotate-180' : ''}`}>▼</span>
                      </div>
                    </button>
                    {isSelected && selectedData && (
                      <div className="border-t border-gray-50 px-5 py-3 space-y-2 max-h-64 overflow-y-auto">
                        {selectedData.items
                          .sort((a, b) => b.amount - a.amount)
                          .map((r: HistoryRecord) => {
                            const cat = DEFAULT_CATEGORIES.find(c => c.id === r.categoryId)
                            return (
                              <div key={r.id} className="flex items-center justify-between py-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{cat?.icon || '📦'}</span>
                                  <div>
                                    <div className="text-sm text-gray-900">{r.description}</div>
                                    <div className="text-xs text-gray-400">{cat?.name}</div>
                                  </div>
                                </div>
                                <span className={`text-sm font-medium ${r.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {r.type === 'income' ? '+' : '-'}{fmtKRW(r.amount)}
                                </span>
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </div>
                )
              })}
              {monthlySummary.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-3xl mb-2">📭</div>
                  <div className="text-sm">해당 조건의 데이터가 없습니다</div>
                </div>
              )}
            </div>
          )}

          {/* 카테고리별 보기 */}
          {viewMode === 'category' && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 grid grid-cols-3 text-xs font-semibold text-gray-500">
                <span>카테고리</span>
                <span className="text-right">금액</span>
                <span className="text-right">비율</span>
              </div>
              {sortedCats.map(([catId, amount]) => {
                const cat = DEFAULT_CATEGORIES.find(c => c.id === catId)
                const pct = totalCatExpense > 0 ? (amount / totalCatExpense * 100) : 0
                return (
                  <div key={catId} className="border-b border-gray-50 last:border-0">
                    <div className="px-4 py-3 grid grid-cols-3 items-center">
                      <div className="flex items-center gap-2">
                        <span>{cat?.icon || '📦'}</span>
                        <span className="text-sm text-gray-700">{cat?.name || catId}</span>
                      </div>
                      <div className="text-right text-sm font-semibold text-gray-900">{fmtKRW(amount)}</div>
                      <div className="text-right text-sm text-gray-500">{pct.toFixed(1)}%</div>
                    </div>
                    <div className="px-4 pb-2">
                      <div className="bg-gray-100 rounded-full h-1">
                        <div className="h-1 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 상세 보기 */}
          {viewMode === 'detail' && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 grid grid-cols-4 text-xs font-semibold text-gray-500">
                <span>날짜</span>
                <span>내용</span>
                <span>카테고리</span>
                <span className="text-right">금액</span>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {filteredRecords
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 500)
                  .map(r => {
                    const cat = DEFAULT_CATEGORIES.find(c => c.id === r.categoryId)
                    return (
                      <div key={r.id} className="px-4 py-2.5 border-b border-gray-50 last:border-0 grid grid-cols-4 items-center hover:bg-gray-50">
                        <span className="text-xs text-gray-500">{r.date.slice(0, 7)}</span>
                        <span className="text-sm text-gray-900 truncate">{r.description}</span>
                        <span className="text-xs text-gray-400">{cat?.icon} {cat?.name}</span>
                        <span className={`text-sm font-medium text-right ${r.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                          {r.type === 'income' ? '+' : '-'}{fmtKRW(r.amount)}
                        </span>
                      </div>
                    )
                  })}
                {filteredRecords.length > 500 && (
                  <div className="text-center py-3 text-xs text-gray-400">최대 500건 표시 중 (전체 {filteredRecords.length}건)</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
