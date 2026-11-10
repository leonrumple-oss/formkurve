// Regelbasierte Planlogik: Periodisierung, Lastvorgaben, Ernährung, Plateau-Erkennung.
import { EX, BY_PAT, PATTERN_MUSCLE, TEMPLATES, SPLITS, PHASES, EST } from './data.js';

export const MESOS = 3;
export const round = (x, step) => Math.round(x / step) * step;
export const e1rm = (w, r, rir = 0) => w * (1 + (r + Math.min(rir, 5)) / 30);
export const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const days = (a, b) => (new Date(b) - new Date(a)) / 864e5;

export const bodyweight = st => st.body.length ? st.body[st.body.length - 1].weight : st.profile.weight;
export const lowRecovery = p => p.sleep === 'low' || p.stress === 'high';

export function newProgram() {
  return { macro: 0, meso: 0, week: 0, started: today(), mods: { volume: 0 }, swaps: {}, forced: {}, handled: [] };
}

// ---------- Kraftwerte ----------
export function refs(p) {
  const out = {}, f = p.sex === 'w' ? 0.65 : 1;
  for (const k of Object.keys(EST.mid)) {
    const l = p.lifts?.[k];
    out[k] = l && l.w > 0 && l.r > 0 ? e1rm(l.w, l.r) : p.weight * EST[p.level][k] * f;
  }
  return out;
}

// Verlauf einer Übung: bester Satz (geschätztes 1RM) je Einheit, chronologisch.
export function history(st, exId) {
  const ex = EX[exId], bw = ex.bw ? bodyweight(st) : 0, out = [];
  for (const [key, l] of Object.entries(st.logs)) {
    const sets = (l.ex?.[exId] || []).filter(s => s && s.r > 0 && (ex.noload || ex.bw || s.w > 0));
    if (!sets.length) continue;
    let best = null;
    for (const s of sets) {
      const v = ex.noload ? s.r : e1rm((s.w || 0) + bw, s.r, s.rir ?? s.p ?? 0);
      if (!best || v > best.v) best = { v, s };
    }
    out.push({ key, date: l.date, deload: !!l.deload, e1rm: best.v, top: best.s, sets });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : 1));
}

function targetLoad(st, ex, reps, rir, R) {
  if (ex.noload) return null;
  const h = history(st, ex.id).filter(x => !x.deload).slice(-2);
  const mid = Math.round((reps[0] + reps[1]) / 2), div = 1 + (mid + rir) / 30;
  const known = h.length ? Math.max(...h.map(x => x.e1rm)) : null;
  if (ex.bw) return known ? Math.max(0, round(known / div - bodyweight(st), 2.5)) : 0;
  const orm = known ?? R[ex.ref] * ex.ratio * 0.95;
  return Math.max(ex.step, round(orm / div, ex.step));
}

// ---------- Periodisierung ----------
const BASE_LEN = { beg: 6, mid: 5, adv: 5 };
const BASE_SETS = { beg: { main: 3, acc: 2, iso: 2 }, mid: { main: 3, acc: 3, iso: 2 }, adv: { main: 4, acc: 3, iso: 3 } };
const MAX_EX = { 45: 4, 60: 5, 75: 6, 90: 7 };

export function mesoWeeks(st, meso) {
  const len = BASE_LEN[st.profile.level];
  for (let w = 0; w < len - 1; w++) if (st.program.forced[`${st.program.macro}-${meso}-${w}`]) return w + 1;
  return len;
}

export function weekMeta(st, meso, week) {
  const len = mesoWeeks(st, meso), base = BASE_LEN[st.profile.level];
  return { len, base, nBuild: base - 1, deload: week >= len - 1, forced: len < base && week === len - 1 };
}

function candidates(p, pat) {
  const all = BY_PAT[pat];
  let c = all.filter(x => x.eq.includes(p.equip));
  const safe = c.filter(x => !(x.avoid || []).some(a => (p.injuries || []).includes(a)));
  if (safe.length) c = safe;
  return c.length ? c : all;
}

// Tausch-Alternativen: gleiches oder eng verwandtes Bewegungsmuster, passend zur Ausstattung.
const RELATED = { hpush: ['ipush'], ipush: ['hpush'], squat: ['quad'], quad: ['squat'], hinge: ['ham'], ham: ['hinge'] };
export function alternatives(st, slot) {
  const [tid, i] = slot.split(':'), pat = TEMPLATES[tid][1][i][0];
  const pats = [pat, ...(RELATED[pat] || [])];
  const c = pats.flatMap(q => BY_PAT[q]).filter(x => x.eq.includes(st.profile.equip));
  return { pat, list: c.length ? c : BY_PAT[pat] };
}

