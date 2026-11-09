const $ = (id) => document.getElementById(id)
const send = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r) }))

async function load() {
  const s = await send({ type: 'GET_SETTINGS' })
  if (!s) return
  $('retentionDays').value = s.retentionDays
  $('alertThreshold').value = s.alertThreshold
  $('anchorEnabled').checked = !!s.anchorEnabled
  $('anchorEndpoint').value = s.anchorEndpoint || ''
}
$('save').onclick = async () => {
  await send({ type: 'SET_SETTINGS', patch: {
    retentionDays: Math.max(1, parseInt($('retentionDays').value || '90', 10)),
    alertThreshold: Math.max(1, parseFloat($('alertThreshold').value || '5')),
    anchorEnabled: $('anchorEnabled').checked,
    anchorEndpoint: $('anchorEndpoint').value.trim(),
  }})
  $('status').textContent = 'Saved.'
  setTimeout(() => $('status').textContent = '', 2000)
}
$('export').onclick = async () => {
  const rows = await send({ type: 'EXPORT_HASHES' })
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = '4d-receipt-hash-manifest.json'
  a.click()
}
$('wipe').onclick = async () => {
  if (!confirm('Wipe EVERYTHING? This cannot be undone.')) return
  if (!confirm('Really? There is no recovery.')) return
  await send({ type: 'WIPE_ALL' })
  $('status').textContent = 'All local data wiped.'
}
load()
