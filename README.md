# 4D Receipt

**Your personal change-log for the web.** Every page you visit gets a receipt —
and when you come back, 4D Receipt shows you exactly what changed since you were
last there. The web stops being an amnesiac medium.

> "This page has been edited 4 times since your last visit. Show changes."

## Install (development)

1. Clone or download this folder.
2. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked**.
3. Select this folder. Done — no accounts, no servers, no sign-up.

## How it works

| Layer | What it does |
|---|---|
| **Snapshot** | On each visit, the content script extracts the page's main text and the background worker stores it, content-addressed (SHA-256), **encrypted with AES-GCM on your device**. |
| **Diff** | On revisit, the new text is diffed against your last snapshot (LCS over paragraphs). Output: removed / added / changed blocks. |
| **Score** | Every change is scored with **ΔH** (structural entropy delta), **ΔQ** (integrity delta: numeric churn + hedging-language shift), and **Ō** (your effort on that source), combined into an **f_v** significance score. |
| **Alert** | You only get interrupted when a change matters *to you*: high f_v = red badge + in-page notice. |
| **Anchor** | Optionally, a Merkle root over your snapshot hashes is anchored to a public transparency endpoint — provable timestamps **without any content ever leaving your device**. |

## Data: local-first, yours, deletable

- Everything lives on your machine. There is no 4D Receipt server.
- **One-click total wipe** (popup or settings): every snapshot, diff, and setting — gone, permanently.
- **Per-site forget**, retention windows, and auto-prune.
- **Honest limitation:** the AES key lives in extension storage, so at-rest
  protection ultimately relies on OS disk encryption. Passphrase-locked keys
  are on the roadmap. Also: anchored Merkle roots are permanent, but contain
  no content — only hashes.

## Honesty notes (read before marketing anything)

- The **f_v layer is an experimental significance heuristic** — a mapping of the
  Gopaul Equation (f_v = Ō/(ΔH+ΔQ+1)) onto change-detection. It is **not
  validated science** (current evidence: synthetic validation, one degenerate
  n=1 pilot). Market it as "our significance-ranking engine" — never as
  "proven" or "scientifically validated."
- The falsification test is cheap: A/B f_v against a plain LLM significance
  call. If it wins or ties, the claim becomes "tested against alternatives."
- ΔQ (integrity delta) is a transparent heuristic placeholder — numeric churn
  and hedging language. Direction labels ("softened," "sourced better") are
  roadmap, not implemented.

## Roadmap

- Watchlist re-checks without visiting (offscreen document — MV3 service
  workers can't parse DOM reliably)
- Coordinated ΔH detection across many sources (the newsroom-tier feature —
  requires an opt-in shared layer; this build is deliberately 100% local)
- Passphrase-locked encryption keys
- E2E encrypted multi-device sync
- Firefox port (MV3-compatible with minor manifest changes)

## File map

```
manifest.json        MV3 manifest
src/background.js    service worker: visits, snapshots, diffs, scoring, alarms, messages
src/content.js       page extraction, dwell heartbeats, in-page badge
src/storage.js       IndexedDB layer + AES-GCM + wipe
src/differ.js        LCS diff engine, ΔH / ΔQ heuristics
src/fv.js            f_v scoring (experimental)
src/anchor.js        Merkle root + transparency anchoring
popup.html/js        per-site state, diff viewer link, forget, wipe
options.html/js      retention, thresholds, anchoring, export, wipe
diffview.html/js     side-by-side change view
```

## License

MIT.
