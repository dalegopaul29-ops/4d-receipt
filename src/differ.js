// 4D Receipt - diff engine + structural heuristics.
// deltaH: structural entropy delta (Shannon entropy over the paragraph-length
// distribution, old vs new). deltaQ: integrity delta placeholder - numeric
// churn + hedging-language shift. Both are transparent heuristics, documented
// in the README as such.

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const CAP = 600  // LCS is O(n*m); beyond this, fall back to set comparison

function lcsAlign(a, b) {
  const n = a.length, m = b.length
  const dp = new Uint16Array((n + 1) * (m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * (m + 1) + j] = a[i] === b[j]
        ? dp[(i + 1) * (m + 1) + j + 1] + 1
        : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1])
    }
  }
  const keptA = new Set(), keptB = new Set()
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { keptA.add(i); keptB.add(j); i++; j++ }
    else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) i++
    else j++
  }
  return { keptA, keptB }
}

const NUMBER_RE = /\d+(?:[.,]\d+)*/g
const HEDGES = ['may', 'might', 'could', 'allegedly', 'reportedly', 'rumored', 'rumoured', 'sources say', 'some say', 'it is believed', 'appears to', 'seems to', 'reportedly', 'unclear', 'uncertain', 'not confirmed', 'unverified', 'possibly', 'perhaps']

function countTokens(paras, re) {
  let n = 0
  for (const p of paras) { const m = p.toLowerCase().match(re); if (m) n += m.length }
  return n
}

function hedgingCount(paras) {
  const text = paras.join(' ').toLowerCase()
  let n = 0
  for (const h of HEDGES) {
    let idx = 0
    while ((idx = text.indexOf(h, idx)) !== -1) { n++; idx += h.length }
  }
  return n
}

function lengthEntropy(paras) {
  if (!paras.length) return 0
  const buckets = new Array(12).fill(0)
  for (const p of paras) {
    const bucket = Math.min(11, Math.floor(Math.log2(p.length + 1)))
    buckets[bucket]++
  }
  let h = 0
  for (const c of buckets) {
    if (!c) continue
    const p = c / paras.length
    h -= p * Math.log2(p)
  }
  return h
}

export function computeDiff(oldParas, newParas) {
  const removed = [], added = [], changed = []
  let deltaQ

  if (oldParas.length <= CAP && newParas.length <= CAP) {
    const { keptA, keptB } = lcsAlign(oldParas, newParas)
    const removedIdx = [], addedIdx = []
    for (let i = 0; i < oldParas.length; i++) if (!keptA.has(i)) removedIdx.push(i)
    for (let j = 0; j < newParas.length; j++) if (!keptB.has(j)) addedIdx.push(j)
    for (const i of removedIdx) removed.push(oldParas[i])
    for (const j of addedIdx) added.push(newParas[j])
    // pair adjacent removals/additions as "changed" for the viewer
    const pairs = Math.min(removedIdx.length, addedIdx.length)
    for (let k = 0; k < pairs; k++) {
      if (Math.abs(removedIdx[k] - (removedIdx[0] || 0)) <= newParas.length) {
        changed.push({ from: removed[k], to: added[k] })
      }
    }
    if (changed.length) { removed.splice(0, changed.length); added.splice(0, changed.length) }
  } else {
    const oldSet = new Set(oldParas)
    for (const p of newParas) if (!oldSet.has(p)) added.push(p)
    const newSet = new Set(newParas)
    for (const p of oldParas) if (!newSet.has(p)) removed.push(p)
  }

  // ---- heuristics ----
  const oldNums = countTokens(oldParas, NUMBER_RE), newNums = countTokens(newParas, NUMBER_RE)
  const oldHedge = hedgingCount(oldParas), newHedge = hedgingCount(newParas)
  const numericChurn = Math.abs(newNums - oldNums)
  const hedgeShift = Math.abs(newHedge - oldHedge)
  deltaQ = Math.round((numericChurn + 2 * hedgeShift) * 10) / 10

  const deltaH = Math.round(Math.abs(lengthEntropy(newParas) - lengthEntropy(oldParas)) * 100) / 100

  return { removed, added, changed, deltaH, deltaQ }
}
