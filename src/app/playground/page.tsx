'use client'

// ⚠️ 프로토타입 — '통계 탭 개편안' 미리보기. 실제 데이터 아님(샘플).
import { useState } from 'react'
import {
  BarChart, Bar, AreaChart, Area, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

function won(n: number) { return n.toLocaleString('ko-KR') }

type Row = { label: string; value: number; prev: number; good: 'up' | 'down' }
const ROWS: Row[] = [
  { label: '수입',     value: 3200000, prev: 3050000, good: 'up' },
  { label: '실소비',   value: 1200000, prev: 1304000, good: 'down' },
  { label: '카드대금', value: 1580000, prev: 1795000, good: 'down' },
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

const TREND = [
  { label: '12월', 수입: 2900000, 실소비: 1350000, 카드대금: 1650000, 저축: 300000, 투자: 100000, 제외: 60000, 저축률: 10 },
  { label: '1월',  수입: 3100000, 실소비: 1280000, 카드대금: 1700000, 저축: 350000, 투자: 120000, 제외: 40000, 저축률: 11 },
  { label: '2월',  수입: 3050000, 실소비: 1400000, 카드대금: 1620000, 저축: 380000, 투자: 150000, 제외: 90000, 저축률: 12 },
  { label: '3월',  수입: 3000000, 실소비: 1250000, 카드대금: 1550000, 저축: 400000, 투자: 200000, 제외: 50000, 저축률: 13 },
  { label: '4월',  수입: 3050000, 실소비: 1304000, 카드대금: 1795000, 저축: 417000, 투자: 150000, 제외: 70000, 저축률: 14 },
  { label: '5월',  수입: 3200000, 실소비: 1200000, 카드대금: 1580000, 저축: 500000, 투자: 300000, 제외: 50000, 저축률: 16 },
]
const DOW = [
  { label: '월', 소비: 180000 }, { label: '화', 소비: 120000 }, { label: '수', 소비: 150000 },
  { label: '목', 소비: 90000 },  { label: '금', 소비: 220000 }, { label: '토', 소비: 280000 }, { label: '일', 소비: 160000 },
]

function DeltaChip({ value, prev, good }: { value: number; prev: number; good: 'up' | 'down' }) {
  if (prev === 0) return <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-600">NEW</span>
  if (value === prev) return <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-400">— 0%</span>
  const isUp = value > prev
  const pct = Math.round(Math.abs((value - prev) / prev) * 100)
  const isGood = (good === 'up' && isUp) || (good === 'down' && !isUp)
  const cls = isGood ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
  return <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${cls}`}>{isUp ? '▲' : '▼'} {pct}%</span>
}

const manTick = (v: number | string) => `${Math.round(Number(v) / 10000)}만`
// 툴팁 컴팩트 스타일 (안 잘리게)
const tipContent = { fontSize: 11, padding: '6px 9px', borderRadius: 8, lineHeight: 1.35 }
const tipItem = { padding: 0, margin: 0 }
const tipLabel = { fontSize: 11, fontWeight: 700, marginBottom: 2 }

export default function PlaygroundPage() {
  const [detail, setDetail] = useState(false)
  const topMax = Math.max(...TOP_CATS.map(c => c.value))

  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto">
      <div className="inline-block text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded-lg mb-2">🧪 프로토타입 · 통계 개편안 · 샘플 데이터</div>
      <h1 className="text-xl font-bold text-gray-900">통계 미리보기</h1>
      <p className="text-sm text-gray-500 mt-1 mb-4">문득 궁금할 때 3초 만에 답을 주는 방향. (차트는 &lsquo;자세히&rsquo;로)</p>

      <div className="flex items-center justify-center gap-2 mb-3 text-sm">
        <span className="font-bold text-gray-800">2026년 5월</span>
        <span className="text-xs text-gray-400">vs 지난달(4월)</span>
      </div>

      {/* ① 이번 달 한눈에 — 모든 줄 같은 서식, 이번달·지난달 둘 다 */}
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
        <div className="text-sm font-bold text-gray-800 mb-3">이번 달 한눈에</div>
        <div className="divide-y divide-gray-50">
          {ROWS.map(r => (
            <div key={r.label} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-gray-700">{r.label}</span>
              <div className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm font-semibold tabular-nums text-gray-900">{won(r.value)}원</span>
                  <DeltaChip value={r.value} prev={r.prev} good={r.good} />
                </div>
                <div className="text-[11px] text-gray-400 tabular-nums mt-0.5">지난달 {won(r.prev)}원</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ② 인사이트 */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 mb-4">
        <div className="text-xs font-semibold text-blue-600 mb-2">한 줄 인사이트</div>
        <ul className="space-y-1.5">
          {INSIGHTS.map((t, i) => <li key={i} className="text-sm text-gray-700">{t}</li>)}
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

      {/* 자세히 보기 */}
      <button onClick={() => setDetail(d => !d)}
        className="w-full bg-white rounded-2xl shadow-sm p-4 text-sm font-medium text-gray-600 flex items-center justify-center gap-2">
        📊 자세히 보기 (월별 추이·요일별 등) {detail ? '▲' : '▼'}
      </button>

      {detail && (
        <div className="space-y-3 mt-2">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-sm font-bold text-gray-800 mb-0.5">최근 6개월 나간 돈 구성</div>
            <div className="text-[11px] text-gray-400 mb-3">막대 = 나간 돈(실소비·카드대금·저축·투자·제외), 선 = 수입</div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={TREND} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={manTick} width={34} />
                <Tooltip formatter={(v) => `${won(Number(v))}원`} contentStyle={tipContent} itemStyle={tipItem} labelStyle={tipLabel} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="실소비" stackId="out" fill="#FF6B6B" />
                <Bar dataKey="카드대금" stackId="out" fill="#F5A623" />
                <Bar dataKey="저축" stackId="out" fill="#0064FF" />
                <Bar dataKey="투자" stackId="out" fill="#6366F1" />
                <Bar dataKey="제외" stackId="out" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
                <Line dataKey="수입" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-sm font-bold text-gray-800 mb-3">월별 저축률 (%)</div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={TREND}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} width={28} />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={tipContent} itemStyle={tipItem} labelStyle={tipLabel} />
                <Area dataKey="저축률" stroke="#0064FF" fill="#0064FF" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="text-sm font-bold text-gray-800 mb-3">요일별 소비 패턴</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={DOW} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={manTick} width={34} />
                <Tooltip formatter={(v) => `${won(Number(v))}원`} contentStyle={tipContent} itemStyle={tipItem} labelStyle={tipLabel} />
                <Bar dataKey="소비" fill="#FF8E53" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center text-[11px] text-gray-400">※ 실제론 결제수단별·카드별 등도 여기에 들어가요</div>
        </div>
      )}

      <div className="text-center text-xs text-gray-400 py-5">이 방향 괜찮은지 / 빼거나 더할 것 알려주세요 😊</div>
    </div>
  )
}