function resolve(p, pr, pat, v, role, slot, used) {
  const c = candidates(p, pat), sw = pr.swaps[slot];
  if (typeof sw === 'string' && EX[sw] && !used.has(sw)) return EX[sw];
  const i = v + (role === 'main' ? 0 : pr.macro) + (typeof sw === 'number' ? sw : 0);
  for (let n = 0; n < c.length; n++) {
    const x = c[(i + n) % c.length];
    if (!used.has(x.id)) return x;
  }
  return c[i % c.length];
}

function setsFor(p, pr, role, week, deload, muscle) {
  const base = BASE_SETS[p.level][role];
  if (deload) return Math.max(1, Math.ceil(base / 2));
  let s = base;
  if (role !== 'iso' && p.goal !== 'abbau' && !lowRecovery(p)) s += Math.min(p.level === 'beg' ? 1 : 2, Math.floor(week / 2));
  if ((p.focus || []).includes(muscle)) s += 1;
  if (role !== 'iso') s += pr.mods.volume || 0;
  return Math.min(6, Math.max(1, s));
}

export function weekPlan(st, meso, week) {
  const p = st.profile, pr = st.program, m = weekMeta(st, meso, week), phase = PHASES[p.goal][meso], R = refs(p);
  const endRir = p.level === 'beg' ? 2 : 1;
  const baseRir = Math.round(3 - (3 - endRir) * Math.min(week, m.nBuild - 1) / (m.nBuild - 1));
  const daysOut = SPLITS[p.days].map((tid, d) => {
    const [name, slots] = TEMPLATES[tid], used = new Set();
    const exercises = slots.slice(0, MAX_EX[p.minutes]).map(([pat, v, role], i) => {
      const slot = `${tid}:${i}`, ex = resolve(p, pr, pat, v, role, slot, used);
      used.add(ex.id);
      const reps = phase[role];
      const rir = m.deload ? 4 : role === 'iso' && p.level !== 'beg' ? Math.max(0, baseRir - 1) : baseRir;
      return {
        slot, ex, role, reps, rir,
        sets: setsFor(p, pr, role, week, m.deload, PATTERN_MUSCLE[pat]),
        target: targetLoad(st, ex, reps, rir, R),
        swappable: BY_PAT[pat].filter(c => c.eq.includes(p.equip)).length > 1,
      };
    });
    return { name, key: `${pr.macro}-${meso}-${week}-${d}`, exercises };
  });
  return { meta: m, phase, days: daysOut };
}

// Woche abschließen: Zeiger weiterschieben (Woche → Mesozyklus → Makrozyklus).
export function closeWeek(st) {
  const pr = st.program, m = weekMeta(st, pr.meso, pr.week);
  if (!m.deload) { pr.week++; return 'week'; }
  if (pr.meso < MESOS - 1) { pr.meso++; pr.week = 0; return 'meso'; }
  pr.macro++; pr.meso = 0; pr.week = 0; pr.mods.volume = 0;
  return 'macro';
}

// ---------- Ernährung ----------
export function bmr(p, w = p.weight) { return 10 * w + 6.25 * p.height - 5 * p.age + (p.sex === 'w' ? -161 : 5); }

export function baseKcal(p) {
  const act = { low: 1.35, mid: 1.5, high: 1.7 }[p.activity] + (p.days >= 5 ? 0.1 : p.days >= 3 ? 0.05 : 0);
  const adj = { aufbau: 1.1, kraft: 1.05, abbau: 0.8, fit: 1 }[p.goal];
  return round(bmr(p) * act * adj, 50);
}

export function macros(st) {
  const p = st.profile, w = bodyweight(st), kcal = st.nutrition.kcal;
  const perKg = { aufbau: 2.0, kraft: 1.8, abbau: 2.3, fit: 1.8 }[p.goal] * (p.diet === 'vegan' ? 1.1 : 1);
  const protein = Math.round(w * perKg / 5) * 5;
  const fat = Math.round(w * 0.9 / 5) * 5;
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4 / 5) * 5);
  return { kcal, protein, fat, carbs };
}

// Ziel-Gewichtsveränderung in % Körpergewicht pro Woche.
export const RATE = { aufbau: [0.1, 0.6], kraft: [-0.1, 0.5], abbau: [-1.0, -0.3], fit: [-0.35, 0.35] };

