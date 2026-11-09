// 4D Receipt - transparency anchoring.
// Only the Merkle ROOT leaves the device - provable timestamp, zero content.
export async function anchorNow(settings, hashes) {
  if (!settings.anchorEnabled) return { skipped: true, reason: 'anchoring disabled' }
  if (!settings.anchorEndpoint) return { skipped: true, reason: 'no anchor endpoint configured' }
  if (!hashes || !hashes.length) return { skipped: true, reason: 'nothing to anchor' }

  const sorted = [...hashes].sort()
  let level = sorted.map(h => h)
  while (level.length > 1) {
    const next = []
    for (let i = 0; i < level.length; i += 2) {
      const pair = level[i + 1] ? level[i] + level[i + 1] : level[i] + level[i]
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pair))
      next.push(Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))
    }
    level = next
  }
  const root = level[0]

  try {
    const resp = await fetch(settings.anchorEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root, count: hashes.length, at: new Date().toISOString() }),
    })
    return { anchored: true, root, at: Date.now(), httpStatus: resp.status }
  } catch (e) {
    return { anchored: false, root, error: String(e) }
  }
}
