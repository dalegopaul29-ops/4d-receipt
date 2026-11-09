// 4D Receipt - content script: page text extraction, dwell heartbeats, in-page badge.
// SECURITY RULE (extension-wide): we never capture what the user types.
// Extraction skips every form control, password field, contenteditable, and
// anything inside <form>, <script>, <style>, <noscript>, <svg>, <canvas>.

(function () {
  if (window.__fourdReceipt) return
  window.__fourdReceipt = true

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'CANVAS', 'IFRAME', 'SELECT', 'TEXTAREA', 'BUTTON', 'OPTION', 'INPUT'])
  const SKIP_ROLES = new Set(['navigation', 'banner', 'contentinfo', 'search', 'complementary'])
  const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'TD', 'TH', 'CAPTION', 'DT', 'DD', 'FIGCAPTION'])

  function isInsideSkipped(node) {
    let el = node.parentElement
    while (el) {
      if (SKIP_TAGS.has(el.tagName) || el.tagName === 'FORM' || el.isContentEditable) return true
      const role = el.getAttribute && el.getAttribute('role')
      if (role && SKIP_ROLES.has(role)) return true
      el = el.parentElement
    }
    return false
  }

  function extractParagraphs() {
    const root = document.querySelector('article, main, [role="main"], body') || document.body
    if (!root) return []
    const seen = new Set()
    const paras = []
    const nodes = root.querySelectorAll(Array.from(BLOCK_TAGS).join(','))
    for (const node of nodes) {
      if (seen.has(node)) continue
      // mark subtree so nested blocks (li inside li) are not double-counted
      node.querySelectorAll(Array.from(BLOCK_TAGS).join(',')).forEach(n => seen.add(n))
      if (node.closest('form') || isInsideSkipped(node)) continue
      const text = node.innerText ? node.innerText.replace(/\s+/g, ' ').trim() : ''
      if (text.length < 40) continue            // noise floor: menus, captions, fragments
      if (text.length > 4000) continue          // likely a code block or data dump
      paras.push(text)
    }
    return paras
  }

  // ---- dwell heartbeats (feeds Ō, the effort term of the f_v score) ----
  let dwellMs = 0
  let hidden = false
  document.addEventListener('visibilitychange', () => { hidden = document.hidden })
  setInterval(() => {
    if (hidden) return
    dwellMs += 5000
    try {
      chrome.runtime.sendMessage({ type: 'DWELL', url: location.href, ms: 5000 }, () => chrome.runtime.lastError)
    } catch (e) { /* extension context invalidated (reload/update) */ }
  }, 5000)

  // ---- in-page badge (only when the page changed since last visit) ----
  let badgeEl = null
  function renderBadge(text) {
    if (!text || text === '0') { if (badgeEl) { badgeEl.remove(); badgeEl = null } return }
    if (!badgeEl) {
      badgeEl = document.createElement('div')
      badgeEl.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;' +
        'background:#b3261e;color:#fff;font:600 13px/1.4 system-ui,sans-serif;' +
        'padding:8px 12px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.35);cursor:pointer;'
      badgeEl.title = 'This page changed since your last visit - click to view the diff'
      badgeEl.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_DIFFVIEW', url: location.href }, () => chrome.runtime.lastError)
      })
      document.documentElement.appendChild(badgeEl)
    }
    badgeEl.textContent = '4D Receipt: ' + text + ' change' + (text === '1' ? '' : 's') + ' - view'
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'EXTRACT') {
      const paras = extractParagraphs()
      sendResponse({ paras, url: location.href, dwellMs })
      return undefined
    }
    if (msg.type === 'BADGE') { renderBadge(String(msg.text || '')); sendResponse({ ok: true }); return undefined }
    return undefined
  })
})()