export function weightTrend(st) {
  const b = st.body;
  if (b.length < 3) return null;
  const last = b[b.length - 1].date, win = b.filter(x => days(x.date, last) <= 21);
  const span = days(win[0].date, last);
  if (win.length < 3 || span < 10) return null;
  const xs = win.map(x => days(win[0].date, x.date)), ys = win.map(x => x.weight);
  const mx = xs.reduce((a, c) => a + c, 0) / xs.length, my = ys.reduce((a, c) => a + c, 0) / ys.length;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return { kgWeek: slope * 7, pct: slope * 7 / my * 100, n: win.length, span };
}

// ---------- Plateau-Erkennung ----------
export function stagnation(st) {
  const pr = st.program, plan = weekPlan(st, pr.meso, pr.week), seen = new Set();
  const res = { evaluable: 0, stuck: [], dropping: [] };
  for (const d of plan.days) for (const x of d.exercises) {
    if (x.role === 'iso' || x.ex.noload || seen.has(x.ex.id)) continue;
    seen.add(x.ex.id);
    const h = history(st, x.ex.id).filter(e => !e.deload);
    if (h.length < 3) continue;
    const prev = h[h.length - 3], recent = Math.max(h[h.length - 1].e1rm, h[h.length - 2].e1rm);
    if (days(prev.date, h[h.length - 1].date) < 10) continue;
    res.evaluable++;
    if (recent <= prev.e1rm * 1.005) res.stuck.push(x);
    if (recent < prev.e1rm * 0.97) res.dropping.push(x);
  }
  return res;
}

