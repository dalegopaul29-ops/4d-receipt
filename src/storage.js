// 4D Receipt — local-first storage layer (IndexedDB) + AES-GCM encryption helpers.
// Everything lives on the user's machine. chrome.storage.local holds only the
// AES key and settings. Deletion is true deletion: see wipeLocal().

const DB_NAME = "fourd-receipt";
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("pages")) db.createObjectStore("pages", { keyPath: "url" });
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "id" });
      if (!db.objectStoreNames.contains("diffs")) db.createObjectStore("diffs", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function req(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

// ---- meta (settings, anchors) ----
export async function kvGet(k) { const db = await openDB(); return req(db.transaction("meta", "readonly").objectStore("meta").get(k)); }
export async function kvSet(k, v) { const db = await openDB(); return req(db.transaction("meta", "readwrite").objectStore("meta").put(v, k)); }

// ---- pages ----
export async function pageGet(url) { const db = await openDB(); return req(db.transaction("pages", "readonly").objectStore("pages").get(url)); }
export async function pagePut(page) { const db = await openDB(); return req(db.transaction("pages", "readwrite").objectStore("pages").put(page)); }
export async function pageDel(url) { const db = await openDB(); return req(db.transaction("pages", "readwrite").objectStore("pages").delete(url)); }
export async function pageAll() { const db = await openDB(); return req(db.transaction("pages", "readonly").objectStore("pages").getAll()); }

// ---- snapshots (encrypted text blobs, content-addressed by hash) ----
export async function snapPut(snap) { const db = await openDB(); return req(db.transaction("snapshots", "readwrite").objectStore("snapshots").put(snap)); }
export async function snapsFor(url, limit = 5) {
  const db = await openDB();
  const all = await req(db.transaction("snapshots", "readonly").objectStore("snapshots").index ? null : db.transaction("snapshots", "readonly").objectStore("snapshots").getAll());
  return all.filter(s => s.url === url).sort((a, b) => b.ts - a.ts).slice(0, limit);
}
export async function allSnapshots() { const db = await openDB(); return req(db.transaction("snapshots", "readonly").objectStore("snapshots").getAll()); }
async function deleteByUrl(store, url) {
  const db = await openDB();
  const all = await req(db.transaction(store, "readonly").objectStore(store).getAll());
  const t = db.transaction(store, "readwrite");
  const s = t.objectStore(store);
  for (const item of all) if (item.url === url) s.delete(item.id);
  return new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
}
export async function snapDelByUrl(url) { return deleteByUrl("snapshots", url); }
export async function diffDelByUrl(url) { return deleteByUrl("diffs", url); }

// ---- diffs (payload encrypted; metrics plain so they can be listed/scored) ----
export async function diffPut(diff) { const db = await openDB(); return req(db.transaction("diffs", "readwrite").objectStore("diffs").put(diff)); }
export async function diffLatest(url) {
  const db = await openDB();
  const all = await req(db.transaction("diffs", "readonly").objectStore("diffs").getAll());
  const mine = all.filter(d => d.url === url).sort((a, b) => b.ts - a.ts);
  return mine[0] || null;
}
export async function allDiffs() { const db = await openDB(); return req(db.transaction("diffs", "readonly").objectStore("diffs").getAll()); }


// ---- targeted deletes (retention pruning) ----
async function deleteById(store, id) {
  const db = await openDB();
  return req(db.transaction(store, "readwrite").objectStore(store).delete(id));
}
export async function snapDelete(id) { return deleteById("snapshots", id); }
export async function diffDelete(id) { return deleteById("diffs", id); }

// ---- encryption (AES-GCM 256) ----
// Honest limitation: the key lives in extension storage, so at-rest protection
// ultimately relies on OS disk encryption. Passphrase-locked keys = roadmap.
export async function getKey() {
  const { encKey } = await chrome.storage.local.get("encKey");
  if (encKey) {
    const raw = unb64(encKey);
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  await chrome.storage.local.set({ encKey: b64(raw) });
  return key;
}

export async function encText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

export async function decText(key, blob) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(blob.iv) }, key, unb64(blob.ct));
  return new TextDecoder().decode(pt);
}

function b64(bytes) {
  let s = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
function unb64(str) {
  const s = atob(str); const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

// ---- total wipe: user's right, spec'd as a first-class feature ----
export async function wipeLocal() {
  dbPromise = null;
  await new Promise((res) => { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  await chrome.storage.local.remove(["encKey", "settings"]);
}
