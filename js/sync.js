// Synchronisierung über ein geheimes GitHub-Gist im Konto des Nutzers.
// Der Zugangsschlüssel liegt nur auf dem jeweiligen Gerät und ist nicht Teil des Backups.
import { state, replace, onSave, flush, fresh, SECTIONS } from './store.js';

const CFG_KEY = 'formkurve_sync';
const FILE = 'formkurve.json';
const API = 'https://api.github.com';
export const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Formkurve%20Sync';

export const status = { busy: false, error: '', offline: false };
let cfg = loadCfg();
let pending = false, timer = null;
let remoteCb = () => {}, statusCb = () => {};
export const onRemoteChange = fn => { remoteCb = fn; };
export const onStatus = fn => { statusCb = fn; };

function loadCfg() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY)) || null; } catch { return null; }
}
function saveCfg() {
  try { cfg ? localStorage.setItem(CFG_KEY, JSON.stringify(cfg)) : localStorage.removeItem(CFG_KEY); } catch { /* ignorieren */ }
}
export const info = () => (cfg ? { login: cfg.login, last: cfg.last, gistId: cfg.gistId } : null);

class SyncError extends Error {
  constructor(kind, msg) { super(msg); this.kind = kind; }
}

async function gh(path, opts = {}, token = cfg?.token) {
  let res;
  try {
    res = await fetch(API + path, {
      ...opts,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new SyncError('offline', 'Keine Verbindung – der Abgleich wird nachgeholt.');
  }
  if (res.status === 401) throw new SyncError('auth', 'Der GitHub-Schlüssel ist ungültig oder abgelaufen.');
  if (res.status === 404) throw new SyncError('missing', 'Nicht gefunden.');
  if (res.status === 403 || res.status === 422) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    throw new SyncError('perm', remaining === '0' ? 'GitHub-Limit erreicht – später erneut versuchen.' : 'Der Schlüssel darf keine Gists anlegen. Beim Erstellen das Häkchen „gist“ setzen.');
  }
  if (!res.ok) throw new SyncError('http', `GitHub antwortet mit Fehler ${res.status}.`);
  return res.status === 204 ? null : res.json();
}

async function readGist(id, token) {
  const g = await gh(`/gists/${id}`, {}, token);
  const f = g.files?.[FILE];
  if (!f) return null;
  const text = f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content;
  return JSON.parse(text);
}

// ---------- Zusammenführen ----------
const ts = x => x?.u || 0;

export function merge(a, b) {
  const out = fresh();
  for (const k of SECTIONS) {
    const ta = a.stamps?.[k] || 0, tb = b.stamps?.[k] || 0;
    out[k] = ta > tb ? a[k] : tb > ta ? b[k] : a[k] ?? b[k];
    out.stamps[k] = Math.max(ta, tb);
  }
  for (const kind of ['logs', 'body']) {
    const da = a.deleted?.[kind] || {}, db = b.deleted?.[kind] || {};
    for (const k of new Set([...Object.keys(da), ...Object.keys(db)])) out.deleted[kind][k] = Math.max(da[k] || 0, db[k] || 0);
  }
  for (const k of new Set([...Object.keys(a.logs || {}), ...Object.keys(b.logs || {})])) {
    const la = a.logs?.[k], lb = b.logs?.[k], pick = !la ? lb : !lb ? la : ts(lb) > ts(la) ? lb : la;
    if (!(out.deleted.logs[k] > ts(pick))) { out.logs[k] = pick; delete out.deleted.logs[k]; }
  }
  const body = new Map();
  for (const e of [...(a.body || []), ...(b.body || [])]) {
    const cur = body.get(e.date);
    if (!cur || ts(e) > ts(cur)) body.set(e.date, e);
  }
  out.body = [...body.values()].filter(e => {
    if (out.deleted.body[e.date] > ts(e)) return false;
    delete out.deleted.body[e.date];
    return true;
  }).sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  const uniq = (list, key) => { const m = new Map(); for (const x of list) m.set(key(x), x); return [...m.values()]; };
  const byDate = (x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
  out.checkins = uniq([...(a.checkins || []), ...(b.checkins || [])], c => `${c.key}|${c.date}`).sort(byDate);
  out.changes = uniq([...(a.changes || []), ...(b.changes || [])], c => JSON.stringify(c)).sort(byDate);
  return structuredClone(out);
}

// Schlüsselreihenfolge-unabhängiger Vergleich.
function canon(x) {
  if (Array.isArray(x)) return `[${x.map(canon).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canon(x[k])}`).join(',')}}`;
  return JSON.stringify(x ?? null);
}

// ---------- Verbinden ----------
export async function connect(token) {
  token = token.trim();
  if (!token) throw new SyncError('auth', 'Bitte den Schlüssel einfügen.');
  const user = await gh('/user', {}, token);
  const gists = await gh('/gists?per_page=100', {}, token);
  const g = gists.find(x => x.files?.[FILE]);
  const remote = g ? await readGist(g.id, token) : null;
  return { token, login: user.login, gistId: g?.id || null, remote };
}

// mode: 'remote' = Online-Stand übernehmen, 'merge' = zusammenführen, 'local' = nur hochladen
export async function activate(conn, mode) {
  cfg = { token: conn.token, login: conn.login, gistId: conn.gistId, last: null };
  saveCfg();
  if (conn.remote && mode === 'remote') replace(conn.remote, { silent: true });
  else if (conn.remote && mode === 'merge') replace(merge(state, conn.remote), { silent: true });
  status.error = '';
  await syncNow();
}

export function disconnect() {
  cfg = null;
  saveCfg();
  status.error = '';
  statusCb();
}

// ---------- Abgleich ----------
async function push(data) {
  const body = { description: 'Formkurve – Trainingsdaten (automatisch synchronisiert)', files: { [FILE]: { content: JSON.stringify(data) } } };
  if (cfg.gistId) {
    try { await gh(`/gists/${cfg.gistId}`, { method: 'PATCH', body }); return; } catch (e) { if (e.kind !== 'missing') throw e; }
  }
  const g = await gh('/gists', { method: 'POST', body: { ...body, public: false } });
  cfg.gistId = g.id;
  saveCfg();
}

export async function syncNow() {
  if (!cfg?.token) return;
  if (status.busy) { pending = true; return; }
  clearTimeout(timer);
  status.busy = true;
  statusCb();
  try {
    flush();
    let remote = null;
    if (cfg.gistId) {
      try { remote = await readGist(cfg.gistId); } catch (e) { if (e.kind !== 'missing') throw e; cfg.gistId = null; }
    }
    flush(); // Eingaben während des Ladens nicht verlieren
    const local = state, merged = remote ? merge(local, remote) : local;
    if (remote && canon(merged) !== canon(local)) {
      replace(merged, { silent: true });
      remoteCb();
    }
    if (merged.profile && (!remote || canon(remote) !== canon(merged))) await push(merged);
    cfg.last = Date.now();
    saveCfg();
    status.error = '';
    status.offline = false;
  } catch (e) {
    status.offline = e.kind === 'offline';
    status.error = e.message;
  } finally {
    status.busy = false;
    statusCb();
    if (pending) { pending = false; schedule(500); }
  }
}

function schedule(ms = 4000) {
  if (!cfg?.token) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

export function start() {
  onSave(() => schedule());
  document.addEventListener('visibilitychange', () => { if (cfg?.token) syncNow(); });
  window.addEventListener('online', () => syncNow());
  syncNow();
}

export const connected = () => !!cfg?.token;
