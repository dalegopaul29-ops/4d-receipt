// 4D Receipt — MV3 service worker: visit tracking, snapshotting, diffing, scoring.
import {
  getKey, encText, decText, kvGet, kvSet,
  pageGet, pagePut, pageDel, pageAll,
  snapPut, snapsFor, allSnapshots, snapDelByUrl, snapDelete,
  diffPut, diffLatest, allDiffs, diffDelByUrl, diffDelete, wipeLocal
} from "./storage.js";
import { sha256Hex, computeDiff } from "./differ.js";
import { computeFV, alertLevel } from "./fv.js";
import { anchorNow } from "./anchor.js";

const DEFAULT_SETTINGS = {
  retentionDays: 90,
  alertThreshold: 5,
  anchorEnabled: false,
  anchorEndpoint: ""
};

async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await kvGet("settings")) || {}) };
}

// ---------- lifecycle ----------
chrome.runtime.onInstalled.addListener(async () => {
  if (!(await kvGet("settings"))) await kvSet("settings", DEFAULT_SETTINGS);
  await getKey(); // generate the AES key on first install
  chrome.alarms.create("retention", { periodInMinutes: 24 * 60 });
  chrome.alarms.create("anchor", { periodInMinutes: 24 * 60 });
  console.log("[4D Receipt] installed — local-first, data stays on your machine.");
});

// ---------- visit tracking ----------
const tabLastUrl = new Map();

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab.url && /^https?:/.test(tab.url) && tab.url !== tabLastUrl.get(tabId)) {
    tabLastUrl.set(tabId, tab.url);
    handleVisit(tabId, tab.url).catch(e => console.error("[4D Receipt]", e));
  }
});
chrome.tabs.onRemoved.addListener((tabId) => tabLastUrl.delete(tabId));

async function setBadge(tabId, text) {
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#b3261e" });
    await chrome.action.setBadgeText({ tabId, text });
  } catch (e) { /* tab may be gone */ }
}

async function handleVisit(tabId, url) {
  const resp = await chrome.tabs.sendMessage(tabId, { type: "EXTRACT" }).catch(() => null);
  if (!resp || !resp.paras || !resp.paras.length) return { state: "unsupported" };

  const text = resp.paras.join("\n");
  const hash = await sha256Hex(text);
  const key = await getKey();
  const now = Date.now();
  let page = await pageGet(url);

  if (!page) {
    page = { url, visits: 0, dwellMs: 0, watch: false, lastHash: hash, lastVisit: now, firstSeen: now, changeCount: 0 };
  }
  page.visits += 1;
  page.lastVisit = now;

  if (page.lastHash === hash) {
    await pagePut(page);
    await setBadge(tabId, page.changeCount ? String(page.changeCount) : "");
    return { state: "unchanged", page };
  }

  // page changed since last visit — snapshot, diff, score
  const prior = await snapsFor(url, 1);
  const oldParas = prior.length ? (await decText(key, prior[0].text)).split("\n") : [];
  const diff = computeDiff(oldParas, resp.paras);
  const fv = computeFV(page, diff.deltaH, diff.deltaQ);
  const settings = await getSettings();
  const level = alertLevel(fv, settings.alertThreshold);

  await snapPut({ id: `${url}|${now}`, url, ts: now, hash, text: await encText(key, text) });
  await diffPutEnc(key, { id: `${url}|${now}`, url, ts: now, ...diff, fv, level });
  page.lastHash = hash;
  page.changeCount = (page.changeCount || 0) + 1;
  page.lastChangeTs = now;
  await pagePut(page);
  await setBadge(tabId, String(page.changeCount));
  try { await chrome.tabs.sendMessage(tabId, { type: "BADGE", text: String(page.changeCount) }); } catch (e) {}

  console.log(`[4D Receipt] change on ${url} — ΔH ${fv.deltaH}, ΔQ ${fv.deltaQ}, Ō ${fv.effort}, f_v ${fv.fv} (${level})`);
  return { state: "changed", page, diff, fv, level };
}

async function diffPutEnc(key, d) {
  const enc = await encText(key, JSON.stringify({ removed: d.removed, added: d.added, changed: d.changed }));
  await diffPut({ id: d.id, url: d.url, ts: d.ts, deltaH: d.deltaH, deltaQ: d.deltaQ, fv: d.fv, level: d.level, enc });
}
async function diffLatestDec(key, url) {
  const d = await diffLatest(url);
  if (!d) return null;
  const payload = JSON.parse(await decText(key, d.enc));
  return { ...d, ...payload };
}

// ---------- retention / anchoring alarms ----------
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "retention") await pruneRetention();
  if (alarm.name === "anchor") {
    const snaps = await allSnapshots();
    await anchorNow(await getSettings(), snaps.map(s => s.hash));
  }
});

async function pruneRetention() {
  const { retentionDays } = await getSettings();
  const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
  let pruned = 0;
  for (const s of await allSnapshots()) if (s.ts < cutoff) { await snapDelete(s.id); pruned++; }
  for (const d of await allDiffs()) if (d.ts < cutoff) { await diffDelete(d.id); pruned++; }
  console.log(`[4D Receipt] retention prune: ${pruned} old record(s) deleted`);
}

// ---------- messages ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const key = await getKey();
    switch (msg.type) {
      case "OPEN_DIFFVIEW": {
        const u = String(msg.url || "");
        await chrome.tabs.create({ url: chrome.runtime.getURL("diffview.html") + "?url=" + encodeURIComponent(u) });
        return { ok: true };
      }
      case "GET_TAB_STATE": {
        const tab = await chrome.tabs.get(msg.tabId);
        const page = await pageGet(tab.url);
        const diff = await diffLatestDec(key, tab.url);
        const settings = await getSettings();
        return { url: tab.url, page, diff, alertThreshold: settings.alertThreshold };
      }
      case "GET_LATEST_DIFF":
        return await diffLatestDec(key, msg.url);
      case "GET_HISTORY": {
        const snaps = await snapsFor(msg.url, 20);
        return snaps.map(s => ({ ts: s.ts, hash: s.hash }));
      }
      case "DWELL": {
        const page = await pageGet(msg.url);
        if (page) { page.dwellMs = (page.dwellMs || 0) + msg.ms; await pagePut(page); }
        return { ok: true };
      }
      case "FORGET_SITE": {
        await snapDelByUrl(msg.url); await diffDelByUrl(msg.url); await pageDel(msg.url);
        return { ok: true };
      }
      case "WIPE_ALL": {
        await wipeLocal();
        await kvSet("settings", DEFAULT_SETTINGS);
        await getKey();
        return { ok: true };
      }
      case "GET_SETTINGS": return await getSettings();
      case "SET_SETTINGS":
        await kvSet("settings", { ...(await getSettings()), ...msg.patch });
        return await getSettings();
      case "ANCHOR_NOW": {
        const snaps = await allSnapshots();
        return await anchorNow(await getSettings(), snaps.map(s => s.hash));
      }
      case "EXPORT_HASHES": {
        const snaps = await allSnapshots();
        return snaps.map(s => ({ url: s.url, ts: s.ts, hash: s.hash }));
      }
      default:
        return { error: "unknown message" };
    }
  })().then(sendResponse).catch(e => { console.error(e); sendResponse({ error: String(e) }); });
  return true; // async response
});
