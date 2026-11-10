const KEY = 'formkurve_v1';

export function fresh() {
  return { v: 1, profile: null, program: null, logs: {}, body: [], checkins: [], nutrition: null, changes: [], settings: { unit: 'rir' } };
}

function load() {
  try {
    return { ...fresh(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
  } catch {
    return fresh();
  }
}

export let state = load();

let timer;
export function save(now = true) {
  clearTimeout(timer);
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Speicher nicht verfügbar */ } };
  if (now) write(); else timer = setTimeout(write, 300);
}

export function replace(next) {
  state = { ...fresh(), ...next };
  save();
}
