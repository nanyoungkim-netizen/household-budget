'use client'

// ⚠️ 프로토타입 — '통계 탭 개편안' 미리보기. 실제 데이터 아님(샘플).
import { useState } from 'react'

function won(n: number) { return n.toLocaleString('ko-KR') }

// 비교 행 (good = 좋은 방향)
type Row = { label: string; value: number; prev: number; good: 'up' | 'down'; strong?: boolean }
const ROWS: Row[] = [
  { label: '수입',     value: 3200000, prev: 3050000, good: 'up' },
  { label: '실소비',   value: 1200000, prev: 1304000, good: 'down', strong: true },
  { label: '카드대금', value: 1580000, prev: 1795000, good: 'down', strong: true },
  { label: '저축',     value: 500000,  prev: 417000,  good: 'up' },
  { label: '투자',     value: 300000,  prev: 150000,  good: 'up' },
]

const TOP_CATS = [
  { name: '식비',      icon: '🍽️', value: 420000, prev: 380000 },
  { name: '쇼핑·미용', icon: '🛍️', value: 280000, prev: 350000 },
  { name: '교통비',    icon: '🚌', value: 95000,  prev: 88000 },
  { name: '술·음료',   icon: '🍺', value: 80000,  prev: 120000 },
  { name: '여행',      icon: '✈️', value: 60000,  prev: 0 },
]

const INSIGHTS = [
  '💳 카드값이 지난달보다 12% 줄었어요 👏',
  '📈 투자를 지난달보다 2배 했어요',
  '🔮 이 페이스면 이번 달 실소비 약 155만원 예상돼요',
]

// 전월 대비 칩
function DeltaChip({ value, prev, good }: { value: number; prev: number; good: 'up' | 'down' }) {
  if (prev === 0) {
    return <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-600">NEW</span>
  }
  if (value === prev) {
    return <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-400">— 0%</span>
  }
  const isUp = value > prev
  const pct = Math.round(Math.abs((value - prev) / prev) * 100)
  const isGood = (good === 'up' && isUp) || (good === 'down' && !isUp)
  const cls = isGood ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
  return <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${cls}`}>{isUp ? '▲' : '▼'} {pct}%</span>
}

export default function PlaygroundPage() {
  const [detail, setDetail] = useState(false)
  const topMax = Math.max(...TOP_CATS.map(c => c.value))

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto">
      <div className="inline-block text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded-lg mb-2">🧪 프로토타입 · 통계 개편안 · 샘플 데이터</div>
      <h1 className="text-xl font-bold text-gray-900">통계 미리보기</h1>
      <p className="text-sm text-gray-500 mt-1 mb-4">문득 궁금할 때 3초 만에 답을 주는 방향. (차트는 &lsquo;자세히&rsquo;로)</p>

      {/* 기간 */}
      <div className="flex items-center justify-center gap-2 mb-3 text-sm">
        <span className="font-bold text-gray-800">2026년 5월</span>
        <span className="text-xs text-gray-400">vs 지난달(4월)</span>
      </div>

      {/* ① 이번 달 한눈에 */}
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
        <div className="text-sm font-bold text-gray-800 mb-3">이번 달 한눈에</div>
        <div className="space-y-2.5">
          {ROWS.map(r => (
            <div key={r.label} className="flex items-center justify-between">
              <span className={`text-gray-700 ${r.strong ? 'text-sm font-semibold' : 'text-sm'}`}>{r.label}</span>
              <div className="flex items-center gap-2">
                <span className={`tabular-nums text-gray-900 ${r.strong ? 'text-base font-bold' : 'text-sm font-semibold'}`}>{won(r.value)}원</span>
                <DeltaChip value={r.value} prev={r.prev} good={r.good} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ② 인사이트 */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 mb-4">
        <div className="text-xs font-semibold text-blue-600 mb-2">한 줄 인사이트</div>
        <ul className="space-y-1.5">
          {INSIGHTS.map((t, i) => (
            <li key={i} className="text-sm text-gray-700">{t}</li>
          ))}
        </ul>
      </div>

      {/* ③ 어디에 많이 썼나 */}
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
        <div className="text-sm font-bold text-gray-800 mb-3">어디에 많이 썼나 <span className="text-xs text-gray-400 font-normal">(실소비 TOP 5)</span></div>
        <div className="space-y-3">
          {TOP_CATS.map(c => (
            <div key={c.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-700">{c.icon} {c.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums text-gray-900">{won(c.value)}원</span>
                  <DeltaChip value={c.value} prev={c.prev} good="down" />
                </div>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full">
                <div className="h-1.5 rounded-full bg-red-300" style={{ width: `${(c.value / topMax) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 자세히 보기 (접힘) */}
      <button onClick={() => setDetail(d => !d)}
        className="w-full bg-white rounded-2xl shadow-sm p-4 text-sm font-medium text-gray-600 flex items-center justify-center gap-2">
        📊 자세히 보기 (월별 추이·요일별·카드별 차트) {detail ? '▲' : '▼'}
      </button>
      {detail && (
        <div className="bg-white rounded-2xl shadow-sm p-5 mt-2 text-center text-xs text-gray-400 border-2 border-dashed border-gray-200">
          여기에 기존 차트들(6개월 추이, 저축률, 요일별, 결제수단별 등)이 들어가요.<br />
          보고 싶은 사람만 펼쳐 보는 보조 영역으로.
        </div>
      )}

      <div className="text-center text-xs text-gray-400 py-5">
        이 방향 괜찮은지 / 빼거나 더할 것 알려주세요 😊
      </div>
    </div>
  )
}
