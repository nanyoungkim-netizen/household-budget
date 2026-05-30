'use client'

// ⚠️ 프로토타입(미리보기) 전용 페이지 — 실제 데이터/기능 아님. UI 방향 확인용.
import { useState } from 'react'

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, '0') }
function won(n: number) { return n.toLocaleString('ko-KR') }
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

const CATEGORY_SAMPLES = ['식비', '교통비', '통신비', '쇼핑·미용', '여행', '적금', '주식 매수', '카드대금', '구독료', '생활비', '보험료', '자기계발']

type Nature = '소비' | '저축' | '투자' | '이체'
const NATURES: Nature[] = ['소비', '저축', '투자', '이체']

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

  // ── 거래내역: 카테고리 성격 ──
  const [natures, setNatures] = useState<Record<string, Nature>>({
    '식비': '소비', '적금': '저축', '주식 매수': '투자', '카드대금': '이체',
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
      <Section title="① 대시보드 — 인사 코멘트 + 요약 카드" desc="안녕하세요 제거 → 매일 바뀌는 코멘트 / 일·주·월 + 지출 강조">
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

        {/* 요약 카드 — 지출 강조 */}
        <div className="bg-blue-600 rounded-2xl p-5 text-white">
          <div className="text-xs opacity-70 mb-3">{dashLabel} 현황</div>
          {/* 지출을 가장 크게 */}
          <div className="bg-white/10 rounded-xl p-4 mb-2 text-center">
            <div className="text-xs opacity-70 mb-1">지출</div>
            <div className="text-3xl font-bold tabular-nums">-{won(sample.expense)}</div>
          </div>
          <div className={`grid ${view === 'day' ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <div className="text-xs opacity-70 mb-1">수입</div>
              <div className="text-base font-bold tabular-nums">+{won(sample.income)}</div>
            </div>
            {view !== 'day' && (
              <div className={`rounded-xl p-3 text-center ${sample.net >= 0 ? 'bg-emerald-400/30' : 'bg-red-400/30'}`}>
                <div className="text-xs opacity-70 mb-1">순수입</div>
                <div className="text-base font-bold tabular-nums">{sample.net >= 0 ? '+' : ''}{won(sample.net)}</div>
              </div>
            )}
          </div>
          {view === 'day' && <div className="text-[11px] opacity-60 mt-2 text-center">일별은 수입·지출만 (순수입 제외)</div>}
        </div>
      </Section>

      {/* 2. 거래내역 대표 숫자 */}
      <Section title="② 거래내역 — 대표 숫자 4갈래" desc="지출(소비)에서 저축·투자·이체 제외 → 따로 표시">
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: '수입', value: 3200000, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: '지출 (소비)', value: 1200000, color: 'text-red-500', bg: 'bg-red-50' },
            { label: '저축', value: 500000, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: '투자', value: 300000, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map(c => (
            <div key={c.label} className={`${c.bg} rounded-xl p-3 text-center`}>
              <div className="text-xs text-gray-500 mb-1">{c.label}</div>
              <div className={`text-lg font-bold tabular-nums ${c.color}`}>{won(c.value)}</div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-gray-400 mt-2">※ &apos;지출&apos;은 실제 소비만 — 저축·투자·이체는 빠짐</div>
      </Section>

      {/* 3. 카테고리 성격 토글 */}
      <Section title="③ 카테고리 '성격' 토글" desc="이름과 무관하게 카테고리마다 소비/저축/투자/이체 지정 (기본은 똑똑하게)">
        <div className="space-y-2">
          {['식비', '적금', '주식 매수', '카드대금'].map(cat => (
            <div key={cat} className="bg-white rounded-xl p-2.5 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-700">{cat}</span>
              <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
                {NATURES.map(n => (
                  <button key={n} onClick={() => setNatures(s => ({ ...s, [cat]: n }))}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                      (natures[cat] ?? '소비') === n ? 'bg-blue-600 text-white' : 'text-gray-400'
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
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
