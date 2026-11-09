const $ = (id) => document.getElementById(id)

async function send(msg) {
  return new Promise((res) => chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r) }))
}

function fmtDate(ts) { return ts ? new Date(ts).toLocaleString() : 'never' }
function fmtDur(ms) {
  const m = Math.round((ms || 0) / 60000)
  if (m < 1) return '<1 min'; if (m < 60) return m + ' min'
  return Math.round(m / 60) + ' h ' + (m % 60) + ' m'
}

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !/^https?:/.test(tab.url || '')) { $('state').textContent = 'Not a web page.'; return }
  const r = await send({ type: 'GET_TAB_STATE', tabId: tab.id })
  if (!r || r.error || !r.page) {
    $('state').textContent = 'No receipt yet for this page. Visit it again later and changes will be tracked.'
    $('view').disabled = true; $('forget').disabled = true
    return
  }
  const p = r.page
  $('state').textContent = ''
  $('rows').innerHTML =
    row('Visits', p.visits) + row('Time spent', fmtDur(p.dwellMs)) +
    row('Changes seen', p.changeCount || 0) + row('Last change', fmtDate(p.lastChangeTs)) +
    row('First seen', fmtDate(p.firstSeen))
  if (r.diff) {
    const d = r.diff
    $('diffSummary').innerHTML =
      '<span class="badge ' + d.level + '">' + d.level.toUpperCase() + '</span> ' +
      'f_v ' + d.fv.fv + ' (ΔH ' + d.fv.deltaH + ', ΔQ ' + d.fv.deltaQ + ', Ō ' + d.fv.effort + ') · ' +
      new Date(d.ts).toLocaleString()
    $('view').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('diffview.html') + '?url=' + encodeURIComponent(p.url) })
  } else { $('view').disabled = true; $('diffSummary').textContent = 'No changes recorded yet.' }

  $('forget').onclick = async () => {
    if (!confirm('Delete every snapshot, diff and record for this site?')) return
    await send({ type: 'FORGET_SITE', url: p.url }); window.close()
  }
  $('wipe').onclick = async () => {
    if (!confirm('Wipe EVERYTHING - all sites, all snapshots, all diffs? This cannot be undone.')) return
    if (!confirm('Really? There is no recovery.')) return
    await send({ type: 'WIPE_ALL' }); window.close()
  }
  $('opts').onclick = () => chrome.runtime.openOptionsPage()
}
function row(k, v) { return '<div class="row"><span class="muted">' + k + '</span><span>' + v + '</span></div>' }
main()
