// Lokaler Speicher. Jede Änderung bekommt einen Zeitstempel, damit die
// Synchronisierung zwischen Geräten pro Eintrag den neueren Stand wählen kann.
const KEY = 'formkurve_v1';
export const SECTIONS = ['profile', 'program', 'nutrition', 'settings', 'custom'];

export function fresh() {
  return {
    v: 1, profile: null, program: null, logs: {}, body: [], checkins: [], nutrition: null, changes: [], settings: { unit: 'rir' }, custom: [],
    stamps: {}, deleted: { logs: {}, body: {} },
  };
}

function normalize(s) {
  const out = { ...fresh(), ...(s || {}) };
  out.stamps ||= {};
  out.deleted = { logs: {}, body: {}, ...(out.deleted || {}) };
  return out;
}

function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch { return fresh(); }
}

export let state = load();

// ---------- Zeitstempel ----------
const strip = o => { if (!o) return 'null'; const { u, ...rest } = o; return JSON.stringify(rest); };
let snap;

function snapshot() {
  snap = { sec: {}, logs: {}, body: {} };
  for (const k of SECTIONS) snap.sec[k] = JSON.stringify(state[k]);
  for (const [k, l] of Object.entries(state.logs)) snap.logs[k] = strip(l);
  for (const b of state.body) snap.body[b.date] = strip(b);
}

function stamp() {
  const now = Date.now();
  for (const k of SECTIONS) {
    const j = JSON.stringify(state[k]);
    if (j !== snap.sec[k]) state.stamps[k] = now;
  }
  for (const [k, l] of Object.entries(state.logs)) if (strip(l) !== snap.logs[k]) { l.u = now; delete state.deleted.logs[k]; }
  for (const k of Object.keys(snap.logs)) if (!state.logs[k]) state.deleted.logs[k] = now;
  const dates = new Set();
  for (const b of state.body) { dates.add(b.date); if (strip(b) !== snap.body[b.date]) { b.u = now; delete state.deleted.body[b.date]; } }
  for (const d of Object.keys(snap.body)) if (!dates.has(d)) state.deleted.body[d] = now;
  snapshot();
}

// Alles als „gerade geändert“ markieren, z. B. nach einem Backup-Import.
export function touchAll() {
  const now = Date.now();
  for (const k of SECTIONS) state.stamps[k] = now;
  for (const l of Object.values(state.logs)) l.u = now;
  for (const b of state.body) b.u = now;
  snapshot();
  write();
}

snapshot();

// ---------- Schreiben ----------
const listeners = new Set();
export const onSave = fn => listeners.add(fn);

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Speicher nicht verfügbar */ }
  listeners.forEach(fn => fn());
}

let timer = null;
export function save(now = true) {
  clearTimeout(timer);
  const run = () => { timer = null; stamp(); write(); };
  if (now) run(); else timer = setTimeout(run, 300);
}

// Noch ausstehendes verzögertes Speichern sofort ausführen.
export function flush() {
  if (timer) { clearTimeout(timer); timer = null; stamp(); write(); }
}

// Ersetzt den Stand ohne neue Zeitstempel (z. B. mit zusammengeführten Sync-Daten).
export function replace(next, { silent = false } = {}) {
  clearTimeout(timer);
  state = normalize(next);
  snapshot();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Speicher nicht verfügbar */ }
  if (!silent) listeners.forEach(fn => fn());
}
