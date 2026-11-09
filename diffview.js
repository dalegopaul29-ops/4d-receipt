const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r) }))

async function main() {
  const url = new URLSearchParams(location.search).get('url') || ''
  document.getElementById('url').textContent = url
  const r = await send({ type: 'GET_LATEST_DIFF', url })
  if (!r || r.error) { document.getElementById('meta').textContent = 'No changes recorded for this page yet.'; return }
  document.getElementById('meta').innerHTML =
    'Last change: ' + new Date(r.ts).toLocaleString() +
    ' · <span class="badge ' + r.level + '">' + r.level.toUpperCase() + '</span>'
  document.getElementById('score').innerHTML = '<span class="score">f_v ' + r.fv.fv +
    ' (ΔH ' + r.fv.deltaH + ' · ΔQ ' + r.fv.deltaQ + ' · Ō ' + r.fv.effort + ')</span>'

  const blocks = (arr, cls) => (arr && arr.length) ? arr.map(t => '<div class="' + cls + '">' + esc(t) + '</div>').join('') : '—'
  document.getElementById('removed').innerHTML = blocks(r.removed, 'del')
  document.getElementById('added').innerHTML = blocks(r.added, 'add')

  if (r.changed && r.changed.length) {
    const c = document.createElement('div')
    c.innerHTML = '<h3>Changed</h3>' + r.changed.map(x =>
      '<div class="chg"><div class="from">' + esc(x.from) + '</div><div class="to">' + esc(x.to) + '</div></div>').join('')
    document.querySelector('.cols').appendChild(c)
  }
}
main()
