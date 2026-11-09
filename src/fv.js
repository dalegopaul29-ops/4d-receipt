// 4D Receipt - f_v significance scoring.
// EXPERIMENTAL heuristic, an application of the Gopaul Equation
// f_v = Ō / (ΔH + ΔQ + 1). NOT validated science (see README honesty notes).
// Ō = reader effort on this source: dwell time + visit history, log-scaled.

export function computeFV(page, deltaH, deltaQ) {
  const dwellMin = (page.dwellMs || 0) / 60000
  const visits = page.visits || 1
  const effort = Math.round(Math.log1p(dwellMin) * 10 + Math.log1p(visits) * 5) / 10
  const denom = deltaH + deltaQ + 1
  const fv = Math.round((effort / denom) * 100) / 100
  return { deltaH, deltaQ, effort, fv }
}

export function alertLevel(fvResult, threshold) {
  const t = Math.max(1, threshold || 5)
  if (fvResult.fv >= t) return 'alert'
  if (fvResult.fv >= t * 0.5) return 'notice'
  return 'none'
}