export function suggestions(st) {
  const p = st.profile, pr = st.program, out = [];
  const tag = `${pr.macro}-${pr.meso}-${pr.week}`, meta = weekMeta(st, pr.meso, pr.week);
  const tr = weightTrend(st), [lo, hi] = RATE[p.goal];
  const lastKcal = st.nutrition.adjustments[st.nutrition.adjustments.length - 1];
  const kcalReady = !lastKcal || days(lastKcal.date, today()) >= 14;
  const pctTxt = tr ? `${tr.pct >= 0 ? '+' : ''}${tr.pct.toFixed(2).replace('.', ',')} % pro Woche` : '';

  if (tr && kcalReady) {
    if (tr.pct < lo) {
      out.push({
        id: `kcal-${tag}`, kind: 'Ernährung', title: p.goal === 'abbau' ? 'Du nimmst zu schnell ab' : 'Dein Gewicht steigt nicht wie geplant',
        text: `Trend der letzten ${Math.round(tr.span)} Tage: ${pctTxt}. ${p.goal === 'abbau' ? 'Ein kleineres Defizit schützt Kraft und Muskulatur.' : 'Für dein Ziel fehlt Energie.'} Vorschlag: +150 kcal pro Tag, vor allem über Kohlenhydrate.`,
        action: { type: 'kcal', delta: 150 }, label: '+150 kcal übernehmen',
      });
    } else if (tr.pct > hi) {
      const delta = p.goal === 'abbau' ? -150 : -100, floor = bmr(p, bodyweight(st)) * 1.1;
      if (st.nutrition.kcal + delta < floor) {
        out.push({
          id: `steps-${tag}`, kind: 'Ernährung', title: 'Gewicht stagniert – Kalorien sind schon niedrig',
          text: `Trend: ${pctTxt}. Statt weiter zu kürzen: täglich rund 2.000 Schritte mehr und Portionen eine Woche lang genau abwiegen.`,
        });
      } else {
        out.push({
          id: `kcal-${tag}`, kind: 'Ernährung', title: p.goal === 'abbau' ? 'Seit zwei Wochen kaum Gewichtsverlust' : 'Du nimmst schneller zu als nötig',
          text: `Trend der letzten ${Math.round(tr.span)} Tage: ${pctTxt}. Vorschlag: ${delta} kcal pro Tag.`,
          action: { type: 'kcal', delta }, label: `${delta} kcal übernehmen`,
        });
      }
    }
  }

  const sg = stagnation(st), names = l => l.map(x => x.ex.name).join(', ');
  const systemic = sg.stuck.length >= 2 && sg.stuck.length >= sg.evaluable / 3;
  const rc = st.checkins.slice(-2), recovery = rc.length ? rc.reduce((a, c) => a + c.recovery, 0) / rc.length : null;

  if (systemic && !meta.deload) {
    if (p.goal === 'abbau') {
      if (sg.dropping.length >= 2 && kcalReady) out.push({
        id: `drop-${tag}`, kind: 'Training', title: 'Kraft fällt im Defizit',
        text: `Rückgang bei: ${names(sg.dropping)}. Kraft halten ist in der Diät das Ziel – das Defizit ist gerade zu groß. Vorschlag: +100 kcal pro Tag.`,
        action: { type: 'kcal', delta: 100 }, label: '+100 kcal übernehmen',
      });
    } else if (recovery !== null && recovery <= 2.5) {
      out.push({
        id: `deload-${tag}`, kind: 'Training', title: 'Plateau bei schlechter Erholung',
        text: `Seit zwei Wochen kein Fortschritt bei: ${names(sg.stuck)}. Deine Erholungswerte sind niedrig – das spricht für Ermüdung, nicht für zu wenig Reiz. Vorschlag: Deload auf diese Woche vorziehen.`,
        action: { type: 'deload' }, label: 'Deload jetzt einplanen',
      });
    } else if (tr && tr.pct < lo) {
      out.push({
        id: `fuel-${tag}`, kind: 'Training', title: 'Plateau – zuerst die Ernährung anpassen',
        text: `Kein Fortschritt bei: ${names(sg.stuck)}. Dein Gewicht steigt nicht, deshalb bleibt das Trainingsvolumen vorerst gleich. Erst die Kalorien erhöhen, dann neu bewerten.`,
      });
    } else if ((pr.mods.volume || 0) < 2) {
      out.push({
        id: `vol-${tag}`, kind: 'Training', title: 'Plateau seit zwei Wochen',
        text: `Kein Fortschritt bei: ${names(sg.stuck)}. Erholung und Ernährung passen – der Reiz reicht nicht mehr. Vorschlag: +1 Satz bei Grund- und Assistenzübungen.`,
        action: { type: 'volume', delta: 1 }, label: '+1 Satz übernehmen',
      });
    } else {
      out.push({
        id: `var-${tag}`, kind: 'Training', title: 'Plateau trotz hohem Volumen',
        text: `Kein Fortschritt bei: ${names(sg.stuck)}. Mehr Volumen ist nicht sinnvoll. Tausche die stagnierenden Übungen im Plan gegen eine Variante und prüfe Schlaf und Stress.`,
      });
    }
  } else if (!meta.deload) {
    for (const x of sg.stuck.slice(0, 2)) {
      const alt = alternatives(st, x.slot).list.find(a => a.id !== x.ex.id && !(a.avoid || []).some(v => (p.injuries || []).includes(v)));
      if (alt) out.push({
        id: `swap-${x.ex.id}-${tag}`, kind: 'Training', title: `${x.ex.name} stagniert`,
        text: `Seit zwei Wochen keine Steigerung, während der Rest läuft. Ein Variantenwechsel im selben Bewegungsmuster setzt oft einen neuen Reiz – Vorschlag: ${alt.name}.`,
        action: { type: 'swap', slot: x.slot, to: alt.id }, label: `Gegen ${alt.name} tauschen`,
      });
    }
  }
  return out.filter(s => !pr.handled.includes(s.id));
}

export function applySuggestion(st, s) {
  const pr = st.program, a = s.action;
  if (a?.type === 'kcal') {
    st.nutrition.kcal += a.delta;
    st.nutrition.adjustments.push({ date: today(), delta: a.delta, kcal: st.nutrition.kcal });
  } else if (a?.type === 'volume') pr.mods.volume = (pr.mods.volume || 0) + a.delta;
  else if (a?.type === 'deload') pr.forced[`${pr.macro}-${pr.meso}-${pr.week}`] = true;
  else if (a?.type === 'swap') pr.swaps[a.slot] = a.to;
  if (a) st.changes.push({ date: today(), title: s.title, label: s.label });
  pr.handled.push(s.id);
}

// Absolvierte Sätze je Trainingswoche.
export function weeklySets(st) {
  const m = new Map();
  for (const [key, l] of Object.entries(st.logs)) {
    const [ma, me, w] = key.split('-').map(Number), k = `${ma}-${me}-${w}`;
    const n = Object.values(l.ex || {}).reduce((a, sets) => a + sets.filter(s => s && s.r > 0).length, 0);
    if (!n) continue;
    const cur = m.get(k) || { ma, me, w, n: 0, deload: !!l.deload };
    cur.n += n;
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => a.ma - b.ma || a.me - b.me || a.w - b.w);
}
