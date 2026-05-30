'use client'

// ⚠️ 프로토타입(미리보기) 전용 페이지 — 실제 데이터/기능 아님. UI 방향 확인용.
import { useState } from 'react'

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, '0') }
function won(n: number) { return n.toLocaleString('ko-KR') }
function short(n: number) {
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '억'
  if (n >= 10000) return Math.round(n / 10000) + '만'
  return n.toLocaleString('ko-KR')
}
function lastDay(y: number, m0: number) { return new Date(y, m0 + 1, 0).getDate() }
function weekRange(ref: Date): [Date, Date] {
  const d = new Date(ref)
  const dow = (d.getDay() + 6) % 7 // 월요일=0
  const mon = new Date(d); mon.setDate(d.getDate() - dow)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return [mon, sun]
}

// 순수 기분전환 코멘트 풀
const COMMENTS = [
  '오늘도 좋은 하루 되세요 ☀️',
  '잘하고 있어요, 그거 알죠? 💪',
  '작은 기록이 큰 변화를 만들어요 🌱',
  '오늘의 나, 충분히 멋져요 ✨',
  '한 걸음씩이면 충분해요 🐢',
  '좋은 일이 생길 것 같은 날이에요 🍀',
  '천천히, 그러나 꾸준히 🌟',
  '스스로를 칭찬해주는 하루 되길 🤍',
]

const CATEGORY_SAMPLES = ['수입', '관리비', '적금', '교통비', '통신비', '보험료', '식비', '기타지출', '여행통장', '쇼핑·미용', '구독료', '자기계발']

// 기존 '기초설정 → 카테고리'의 역할 옵션(없음/적금·예금/카드대금) + 💹 투자 추가
const ROLE_OPTS: [string, string][] = [
  ['none', '없음'], ['savings', '💰 적금·예금'], ['card_payment', '💳 카드대금'], ['investment', '💹 투자'],
]

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-4 mb-5">
      <div className="text-sm font-bold text-gray-800">{title}</div>
      <div className="text-xs text-gray-400 mb-3">{desc}</div>
      {children}
    </div>
  )
}

