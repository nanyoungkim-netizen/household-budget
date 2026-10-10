/**
 * 가져오기(통장 내역)에서 "어디로 간 돈인지"를 찾는다.
 *   - 이체      → 받는 계좌        (예: "김지연(모임통장)" → 토스 모임통장)
 *   - 저축 납입 → 적금·예금·청약 상품 (예: "주택청약" → 주택청약종합저축)
 *
 * 우선순위: ① 과거에 같은 적요를 실제로 어떻게 처리했는지 ② 이름 매칭 ③ (저축) 그 유형의 상품이 하나뿐일 때
 * 확신이 없으면 고르지 않는다 — 엉뚱한 계좌로 자동 지정하는 것보다 "확인 필요"로 남기는 게 낫다.
 */
import type { Account, Category, Saving, Transaction } from '@/types'
import { normalizeDesc } from './descLibrary'

// ── 공통 ─────────────────────────────────────────────────────────────────────

/** 가장 긴 공통 부분 문자열 길이 */
function lcs(a: string, b: string): number {
  if (!a || !b) return 0
  let best = 0
  const prev = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    let diag = 0
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0
      if (prev[j] > best) best = prev[j]
      diag = tmp
    }
  }
  return best
}

/** 이력에서 같은(또는 서로 포함하는) 적요로 가장 많이 쓴 값 */
function topFromHistory(key: string, history: Map<string, Map<string, number>>, allow: (v: string) => boolean) {
  if (key.length < 2) return null
  const tally = new Map<string, number>()
  for (const [d, counts] of history) {
    if (d === key || key.includes(d) || d.includes(key)) {
      for (const [v, n] of counts) if (allow(v)) tally.set(v, (tally.get(v) || 0) + n)
    }
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  return top ? { value: top[0], count: top[1] } : null
}

function addTo(history: Map<string, Map<string, number>>, desc: string, value: string) {
  const d = normalizeDesc(desc)
  if (d.length < 2 || !value) return
  const m = history.get(d) ?? new Map<string, number>()
  m.set(value, (m.get(value) || 0) + 1)
  history.set(d, m)
}

// ── 이력 색인 (buildRows에서 1회 생성) ───────────────────────────────────────
export interface MatchHistory {
  transferTo: Map<string, Map<string, number>>   // 적요 → 받는 계좌 id
  savingOf:   Map<string, Map<string, number>>   // 적요 → 저축 상품 id
}

export function buildMatchHistory(txs: Transaction[]): MatchHistory {
  const transferTo = new Map<string, Map<string, number>>()
  const savingOf = new Map<string, Map<string, number>>()
  for (const t of txs) {
    if (t.type === 'transfer' && t.toAccountId) addTo(transferTo, t.description, t.toAccountId)
    for (const l of t.savingLinks ?? []) addTo(savingOf, t.description, l.savingId)
  }
  return { transferTo, savingOf }
}

// ── 저축 ─────────────────────────────────────────────────────────────────────
const SAVING_TYPE_LABEL: Record<Saving['type'], string> = { saving: '적금', deposit: '예금', subscription: '청약' }

/** 적금·예금·청약으로 보이는 적요 */
export const isSavingLikeDesc = (desc: string) => /적금|청약|저축|도약|희망|예금납입/.test(normalizeDesc(desc))

/** 저축 카테고리인지 (거래 화면의 isSavingCat과 같은 기준) */
export function isSavingCategory(categoryId: string, categories: Category[]): boolean {
  const cat = categories.find(c => c.id === categoryId)
  if (!cat || cat.type !== 'expense') return false
  if (cat.role === 'savings' || cat.savingId) return true
  const parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null
  return parent?.role === 'savings'
}

export interface SavingMatch { saving: Saving; reason: string }

export function matchSaving(desc: string, savings: Saving[], history: MatchHistory): SavingMatch | null {
  const active = savings.filter(s => s.status !== 'matured')
  if (active.length === 0) return null
  const key = normalizeDesc(desc)
  if (key.length < 2) return null

  // ① 이력
  const h = topFromHistory(key, history.savingOf, id => active.some(s => s.id === id))
  if (h) return { saving: active.find(s => s.id === h.value)!, reason: `이전에 ${h.count}번 이 상품에 납입` }

  // ② 상품명 매칭 — "주택청약" ⊂ "주택청약종합저축"
  const byName = active
    .map(s => ({ s, n: normalizeDesc(s.name) }))
    .filter(({ n }) => n.length >= 2 && (key.includes(n) || n.includes(key)))
    .sort((a, b) => b.n.length - a.n.length)
  if (byName.length === 1 || (byName.length > 1 && byName[0].n.length > byName[1].n.length)) {
    return { saving: byName[0].s, reason: '상품명 일치' }
  }

  // ③ 유형 키워드 + 그 유형 상품이 하나뿐
  const type: Saving['type'] | null =
    key.includes('청약') ? 'subscription' : /적금|도약|희망/.test(key) ? 'saving' : key.includes('예금') ? 'deposit' : null
  if (type) {
    const same = active.filter(s => s.type === type)
    if (same.length === 1) return { saving: same[0], reason: `${SAVING_TYPE_LABEL[type]} 상품이 하나뿐이라 자동 연동` }
  }
  return null
}

/** 저축 상품을 기록할 카테고리: 상품에 연결된 카테고리 → 유형 이름이 든 저축 카테고리 → 아무 저축 카테고리 */
export function savingCategoryFor(saving: Saving | null, categories: Category[]): string {
  const linked = saving && categories.find(c => c.savingId === saving.id)
  if (linked) return linked.id
  const leaves = categories.filter(c => c.type === 'expense' && c.parentId !== null && isSavingCategory(c.id, categories))
  const label = saving ? SAVING_TYPE_LABEL[saving.type] : ''
  return (
    (label && leaves.find(c => c.name.includes(label))) ||
    leaves.find(c => /적금|저축/.test(c.name)) ||
    leaves[0]
  )?.id ?? ''
}

// ── 이체 받는 계좌 ───────────────────────────────────────────────────────────
// 계좌명 비교에서 의미 없는 공통어는 빼고 본다 ('모임통장' vs '토스 모임통장' → '모임'으로 비교)
const ACCOUNT_STOP = ['통장', '계좌', '은행', '뱅크', '이체', '송금', '입금', '출금', '자동', '모바일', '인터넷', '입출금']
const stripStop = (s: string) => ACCOUNT_STOP.reduce((acc, w) => acc.split(w).join(''), normalizeDesc(s))

export interface AccountMatch { account: Account; reason: string }

export function matchTransferAccount(
  desc: string, accounts: Account[], fromAccountId: string, history: MatchHistory,
): AccountMatch | null {
  const cands = accounts.filter(a => a.id !== fromAccountId)
  if (cands.length === 0) return null
  const key = normalizeDesc(desc)

  // ① 이력
  const h = topFromHistory(key, history.transferTo, id => cands.some(a => a.id === id))
  if (h) return { account: cands.find(a => a.id === h.value)!, reason: `이전에 ${h.count}번 이 계좌로 보냄` }

  // ② 계좌 이름(+은행명)과 겹치는 부분이 가장 긴 계좌 — 2글자 이상, 동점이면 고르지 않음
  const k = stripStop(desc)
  const scored = cands
    .map(a => ({ a, s: Math.max(lcs(k, stripStop(a.name)), lcs(k, stripStop(`${a.bank}${a.name}`))) }))
    .sort((x, y) => y.s - x.s)
  if (scored[0].s >= 2 && (scored.length === 1 || scored[0].s > scored[1].s)) {
    return { account: scored[0].a, reason: '계좌 이름 일치' }
  }
  return null
}