export default function PlaygroundPage() {
  const today = new Date()

  // ── 대시보드: 일/주/월 + 네비게이터 ──
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  const [dashRef, setDashRef] = useState<Date>(new Date(today))

  function moveDash(dir: number) {
    const d = new Date(dashRef)
    if (view === 'day') d.setDate(d.getDate() + dir)
    else if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setMonth(d.getMonth() + dir)
    setDashRef(d)
  }
  const dashLabel = (() => {
    if (view === 'day') return `${dashRef.getFullYear()}.${pad(dashRef.getMonth() + 1)}.${pad(dashRef.getDate())}`
    if (view === 'week') { const [m, s] = weekRange(dashRef); return `${m.getMonth() + 1}.${m.getDate()} ~ ${s.getMonth() + 1}.${s.getDate()}` }
    return `${dashRef.getFullYear()}.${pad(dashRef.getMonth() + 1)}`
  })()

  // 샘플 숫자
  const sample = view === 'day'
    ? { income: 0, expense: 32000, net: -32000 }
    : view === 'week'
      ? { income: 0, expense: 214000, net: -214000 }
      : { income: 3200000, expense: 1840000, net: 1360000 }

  // ── 코멘트 ──
  const [commentIdx, setCommentIdx] = useState(0)

  // ── 거래내역: 카테고리 역할(성격) ──
  const [roles, setRoles] = useState<Record<string, string>>({
    '식비': 'none', '적금': 'savings', '카드대금': 'card_payment', '주식 매수': 'investment',
  })

  // ── 거래내역: 카테고리 검색 ──
  const [catQuery, setCatQuery] = useState('')
  const filteredCats = CATEGORY_SAMPLES.filter(c => c.includes(catQuery.trim()))

  // ── 거래내역: 날짜 필터 ──
  const [fMonth, setFMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  function autoRange(monthDate: Date): [string, string] {
    const y = monthDate.getFullYear(), m0 = monthDate.getMonth()
    const isThisMonth = y === today.getFullYear() && m0 === today.getMonth()
    const from = `${y}-${pad(m0 + 1)}-01`
    const to = isThisMonth ? `${y}-${pad(m0 + 1)}-${pad(today.getDate())}` : `${y}-${pad(m0 + 1)}-${pad(lastDay(y, m0))}`
    return [from, to]
  }
  const [range, setRange] = useState<[string, string]>(() => autoRange(new Date(today.getFullYear(), today.getMonth(), 1)))
  function moveMonth(dir: number) {
    const d = new Date(fMonth); d.setMonth(d.getMonth() + dir)
    setFMonth(d); setRange(autoRange(d))
  }

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto">
      <div className="mb-5">
        <div className="inline-block text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded-lg mb-2">🧪 프로토타입 · 실제 데이터 아님</div>
        <h1 className="text-xl font-bold text-gray-900">UI 미리보기</h1>
        <p className="text-sm text-gray-500 mt-1">눌러보고 마음에 드는 방향을 골라주세요. 여기서 OK 나면 실제 화면에 반영할게요.</p>
      </div>

      {/* 1. 대시보드 요약 카드 */}
      <Section title="① 대시보드 — 인사 코멘트 + 요약 카드" desc="실제 적용: 맨 위 '안녕하세요' 자리를 코멘트로 교체 + 이 카드만 교체. 아래 자산별·총잔액은 그대로 유지!">
        {/* 코멘트 */}
        <div className="bg-white rounded-2xl p-4 mb-3 flex items-center justify-between gap-3">
          <div className="text-base font-bold text-gray-900">{COMMENTS[commentIdx]}</div>
          <button onClick={() => setCommentIdx(i => (i + 1) % COMMENTS.length)}
            className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">🎲 다른 코멘트</button>
        </div>

        {/* 일/주/월 토글 + 네비 */}
        <div className="bg-white rounded-2xl p-3 mb-3 flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1 flex-shrink-0">
            {(['day', 'week', 'month'] as const).map(m => (
              <button key={m} onClick={() => setView(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === m ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>
                {m === 'day' ? '일별' : m === 'week' ? '주별' : '월별'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 flex-1 justify-center">
            <button onClick={() => moveDash(-1)} className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500 text-lg">‹</button>
            <span className="text-sm font-semibold text-gray-800 min-w-[110px] text-center">{dashLabel}</span>
            <button onClick={() => moveDash(1)} className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-500 text-lg">›</button>
          </div>
          <button onClick={() => setDashRef(new Date(today))}
            className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1.5 flex-shrink-0">
            {view === 'day' ? '오늘' : view === 'week' ? '이번주' : '이번달'}
          </button>
        </div>

        {/* 요약 카드 — 기존 스타일 그대로, 일별에서 순수입만 제외 */}
        <div className="bg-blue-600 rounded-2xl p-5 text-white">
          <div className="text-xs opacity-70 mb-3">{dashLabel} 현황</div>
          <div className={`grid gap-2 ${view === 'day' ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <div className="bg-white/10 rounded-xl p-3">
              <div className="text-xs opacity-70 mb-1">수입</div>
              <div className="text-base font-bold tabular-nums">+{won(sample.income)}</div>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <div className="text-xs opacity-70 mb-1">지출</div>
              <div className="text-base font-bold tabular-nums">-{won(sample.expense)}</div>
            </div>
            {view !== 'day' && (
              <div className={`rounded-xl p-3 ${sample.net >= 0 ? 'bg-emerald-400/30' : 'bg-red-400/30'}`}>
                <div className="text-xs opacity-70 mb-1">순수입</div>
                <div className="text-base font-bold tabular-nums">{sample.net >= 0 ? '+' : ''}{won(sample.net)}</div>
              </div>
            )}
          </div>
          {view === 'day' && <div className="text-[11px] opacity-60 mt-2">일별은 순수입 빼고 수입·지출만</div>}
        </div>
        {/* 실제 화면엔 이 아래에 기존 자산별 금액·총잔액이 그대로 유지돼요 */}
        <div className="mt-2 border-2 border-dashed border-gray-200 rounded-xl p-3 text-center text-[11px] text-gray-400">
          ↓ 실제 대시보드엔 여기 아래로 기존 <b>자산별 금액·총잔액</b>이 그대로 있어요 (안 건드림)
        </div>
      </Section>

      {/* 2. 거래내역 대표 숫자 — 배열 안 비교 */}
      <Section title="② 거래내역 — 대표 숫자 배열 (A/B/C 비교)" desc="수입·지출·저축·투자·제외 5개를 줄바꿈 없이 어떻게 보여줄지 골라주세요">
        {(() => {
          const buckets = [
            { label: '수입', value: 3200000, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: '지출', value: 1200000, color: 'text-red-500', bg: 'bg-red-50' },
            { label: '저축', value: 500000, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: '투자', value: 300000, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: '제외', value: 250000, color: 'text-gray-500', bg: 'bg-gray-100' },
          ]
          return (
            <div className="space-y-4">
              {/* A안: 5칸 한 줄 + 만 단위 축약 */}
              <div>
                <div className="text-xs font-semibold text-blue-600 mb-1">A안 · 5칸 한 줄 (만 단위 축약)</div>
                <div className="grid grid-cols-5 gap-1">
                  {buckets.map(c => (
                    <div key={c.label} className={`${c.bg} rounded-lg p-2 text-center`}>
                      <div className="text-[10px] text-gray-500 mb-0.5">{c.label}</div>
                      <div className={`text-xs font-bold tabular-nums ${c.color} whitespace-nowrap`}>{short(c.value)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* B안: 가로 스크롤 + 정확한 원 단위 */}
              <div>
                <div className="text-xs font-semibold text-blue-600 mb-1">B안 · 가로 스크롤 (정확한 금액, 옆으로 밀기)</div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {buckets.map(c => (
                    <div key={c.label} className={`${c.bg} rounded-lg p-2.5 text-center flex-shrink-0 min-w-[84px]`}>
                      <div className="text-[10px] text-gray-500 mb-0.5">{c.label}</div>
                      <div className={`text-sm font-bold tabular-nums ${c.color} whitespace-nowrap`}>{won(c.value)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* C안: 수입·지출 강조 2칸 + 저축·투자·제외 3칸 */}
              <div>
                <div className="text-xs font-semibold text-blue-600 mb-1">C안 · 수입·지출 크게 + 저축·투자·제외 작게</div>
                <div className="grid grid-cols-2 gap-2 mb-1.5">
                  {buckets.slice(0, 2).map(c => (
                    <div key={c.label} className={`${c.bg} rounded-xl p-3 text-center`}>
                      <div className="text-xs text-gray-500 mb-0.5">{c.label}</div>
                      <div className={`text-base font-bold tabular-nums ${c.color} whitespace-nowrap`}>{won(c.value)}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {buckets.slice(2).map(c => (
                    <div key={c.label} className={`${c.bg} rounded-lg p-2 text-center`}>
                      <div className="text-[10px] text-gray-500 mb-0.5">{c.label}</div>
                      <div className={`text-xs font-bold tabular-nums ${c.color} whitespace-nowrap`}>{won(c.value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })()}
        <div className="text-[11px] text-gray-400 mt-3">※ &apos;제외&apos; = 카드대금·여행통장 등 예산에서 빼둔 항목</div>
      </Section>

      {/* 3. 카테고리 역할 — 기존 + 투자 추가 */}
      <Section title="③ 카테고리 역할 — 기존 그대로 + 💹 투자만 추가" desc="새 화면 아님! '기초설정 → 카테고리'의 역할(없음/적금·예금/카드대금)에 투자 옵션만 더함">
        <div className="space-y-2">
          {['식비', '적금', '카드대금', '주식 매수'].map(cat => (
            <div key={cat} className="bg-white rounded-xl p-2.5 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-700 flex-shrink-0">{cat}</span>
              <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 flex-wrap justify-end">
                {ROLE_OPTS.map(([val, label]) => (
                  <button key={val} onClick={() => setRoles(s => ({ ...s, [cat]: val }))}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                      (roles[cat] ?? 'none') === val ? 'bg-blue-600 text-white' : 'text-gray-400'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-gray-400 mt-2">※ &apos;투자&apos; 역할인 카테고리는 ②의 투자 버킷으로 집계돼요</div>
      </Section>

      {/* 4. 카테고리 검색 */}
      <Section title="④ 거래내역 — 카테고리 검색칸" desc="기존 필터는 그대로, 그 아래에 검색칸 추가 → 빠르게 찾아 선택">
        <input
          value={catQuery}
          onChange={e => setCatQuery(e.target.value)}
          placeholder="카테고리 검색…"
          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex flex-wrap gap-1.5">
          {filteredCats.map(c => (
            <span key={c} className="text-xs bg-white border border-gray-200 rounded-full px-3 py-1.5 text-gray-600">{c}</span>
          ))}
          {filteredCats.length === 0 && <span className="text-xs text-gray-400 py-1.5">검색 결과가 없어요</span>}
        </div>
      </Section>

      {/* 5. 날짜 필터 */}
      <Section title="⑤ 거래내역 — 날짜 필터" desc="월 화살표 이동 → 자동 기간(이번 달은 1일~오늘, 지난 달은 1일~말일) + 직접 수정 가능">
        <div className="bg-white rounded-2xl p-3">
          <div className="flex items-center justify-center gap-2 mb-3">
            <button onClick={() => moveMonth(-1)} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 text-lg">‹</button>
            <span className="text-sm font-bold text-gray-800 min-w-[90px] text-center">{fMonth.getFullYear()}.{pad(fMonth.getMonth() + 1)}</span>
            <button onClick={() => moveMonth(1)} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-500 text-lg">›</button>
          </div>
          <div className="flex gap-1.5 justify-center mb-3">
            {[
              { label: '이번 달', fn: () => { const d = new Date(today.getFullYear(), today.getMonth(), 1); setFMonth(d); setRange(autoRange(d)) } },
              { label: '지난 달', fn: () => { const d = new Date(today.getFullYear(), today.getMonth() - 1, 1); setFMonth(d); setRange(autoRange(d)) } },
            ].map(p => (
              <button key={p.label} onClick={p.fn}
                className="text-xs bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 text-gray-600">{p.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 justify-center">
            <input type="date" value={range[0]} onChange={e => setRange([e.target.value, range[1]])}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
            <span className="text-gray-400">~</span>
            <input type="date" value={range[1]} onChange={e => setRange([range[0], e.target.value])}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
          </div>
          <div className="text-[11px] text-gray-400 text-center mt-2">선택 기간: {range[0]} ~ {range[1]}</div>
        </div>
      </Section>

      <div className="text-center text-xs text-gray-400 py-4">
        마음에 드는 것 / 바꾸고 싶은 것 알려주세요. 확정되면 실제 화면에 반영할게요 😊
      </div>
    </div>
  )
}
