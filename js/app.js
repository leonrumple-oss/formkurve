import { state, save, replace, fresh, touchAll } from './store.js';
import * as S from './sync.js';
import * as E from './engine.js';
import { EX, PHASES, GOALS, LEVELS, EQUIP, LIFTS, MUSCLES, SPLIT_NAME } from './data.js';

const app = document.getElementById('app');
let view = 'home';
const ui = { meso: null, week: null, logKey: null, chartEx: null, ob: null, obStep: 0, obErr: '', modal: null, rec: 3, toast: '', syncErr: '', syncBusy: false, conn: null };

// ---------- Helfer ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (x, d = 1) => (x == null || isNaN(x) ? '–' : (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('de-DE'));
const parse = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? undefined : n; };
const eff = rir => (state.settings.unit === 'rpe' ? `RPE ${10 - rir}` : `RIR ${rir}`);
const effVal = rir => (rir == null ? '' : state.settings.unit === 'rpe' ? 10 - rir : rir);
const dateDE = d => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const PATTERN = { squat: 'Kniebeuge-Muster · Beine', quad: 'Quadrizeps · Beine', hinge: 'Hüftstreckung · Gesäß & Beinrückseite', ham: 'Beinbeuger', hpush: 'Drücken horizontal · Brust', ipush: 'Drücken schräg · obere Brust', vpush: 'Drücken über Kopf · Schultern', fly: 'Brust-Isolation', delt: 'Seitliche Schulter', rear: 'Hintere Schulter', hpull: 'Rudern · Rücken', vpull: 'Ziehen vertikal · Lat', biceps: 'Bizeps', triceps: 'Trizeps', calves: 'Waden', core: 'Rumpf' };
const ROLE = { main: 'Grundübung', acc: 'Assistenz', iso: 'Isolation' };
const REST = { main: '2–3 min Pause', acc: '2 min Pause', iso: '60–90 s Pause' };
const loadTxt = x => (x.ex.noload ? 'ohne Zusatzlast' : x.ex.bw ? (x.target > 0 ? `Körpergewicht + ${num(x.target)} kg` : 'Körpergewicht') : `${num(x.target)} kg${x.ex.per ? ' ' + x.ex.per : ''}`);
const icon = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const NAV = [
  ['home', 'Heute', 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  ['plan', 'Plan', 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'],
  ['progress', 'Fortschritt', 'M4 20h16M5 15l4-5 4 3 6-8'],
  ['food', 'Ernährung', 'M12 7c-3-2-7 0-7 5 0 4 3 8 5 8 1 0 1-.5 2-.5s1 .5 2 .5c2 0 5-4 5-8 0-5-4-7-7-5zM12 7c0-2 1-3 3-4'],
  ['profile', 'Profil', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6'],
];

function toast(msg) {
  ui.toast = msg;
  render();
  setTimeout(() => { if (ui.toast === msg) { ui.toast = ''; document.querySelector('.toast')?.remove(); } }, 3200);
}

// ---------- Fragebogen ----------
const OB_DEFAULT = { name: '', sex: 'm', level: 'mid', goal: 'aufbau', focus: [], days: 4, minutes: 60, equip: 'g', activity: 'mid', sleep: 'mid', stress: 'mid', diet: 'omni', injuries: [], lifts: {} };
const opt = (t, s) => `<b>${t}</b>${s ? `<small>${s}</small>` : ''}`;

function chips(field, opts, multi) {
  const ob = ui.ob;
  return `<div class="chips">${Object.entries(opts).map(([v, l]) => {
    const on = multi ? (ob[field] || []).includes(v) : String(ob[field]) === v;
    return `<button type="button" class="chip ${on ? 'on' : ''}" aria-pressed="${on}" data-act="obSet" data-field="${field}" data-val="${v}" ${multi ? 'data-multi="1"' : ''}>${l}</button>`;
  }).join('')}</div>`;
}
const field = (label, path, unit, ph = '') => {
  const v = path.split('.').reduce((o, k) => o?.[k], ui.ob);
  return `<label class="field"><span>${label}</span><div class="inp"><input ${path === 'name' ? 'type="text" autocomplete="given-name"' : 'inputmode="decimal"'} data-ob="${path}" value="${esc(v ?? '')}" placeholder="${ph}">${unit ? `<i>${unit}</i>` : ''}</div></label>`;
};

const OB_STEPS = [
  ['Über dich', 'Die Basis für Kalorienbedarf und Startlasten.', () => `
    ${field('Vorname', 'name', '', 'optional')}
    <div class="q"><span>Geschlecht</span>${chips('sex', { m: 'Männlich', w: 'Weiblich' })}</div>
    <div class="row3">${field('Alter', 'age', 'Jahre')}${field('Größe', 'height', 'cm')}${field('Gewicht', 'weight', 'kg')}</div>`],
  ['Deine Erfahrung', 'Bestimmt Volumen, Zykluslänge und wie schnell gesteigert wird.', () => `
    ${chips('level', { beg: opt('Anfänger', 'unter 1 Jahr regelmäßiges Krafttraining'), mid: opt('Fortgeschritten', '1–3 Jahre, Technik der Grundübungen sitzt'), adv: opt('Erfahren', 'über 3 Jahre strukturiertes Training') })}`],
  ['Dein Ziel', 'Danach richten sich Phasen, Wiederholungsbereiche und Ernährung.', () => `
    ${chips('goal', { aufbau: opt('Muskelaufbau', 'leichter Überschuss, Volumen steigt'), abbau: opt('Fettabbau', 'Defizit, Kraft und Muskeln halten'), kraft: opt('Kraft', 'schwere Grundübungen, Maximalkraft'), fit: opt('Fit & definiert', 'Erhaltungskalorien, Rekomposition') })}
    <div class="q"><span>Schwerpunkt-Muskelgruppen <em>optional, max. 2 – bekommen je einen Satz mehr</em></span>${chips('focus', MUSCLES, true)}</div>`],
  ['Zeit & Ausstattung', 'Daraus entsteht dein Split.', () => `
    <div class="q"><span>Trainingstage pro Woche</span>${chips('days', { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' })}</div>
    <div class="q"><span>Zeit pro Einheit</span>${chips('minutes', { 45: '45 min', 60: '60 min', 75: '75 min', 90: '90 min' })}</div>
    <div class="q"><span>Wo trainierst du?</span>${chips('equip', { g: opt('Fitnessstudio', 'Maschinen, Kabel, Freihanteln'), h: opt('Homegym', 'Langhantel, Rack, Bank, Kurzhanteln'), d: opt('Kurzhanteln + Bank', 'minimal') })}</div>`],
  ['Alltag & Ernährung', 'Erholung entscheidet, wie viel Training du verträgst.', () => `
    <div class="q"><span>Alltagsaktivität</span>${chips('activity', { low: opt('Sitzend', 'Büro, wenig Schritte'), mid: opt('Gemischt', 'teils stehend/gehend'), high: opt('Körperlich aktiv', 'viel auf den Beinen') })}</div>
    <div class="q"><span>Schlaf pro Nacht</span>${chips('sleep', { low: 'unter 6 h', mid: '6–7 h', high: 'über 7 h' })}</div>
    <div class="q"><span>Stresslevel</span>${chips('stress', { low: 'niedrig', mid: 'mittel', high: 'hoch' })}</div>
    <div class="q"><span>Ernährungsform</span>${chips('diet', { omni: 'Mischkost', veggie: 'Vegetarisch', vegan: 'Vegan' })}</div>
    <div class="q"><span>Beschwerden <em>betroffene Übungen werden ersetzt</em></span>${chips('injuries', { schulter: 'Schulter', knie: 'Knie', ruecken: 'Unterer Rücken' }, true)}</div>`],
  ['Deine Kraftwerte', 'Ein aktueller Satz pro Übung reicht – z. B. 80 kg × 6. Leere Felder werden geschätzt und nach dem ersten Training durch echte Werte ersetzt.', () => `
    <div class="lifts">${Object.entries(LIFTS).map(([k, l]) => `<div class="liftrow"><span>${l}</span>${field('', `lifts.${k}.w`, 'kg')}<b>×</b>${field('', `lifts.${k}.r`, 'Wdh')}</div>`).join('')}</div>`],
];

function vOnboarding() {
  const [title, sub, body] = OB_STEPS[ui.obStep], last = ui.obStep === OB_STEPS.length - 1;
  return `<div class="ob">
    <div class="ob-top"><div class="brand"><span class="logo"></span>Formkurve</div><span class="step">${ui.obStep + 1} / ${OB_STEPS.length}</span></div>
    <div class="bar"><i style="width:${(ui.obStep + 1) / OB_STEPS.length * 100}%"></i></div>
    <h1>${title}</h1><p class="sub">${sub}</p>
    <div class="ob-body">${body()}</div>
    ${ui.obStep === 0 && !state.profile ? `<p class="obsync">Schon auf einem anderen Gerät eingerichtet? <button class="link" data-act="syncOpen">Daten über GitHub holen</button></p>` : ''}
    ${ui.obErr ? `<p class="err" role="alert">${ui.obErr}</p>` : ''}
    <div class="ob-nav">
      ${ui.obStep > 0 ? '<button class="btn ghost" data-act="obBack">Zurück</button>' : state.profile ? '<button class="btn ghost" data-act="obCancel">Abbrechen</button>' : '<span></span>'}
      <button class="btn primary" data-act="obNext">${last ? (state.profile ? 'Plan aktualisieren' : 'Programm erstellen') : 'Weiter'}</button>
    </div></div>`;
}

function finishOnboarding() {
  const ob = ui.ob;
  for (const k of Object.keys(ob.lifts)) if (!(ob.lifts[k]?.w > 0 && ob.lifts[k]?.r > 0)) delete ob.lifts[k];
  const isNew = !state.program;
  state.profile = ob;
  if (isNew) state.program = E.newProgram();
  state.nutrition = { kcal: E.baseKcal(ob), adjustments: state.nutrition?.adjustments || [] };
  if (!state.body.length) state.body.push({ date: E.today(), weight: ob.weight });
  if (!isNew) state.changes.push({ date: E.today(), title: 'Profil aktualisiert', label: 'Plan und Kalorien neu berechnet' });
  ui.ob = null; ui.obStep = 0; view = 'home';
  save();
  toast(isNew ? 'Dein Programm steht.' : 'Plan aktualisiert.');
}

// ---------- Heute ----------
function timeline() {
  const pr = state.program;
  return `<div class="timeline" aria-label="Makrozyklus">${PHASES[state.profile.goal].map((ph, i) => {
    const len = E.mesoWeeks(state, i);
    return `<div class="meso ${i === pr.meso ? 'on' : ''}" style="flex:${len}"><div class="meso-name"><b>${i + 1}</b> ${ph.name}</div><div class="cells">${Array.from({ length: len }, (_, w) => {
      const past = i < pr.meso || (i === pr.meso && w < pr.week), cur = i === pr.meso && w === pr.week, dl = w === len - 1;
      return `<button class="cell ${past ? 'past' : ''} ${cur ? 'cur' : ''} ${dl ? 'dl' : ''}" data-act="goWeek" data-meso="${i}" data-week="${w}" aria-label="Mesozyklus ${i + 1}, Woche ${w + 1}${dl ? ' (Deload)' : ''}">${dl ? 'D' : w + 1}</button>`;
    }).join('')}</div></div>`;
  }).join('')}</div>`;
}

const sugCard = s => `<article class="card sug"><div class="tag">${s.kind} · Vorschlag</div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
  <div class="actions">${s.action ? `<button class="btn primary sm" data-act="sugApply" data-id="${s.id}">${s.label}</button>` : ''}<button class="btn ghost sm" data-act="sugDismiss" data-id="${s.id}">${s.action ? 'Nicht jetzt' : 'Verstanden'}</button></div></article>`;

function vHome() {
  const p = state.profile, pr = state.program, plan = E.weekPlan(state, pr.meso, pr.week), m = plan.meta;
  const next = plan.days.find(d => !state.logs[d.key]?.done), done = plan.days.filter(d => state.logs[d.key]?.done).length;
  const mac = E.macros(state), tr = E.weightTrend(state);
  return `
  <header class="head"><div><p class="eyebrow">Makrozyklus ${pr.macro + 1} · Mesozyklus ${pr.meso + 1} von ${E.MESOS}</p>
    <h1>${plan.phase.name}${m.deload ? ' <span class="dl-badge">Deload</span>' : ''}</h1><p class="sub">${m.deload ? 'Halbes Volumen, leichte Lasten – Ermüdung abbauen, bevor es weitergeht.' : plan.phase.desc}</p></div>
    <div class="weekbadge"><small>Woche</small><b>${pr.week + 1}</b><small>von ${m.len}</small></div></header>
  ${timeline()}
  ${E.suggestions(state).map(sugCard).join('')}
  <div class="grid2">
    <section class="card next">${next ? `
      <div class="tag">${p.name ? `Hi ${esc(p.name)} – ` : ''}nächste Einheit</div><h2>${next.name}</h2>
      <ul class="mini">${next.exercises.map(x => `<li><span>${x.ex.name}</span><span>${x.sets} × ${x.reps[0]}–${x.reps[1]}</span></li>`).join('')}</ul>
      <button class="btn primary block" data-act="openLog" data-key="${next.key}">${state.logs[next.key] ? 'Training fortsetzen' : 'Training starten'}</button>` : `
      <div class="tag">Woche geschafft</div><h2>Alle ${plan.days.length} Einheiten erledigt</h2><p class="sub">Schließe die Woche ab, damit der Plan für die nächste berechnet wird.</p>
      <button class="btn primary block" data-act="modalClose">Woche abschließen</button>`}
    </section>
    <section class="card"><div class="cardhead"><h3>Diese Woche</h3><span class="muted">${done}/${plan.days.length} erledigt</span></div>
      <ul class="daylist">${plan.days.map(d => { const l = state.logs[d.key]; return `<li><button data-act="openLog" data-key="${d.key}"><span class="dot ${l?.done ? 'ok' : l ? 'part' : ''}"></span><span class="grow">${d.name}</span><span class="muted">${l?.done ? 'erledigt' : l ? 'begonnen' : `${d.exercises.length} Übungen`}</span></button></li>`; }).join('')}</ul>
      ${next ? `<button class="btn ghost block" data-act="modalClose">Woche abschließen</button>` : ''}
    </section>
  </div>
  <section class="card"><div class="cardhead"><h3>Ernährung heute</h3><button class="link" data-act="nav" data-view="food">Details</button></div>
    <div class="stats"><div><b>${num(mac.kcal, 0)}</b><small>kcal</small></div><div><b>${mac.protein} g</b><small>Protein</small></div><div><b>${mac.carbs} g</b><small>Kohlenhydrate</small></div><div><b>${mac.fat} g</b><small>Fett</small></div>
    <div><b>${num(E.bodyweight(state))} kg</b><small>${tr ? `${tr.kgWeek >= 0 ? '+' : ''}${num(tr.kgWeek, 2)} kg/Woche` : 'Gewicht'}</small></div></div></section>`;
}

// ---------- Plan ----------
function vPlan() {
  const pr = state.program, meso = ui.meso ?? pr.meso, len = E.mesoWeeks(state, meso), week = Math.min(ui.week ?? pr.week, len - 1);
  const plan = E.weekPlan(state, meso, week), cur = meso === pr.meso && week === pr.week, future = meso > pr.meso || (meso === pr.meso && week > pr.week);
  return `
  <header class="head"><div><p class="eyebrow">${GOALS[state.profile.goal]} · ${SPLIT_NAME[state.profile.days]}</p><h1>Trainingsplan</h1></div></header>
  <div class="tabs" role="tablist">${PHASES[state.profile.goal].map((ph, i) => `<button role="tab" aria-selected="${i === meso}" class="${i === meso ? 'on' : ''}" data-act="goWeek" data-meso="${i}" data-week="${i === pr.meso ? pr.week : 0}"><small>Mesozyklus ${i + 1}</small>${ph.name}</button>`).join('')}</div>
  <div class="weeks">${Array.from({ length: len }, (_, w) => `<button class="${w === week ? 'on' : ''} ${w === len - 1 ? 'dl' : ''}" data-act="goWeek" data-meso="${meso}" data-week="${w}">${w === len - 1 ? 'Deload' : `Woche ${w + 1}`}${meso === pr.meso && w === pr.week ? '<i></i>' : ''}</button>`).join('')}</div>
  <p class="note">${plan.meta.deload ? 'Deload: halbes Volumen, weit weg vom Muskelversagen.' : `${plan.phase.desc}.`} ${future ? 'Lasten sind eine Prognose und werden jede Woche aus deinen Einträgen neu berechnet.' : cur ? 'Aktuelle Woche.' : 'Vergangene Woche.'}</p>
  ${plan.days.map(d => { const l = state.logs[d.key]; return `
  <section class="card day"><div class="cardhead"><h3>${d.name}</h3>${future ? '' : `<button class="btn ${cur && !l?.done ? 'primary' : 'ghost'} sm" data-act="openLog" data-key="${d.key}">${l?.done ? 'Einträge ansehen' : l ? 'Fortsetzen' : 'Starten'}</button>`}</div>
    <div class="xhead"><span>Übung</span><span>Sätze × Wdh</span><span>${state.settings.unit === 'rpe' ? 'RPE' : 'RIR'}</span><span>Ziellast</span><span></span></div>
    ${d.exercises.map(x => `<div class="xrow"><div class="xname">${x.ex.name}<small>${ROLE[x.role]}</small></div><span class="xsets">${x.sets} × ${x.reps[0]}–${x.reps[1]}</span><span><i class="pill ${plan.meta.deload ? 'dl' : ''}">${eff(x.rir)}</i></span><span class="xload">${loadTxt(x)}</span>
      <span>${x.swappable ? `<button class="iconbtn" data-act="swap" data-slot="${x.slot}" data-cur="${x.ex.id}" title="Übung tauschen" aria-label="${x.ex.name} tauschen">⇄</button>` : ''}</span></div>`).join('')}
  </section>`; }).join('')}`;
}

// ---------- Training loggen ----------
function findDay(key) {
  const [ma, me, w, d] = key.split('-').map(Number);
  if (ma !== state.program.macro) return null;
  const plan = E.weekPlan(state, me, w);
  return { plan, day: plan.days[d] };
}

function vLog() {
  const f = findDay(ui.logKey);
  if (!f) { view = 'home'; return vHome(); }
  const { plan, day } = f, log = state.logs[day.key], rpe = state.settings.unit === 'rpe';
  return `
  <header class="head"><div><button class="link back" data-act="nav" data-view="home">← Übersicht</button><h1>${day.name}</h1><p class="sub">${plan.phase.name} · ${plan.meta.deload ? 'Deload' : `Woche ${+ui.logKey.split('-')[2] + 1}`} · Tippe ✓, wenn ein Satz wie geplant lief.</p></div></header>
  ${day.exercises.map(x => {
    const sets = log?.ex?.[x.ex.id] || [], rows = Math.max(x.sets, sets.length);
    const prev = E.history(state, x.ex.id).filter(h => h.key !== day.key).pop();
    return `<section class="card ex"><div class="cardhead"><div><h3>${x.ex.name}</h3><p class="muted">${x.sets} × ${x.reps[0]}–${x.reps[1]} · ${eff(x.rir)} · ${REST[x.role]}</p></div><div class="target"><small>Ziel</small><b>${loadTxt(x)}</b></div></div>
      ${prev ? `<p class="prev">Letztes Mal (${dateDE(prev.date)}): ${prev.sets.map(s => x.ex.noload ? s.r : `${num(s.w ?? 0)}×${s.r}`).join(' · ')}</p>` : ''}
      <div class="sets"><div class="sethead"><span>Satz</span><span>${x.ex.noload ? '' : 'kg'}</span><span>Wdh</span><span>${rpe ? 'RPE' : 'RIR'}</span><span></span></div>
      ${Array.from({ length: rows }, (_, i) => { const s = sets[i] || {}; const ok = s.r > 0; return `<div class="setrow ${ok ? 'ok' : ''}"><span class="n">${i + 1}</span>
        ${x.ex.noload ? '<span></span>' : `<input inputmode="decimal" aria-label="Gewicht Satz ${i + 1}" data-log="${x.ex.id}|${i}|w" value="${s.w ?? ''}" placeholder="${x.target ?? ''}">`}
        <input inputmode="numeric" aria-label="Wiederholungen Satz ${i + 1}" data-log="${x.ex.id}|${i}|r" value="${s.r ?? ''}" placeholder="${x.reps[0]}–${x.reps[1]}">
        <input inputmode="decimal" aria-label="${rpe ? 'RPE' : 'RIR'} Satz ${i + 1}" data-log="${x.ex.id}|${i}|e" value="${effVal(s.rir)}" placeholder="${effVal(x.rir)}">
        <button class="check" data-act="fill" data-ex="${x.ex.id}" data-i="${i}" aria-label="Satz ${i + 1} wie geplant">✓</button></div>`; }).join('')}
      </div><div class="exfoot"><button class="link" data-act="addSet" data-ex="${x.ex.id}" data-n="${rows}">+ Satz</button>${x.swappable ? `<button class="link muted" data-act="swap" data-slot="${x.slot}" data-cur="${x.ex.id}">⇄ Übung tauschen</button>` : ''}</div></section>`;
  }).join('')}
  <div class="sticky"><button class="btn primary block" data-act="finish">${log?.done ? 'Änderungen gespeichert – zurück' : 'Einheit abschließen'}</button></div>`;
}

function ensureLog(f) {
  return (state.logs[f.day.key] ||= { date: new Date().toISOString(), deload: f.plan.meta.deload, done: false, ex: {} });
}

// ---------- Diagramme ----------
function lineChart(pts, unit = 'kg') {
  if (pts.length < 2) return '<div class="empty">Ab dem zweiten Eintrag siehst du hier deinen Verlauf.</div>';
  const W = 640, H = 220, pl = 46, prr = 18, pt = 16, pb = 28, xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y1 - y0 < 2) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.15; y0 -= pad; y1 += pad;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = x => pl + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (W - pl - prr), Y = y => pt + (1 - (y - y0) / (y1 - y0)) * (H - pt - pb);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
  const grid = [0, 1, 2, 3].map(i => { const v = y0 + (y1 - y0) * i / 3; return `<line x1="${pl}" x2="${W - prr}" y1="${Y(v)}" y2="${Y(v)}" class="g"/><text x="${pl - 8}" y="${Y(v) + 4}" text-anchor="end">${num(v, 0)}</text>`; }).join('');
  const lastP = pts[pts.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf in ${unit}">${grid}
    <path d="${path} L${X(lastP.x)} ${H - pb} L${X(pts[0].x)} ${H - pb} Z" class="area"/><path d="${path}" class="line"/>
    ${pts.map(p => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${p.dl ? 3 : 4}" class="${p.dl ? 'pdl' : 'p'}"><title>${dateDE(p.x)}: ${num(p.y)} ${unit}</title></circle>`).join('')}
    <text x="${pl}" y="${H - 6}">${dateDE(pts[0].x)}</text><text x="${W - prr}" y="${H - 6}" text-anchor="end">${dateDE(lastP.x)}</text></svg>`;
}

function barChart(items) {
  if (!items.length) return '<div class="empty">Noch keine abgeschlossenen Sätze.</div>';
  const max = Math.max(...items.map(i => i.n));
  return `<div class="bars">${items.slice(-12).map(i => `<div class="barcol" title="${i.n} Sätze"><span>${i.n}</span><i class="${i.deload ? 'dl' : ''}" style="height:${Math.max(4, i.n / max * 100)}%"></i><small>M${i.me + 1}·W${i.w + 1}</small></div>`).join('')}</div>`;
}

// ---------- Fortschritt ----------
const BIG = ['sq', 'bench', 'dl', 'ohp', 'row'];
const prio = x => (BIG.includes(x.id) ? BIG.indexOf(x.id) : 9);

function vProgress() {
  const all = Object.values(EX).filter(x => !x.noload).map(x => ({ x, h: E.history(state, x.id) })).filter(o => o.h.length).sort((a, b) => prio(a.x) - prio(b.x) || b.h.length - a.h.length);
  const sel = all.find(o => o.x.id === ui.chartEx) || all[0];
  const body = state.body.map(b => ({ x: Date.parse(b.date), y: b.weight }));
  return `
  <header class="head"><div><p class="eyebrow">Langzeitverlauf</p><h1>Fortschritt</h1></div></header>
  <section class="card"><div class="cardhead"><h3>Kraftentwicklung <span class="muted">geschätztes 1RM</span></h3>
    ${all.length ? `<select data-change="chartEx" aria-label="Übung wählen">${all.map(o => `<option value="${o.x.id}" ${o === sel ? 'selected' : ''}>${o.x.name}</option>`).join('')}</select>` : ''}</div>
    ${sel ? lineChart(sel.h.map(h => ({ x: Date.parse(h.date), y: h.e1rm, dl: h.deload }))) : '<div class="empty">Sobald du dein erstes Training einträgst, erscheint hier deine Kraftkurve.</div>'}
    ${sel ? '<p class="muted small">Berechnet aus Gewicht, Wiederholungen und RIR des besten Satzes je Einheit. Blasse Punkte sind Deload-Einheiten.</p>' : ''}</section>
  ${all.length ? `<section class="card"><div class="cardhead"><h3>Bestwerte</h3></div><div class="table"><div class="trow th"><span>Übung</span><span>Start</span><span>Aktuell</span><span>Veränderung</span></div>
    ${all.slice(0, 10).map(o => { const real = o.h.filter(h => !h.deload), a = (real[0] || o.h[0]).e1rm, b = Math.max(...(real.length ? real : o.h).slice(-2).map(h => h.e1rm)), d = (b / a - 1) * 100; return `<div class="trow"><span>${o.x.name}</span><span>${num(a)} kg</span><span>${num(b)} kg</span><span class="${d > 0.5 ? 'up' : d < -0.5 ? 'down' : ''}">${d >= 0 ? '+' : ''}${num(d)} %</span></div>`; }).join('')}</div></section>` : ''}
  <div class="grid2">
    <section class="card"><div class="cardhead"><h3>Körpergewicht</h3><button class="link" data-act="nav" data-view="food">Eintragen</button></div>${lineChart(body)}</section>
    <section class="card"><div class="cardhead"><h3>Sätze pro Woche</h3></div>${barChart(E.weeklySets(state))}</section>
  </div>
  ${state.changes.length ? `<section class="card"><div class="cardhead"><h3>Anpassungen am Programm</h3></div><ul class="loglist">${state.changes.slice().reverse().map(c => `<li><span class="muted">${dateDE(c.date)}</span><span><b>${esc(c.title)}</b><br><span class="muted">${esc(c.label || '')}</span></span></li>`).join('')}</ul></section>` : ''}`;
}

// ---------- Ernährung ----------
function vFood() {
  const p = state.profile, mac = E.macros(state), tr = E.weightTrend(state), [lo, hi] = E.RATE[p.goal], w = E.bodyweight(state);
  const kcalOf = { protein: mac.protein * 4, carbs: mac.carbs * 4, fat: mac.fat * 9 };
  const status = !tr ? ['', 'Trage mindestens dreimal in zehn Tagen dein Gewicht ein, dann bewertet die App deinen Trend.'] : tr.pct < lo ? ['warn', p.goal === 'abbau' ? 'Du nimmst schneller ab als geplant.' : 'Du liegst unter dem Zielbereich.'] : tr.pct > hi ? ['warn', p.goal === 'abbau' ? 'Du nimmst langsamer ab als geplant.' : 'Du liegst über dem Zielbereich.'] : ['good', 'Du liegst im Zielbereich – nichts ändern.'];
  const tips = { omni: 'Proteinquellen auf 3–5 Mahlzeiten verteilen, je 25–40 g.', veggie: 'Milchprodukte, Eier, Hülsenfrüchte und Tofu kombinieren – je Mahlzeit 25–40 g Protein.', vegan: 'Proteinziel ist 10 % höher angesetzt. Soja, Seitan, Hülsenfrüchte und ein veganes Proteinpulver kombinieren.' }[p.diet];
  return `
  <header class="head"><div><p class="eyebrow">${GOALS[p.goal]}</p><h1>Ernährung</h1></div></header>
  <section class="card"><div class="kcal"><div><small>Tagesziel</small><b>${num(mac.kcal, 0)}</b><small>kcal</small></div>
    <div class="macrobars">${[['Protein', mac.protein, kcalOf.protein, `${num(mac.protein / w)} g/kg`], ['Kohlenhydrate', mac.carbs, kcalOf.carbs, ''], ['Fett', mac.fat, kcalOf.fat, `${num(mac.fat / w)} g/kg`]].map(([n, g, k, note], i) => `<div><div class="mb-top"><span>${n}</span><b>${g} g</b></div><div class="mb m${i}"><i style="width:${Math.min(100, k / mac.kcal * 100)}%"></i></div><small>${num(k / mac.kcal * 100, 0)} % der Kalorien${note ? ' · ' + note : ''}</small></div>`).join('')}</div></div>
    <p class="muted small">${tips}</p></section>
  <div class="grid2">
    <section class="card"><div class="cardhead"><h3>Gewicht eintragen</h3></div>
      <div class="inline"><label class="field"><span>Datum</span><div class="inp"><input type="date" id="bw-date" value="${E.today()}" max="${E.today()}"></div></label><label class="field"><span>Gewicht</span><div class="inp"><input inputmode="decimal" id="bw-val" placeholder="${num(w)}"><i>kg</i></div></label><button class="btn primary" data-act="addWeight">Speichern</button></div>
      <p class="muted small">Am besten morgens nüchtern, 3–7× pro Woche. Bewertet wird der Trend, nicht der einzelne Tag.</p>
      ${state.body.length ? `<ul class="loglist tight">${state.body.slice(-5).reverse().map(b => `<li><span class="muted">${dateDE(b.date)}</span><span>${num(b.weight)} kg</span><button class="iconbtn" data-act="delWeight" data-date="${b.date}" aria-label="Eintrag vom ${dateDE(b.date)} löschen">×</button></li>`).join('')}</ul>` : ''}
    </section>
    <section class="card"><div class="cardhead"><h3>Gewichtstrend</h3></div>
      <div class="stats two"><div><b>${tr ? `${tr.pct >= 0 ? '+' : ''}${num(tr.pct, 2)} %` : '–'}</b><small>pro Woche</small></div><div><b>${lo > 0 ? '+' : ''}${num(lo)} bis ${hi > 0 ? '+' : ''}${num(hi)} %</b><small>Zielbereich</small></div></div>
      <p class="status ${status[0]}">${status[1]}</p>
      <p class="muted small">Liegt der Trend zwei Wochen außerhalb des Zielbereichs, schlägt die App auf „Heute“ eine Kalorienanpassung vor.</p>
    </section>
  </div>
  <section class="card"><div class="cardhead"><h3>Gewichtsverlauf</h3></div>${lineChart(state.body.map(b => ({ x: Date.parse(b.date), y: b.weight })))}</section>
  ${state.nutrition.adjustments.length ? `<section class="card"><div class="cardhead"><h3>Kalorienanpassungen</h3></div><ul class="loglist">${state.nutrition.adjustments.slice().reverse().map(a => `<li><span class="muted">${dateDE(a.date)}</span><span>${a.delta > 0 ? '+' : ''}${a.delta} kcal → ${num(a.kcal, 0)} kcal</span></li>`).join('')}</ul></section>` : ''}`;
}

// ---------- Profil ----------
function vProfile() {
  const p = state.profile, R = E.refs(p);
  const rows = [['Ziel', GOALS[p.goal]], ['Erfahrung', LEVELS[p.level]], ['Split', `${p.days}× pro Woche · ${SPLIT_NAME[p.days]}`], ['Einheit', `${p.minutes} min · ${EQUIP[p.equip]}`], ['Schwerpunkt', (p.focus || []).map(f => MUSCLES[f]).join(', ') || '–'], ['Beschwerden', (p.injuries || []).map(i => ({ schulter: 'Schulter', knie: 'Knie', ruecken: 'Unterer Rücken' }[i])).join(', ') || 'keine']];
  return `
  <header class="head"><div><p class="eyebrow">Einstellungen</p><h1>${esc(p.name) || 'Profil'}</h1></div></header>
  <section class="card"><div class="cardhead"><h3>Dein Fragebogen</h3><button class="btn ghost sm" data-act="editProfile">Bearbeiten</button></div>
    <dl class="facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${E.lowRecovery(p) ? '<p class="status warn">Wenig Schlaf oder hoher Stress: Das Volumen steigt innerhalb eines Mesozyklus bewusst nicht an.</p>' : ''}</section>
  <section class="card"><div class="cardhead"><h3>Ausgangs-Kraftwerte <span class="muted">geschätztes 1RM</span></h3></div>
    <div class="stats">${Object.entries(LIFTS).map(([k, l]) => `<div><b>${num(R[k], 0)} kg</b><small>${l}${p.lifts?.[k] ? '' : ' · geschätzt'}</small></div>`).join('')}</div></section>
  <section class="card"><div class="cardhead"><h3>Anstrengung anzeigen als</h3></div>
    <div class="seg"><button class="${state.settings.unit === 'rir' ? 'on' : ''}" data-act="unit" data-unit="rir">RIR <small>Wiederholungen in Reserve</small></button><button class="${state.settings.unit === 'rpe' ? 'on' : ''}" data-act="unit" data-unit="rpe">RPE <small>Skala 1–10</small></button></div>
    <p class="muted small">RIR 2 entspricht RPE 8: Du hättest noch zwei saubere Wiederholungen geschafft.</p></section>
  ${syncCard()}
  <section class="card"><div class="cardhead"><h3>Daten</h3></div>
    <p class="muted small">${S.connected() ? 'Deine Daten liegen auf diesem Gerät und als Kopie in deinem GitHub-Konto.' : 'Alles liegt nur auf diesem Gerät.'} Mit dem Export sicherst du zusätzlich eine Datei, z. B. in iCloud Drive.</p>
    <div class="actions"><button class="btn ghost" data-act="export">Backup exportieren</button><label class="btn ghost">Backup importieren<input type="file" accept="application/json,.json" data-change="import" hidden></label><button class="btn danger" data-act="modalReset">Alles zurücksetzen</button></div></section>
  <p class="muted small center">Formkurve ersetzt keine ärztliche oder therapeutische Beratung. Bei Schmerzen Training anpassen und abklären lassen.</p>`;
}

// ---------- Synchronisierung ----------
const timeDE = t => new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function syncCard() {
  const i = S.info(), st = S.status;
  if (!i) return `<section class="card"><div class="cardhead"><h3>Synchronisierung</h3><span class="syncdot off">aus</span></div>
    <p class="muted small">Gleiche Training und Gewicht automatisch zwischen Handy und Rechner ab. Gespeichert wird in einem nicht gelisteten Gist in deinem GitHub-Konto.</p>
    <div class="actions"><button class="btn primary" data-act="syncOpen">Mit GitHub verbinden</button></div></section>`;
  const state_ = st.busy ? ['busy', 'gleicht ab …'] : st.error ? [st.offline ? 'wait' : 'err', st.offline ? 'offline' : 'Fehler'] : ['ok', 'aktiv'];
  return `<section class="card"><div class="cardhead"><h3>Synchronisierung</h3><span class="syncdot ${state_[0]}">${state_[1]}</span></div>
    <dl class="facts"><div><dt>GitHub-Konto</dt><dd>${esc(i.login)}</dd></div><div><dt>Zuletzt abgeglichen</dt><dd>${i.last ? timeDE(i.last) : 'noch nie'}</dd></div></dl>
    ${st.error ? `<p class="status ${st.offline ? '' : 'warn'}">${esc(st.error)}</p>` : ''}
    <p class="muted small">Abgeglichen wird automatisch nach jeder Änderung und beim Öffnen der App.</p>
    <div class="actions"><button class="btn ghost" data-act="syncNow" ${st.busy ? 'disabled' : ''}>Jetzt abgleichen</button>${st.error && !st.offline ? '<button class="btn ghost" data-act="syncOpen">Neu verbinden</button>' : ''}<button class="btn ghost" data-act="syncOff">Trennen</button></div></section>`;
}

function syncModal() {
  if (ui.modal === 'syncChoice') {
    const r = ui.conn.remote, n = Object.keys(r.logs || {}).length;
    return `<div class="overlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Welche Daten sollen gelten?</h2>
      <p class="sub">In deinem GitHub-Konto liegt schon ein Stand${r.profile?.name ? ` von ${esc(r.profile.name)}` : ''} mit ${n} Trainingseinheiten. Auf diesem Gerät sind ebenfalls Daten.</p>
      <div class="altlist"><button class="chip" data-act="syncChoose" data-mode="remote"><b>Online-Stand übernehmen</b><small>Empfohlen, wenn du bisher auf dem anderen Gerät trainiert hast. Die Daten auf diesem Gerät werden ersetzt.</small></button>
      <button class="chip" data-act="syncChoose" data-mode="merge"><b>Zusammenführen</b><small>Trainingseinheiten und Gewichtseinträge beider Geräte bleiben erhalten.</small></button></div>
      <div class="actions end"><button class="btn ghost" data-act="syncCancel">Abbrechen</button></div></div></div>`;
  }
  return `<div class="overlay" data-act="modalHide"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Mit GitHub verbinden</h2>
    <ol class="steps">
      <li>Öffne <a href="${S.TOKEN_URL}" target="_blank" rel="noopener">diese GitHub-Seite</a> und melde dich an. Das Häkchen bei „gist“ ist schon gesetzt.</li>
      <li>Bei „Expiration“ am besten „No expiration“ wählen, dann unten auf „Generate token“ tippen.</li>
      <li>Den Schlüssel (beginnt mit „ghp_“) kopieren und hier einfügen. Auf jedem Gerät denselben Schlüssel verwenden.</li>
    </ol>
    <label class="field"><span>GitHub-Schlüssel</span><div class="inp"><input type="password" id="sync-token" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ghp_…"></div></label>
    ${ui.syncErr ? `<p class="err" role="alert">${esc(ui.syncErr)}</p>` : ''}
    <p class="muted small">Der Schlüssel bleibt nur auf diesem Gerät und darf ausschließlich Gists lesen und schreiben. Gib ihn nicht weiter.</p>
    <div class="actions end"><button class="btn ghost" data-act="modalHide" data-force="1">Abbrechen</button><button class="btn primary" data-act="syncConnect" ${ui.syncBusy ? 'disabled' : ''}>${ui.syncBusy ? 'Verbinde …' : 'Verbinden'}</button></div></div></div>`;
}

// ---------- Dialoge ----------
function modal() {
  if (ui.modal === 'sync' || ui.modal === 'syncChoice') return syncModal();
  if (ui.modal === 'close') {
    const pr = state.program, plan = E.weekPlan(state, pr.meso, pr.week), done = plan.days.filter(d => state.logs[d.key]?.done).length;
    const nextTxt = !plan.meta.deload ? `Woche ${pr.week + 2}` : pr.meso < E.MESOS - 1 ? `Mesozyklus ${pr.meso + 2}` : `Makrozyklus ${pr.macro + 2}`;
    return `<div class="overlay" data-act="modalHide"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Woche abschließen</h2>
      <p class="sub">${done} von ${plan.days.length} Einheiten erledigt. Danach geht es mit ${nextTxt} weiter.</p>
      <div class="q"><span>Wie erholt hast du dich diese Woche gefühlt?</span><div class="chips five">${[1, 2, 3, 4, 5].map(n => `<button class="chip ${ui.rec === n ? 'on' : ''}" data-act="rec" data-n="${n}">${n}</button>`).join('')}</div><div class="scale"><span>erschöpft</span><span>topfit</span></div></div>
      <label class="field"><span>Aktuelles Gewicht <em>optional</em></span><div class="inp"><input inputmode="decimal" id="close-w" placeholder="${num(E.bodyweight(state))}"><i>kg</i></div></label>
      <div class="actions end"><button class="btn ghost" data-act="modalHide" data-force="1">Abbrechen</button><button class="btn primary" data-act="closeWeek">Abschließen</button></div></div></div>`;
  }
  if (ui.modal === 'swap') {
    const { pat, list } = E.alternatives(state, ui.swapSlot), inj = state.profile.injuries || [];
    return `<div class="overlay" data-act="modalHide"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><div><div class="tag">${PATTERN[pat]}</div><h2 id="mt">Übung tauschen</h2></div>
      <p class="sub">Zur Auswahl stehen nur Übungen mit demselben Bewegungsmuster – der Trainingstag behält seinen Fokus. Der Tausch gilt für alle kommenden Wochen.</p>
      <div class="altlist">${list.map(a => { const risky = (a.avoid || []).some(v => inj.includes(v)); return `<button class="chip ${a.id === ui.swapCur ? 'on' : ''}" data-act="swapPick" data-id="${a.id}"><b>${a.name}</b><small>${a.id === ui.swapCur ? 'aktuell im Plan' : risky ? 'belastet eine angegebene Beschwerde-Region' : E.history(state, a.id).length ? 'bereits trainiert – Lasten bekannt' : a.noload ? 'ohne Zusatzlast' : 'Startlast wird geschätzt'}</small></button>`; }).join('')}</div>
      <div class="actions end"><button class="btn ghost" data-act="modalHide" data-force="1">Abbrechen</button></div></div></div>`;
  }
  if (ui.modal === 'reset') {
    return `<div class="overlay" data-act="modalHide"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Alles zurücksetzen?</h2>
      <p class="sub">Profil, Plan und alle Trainings- und Gewichtseinträge werden von diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen – exportiere vorher ein Backup, wenn du die Daten behalten willst.${S.connected() ? ' Die Synchronisierung wird auf diesem Gerät getrennt; die Kopie in deinem GitHub-Konto bleibt erhalten.' : ''}</p>
      <div class="actions end"><button class="btn ghost" data-act="modalHide" data-force="1">Abbrechen</button><button class="btn danger" data-act="reset">Endgültig löschen</button></div></div></div>`;
  }
  return '';
}

// ---------- Rendern ----------
const VIEWS = { home: vHome, plan: vPlan, log: vLog, progress: vProgress, food: vFood, profile: vProfile };

function render() {
  if (!state.profile || ui.ob) {
    ui.ob ||= structuredClone(OB_DEFAULT);
    app.innerHTML = vOnboarding() + modal() + (ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : '');
    return;
  }
  const active = view === 'log' ? 'home' : view;
  app.innerHTML = `<div class="shell">
    <nav class="nav" aria-label="Hauptnavigation"><div class="brand"><span class="logo"></span>Formkurve</div>
      ${NAV.map(([v, l, d]) => `<button class="${v === active ? 'on' : ''}" data-act="nav" data-view="${v}" ${v === active ? 'aria-current="page"' : ''}>${icon(d)}<span>${l}</span></button>`).join('')}</nav>
    <main class="main">${VIEWS[view]()}</main></div>${modal()}${ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : ''}`;
}

function go(v) { view = v; render(); window.scrollTo(0, 0); }

// ---------- Aktionen ----------
const actions = {
  nav: d => { if (d.view === 'plan') { ui.meso = ui.week = null; } go(d.view); },
  goWeek: d => { ui.meso = +d.meso; ui.week = +d.week; if (view !== 'plan') go('plan'); else render(); },
  openLog: d => { ui.logKey = d.key; go('log'); },
  unit: d => { state.settings.unit = d.unit; save(); render(); },

  obSet: d => {
    const ob = ui.ob, v = ['days', 'minutes'].includes(d.field) ? +d.val : d.val;
    if (d.multi) {
      const a = (ob[d.field] ||= []), i = a.indexOf(v);
      if (i >= 0) a.splice(i, 1); else if (d.field !== 'focus' || a.length < 2) a.push(v);
    } else ob[d.field] = v;
    render();
  },
  obNext: () => {
    const ob = ui.ob;
    ui.obErr = '';
    if (ui.obStep === 0) {
      if (!(ob.age >= 14 && ob.age <= 90)) ui.obErr = 'Bitte gib dein Alter an (14–90 Jahre).';
      else if (!(ob.height >= 130 && ob.height <= 230)) ui.obErr = 'Bitte gib deine Größe in cm an.';
      else if (!(ob.weight >= 35 && ob.weight <= 250)) ui.obErr = 'Bitte gib dein Gewicht in kg an.';
      if (ui.obErr) return render();
    }
    if (ui.obStep < OB_STEPS.length - 1) { ui.obStep++; render(); window.scrollTo(0, 0); } else finishOnboarding();
  },
  obBack: () => { ui.obStep--; ui.obErr = ''; render(); },
  obCancel: () => { ui.ob = null; ui.obStep = 0; render(); },
  editProfile: () => { ui.ob = structuredClone(state.profile); ui.ob.lifts ||= {}; ui.obStep = 0; render(); window.scrollTo(0, 0); },

  swap: d => { ui.modal = 'swap'; ui.swapSlot = d.slot; ui.swapCur = d.cur; render(); },
  swapPick: d => {
    ui.modal = null;
    if (d.id === ui.swapCur) return render();
    state.program.swaps[ui.swapSlot] = d.id;
    state.changes.push({ date: E.today(), title: `${EX[ui.swapCur].name} getauscht`, label: `Neu im Plan: ${EX[d.id].name}` });
    save(); toast(`Getauscht: ${EX[d.id].name}.`);
  },
  sugApply: d => { const s = E.suggestions(state).find(x => x.id === d.id); if (s) { E.applySuggestion(state, s); save(); toast('Anpassung übernommen.'); } },
  sugDismiss: d => { state.program.handled.push(d.id); save(); render(); },

  fill: d => {
    const f = findDay(ui.logKey), x = f.day.exercises.find(e => e.ex.id === d.ex), log = ensureLog(f);
    const arr = (log.ex[d.ex] ||= []), s = (arr[d.i] ||= { p: x.rir });
    if (s.r > 0 && d.i == arr.length - 1 && s.auto) { arr[d.i] = null; } else {
      const prevSet = arr.slice(0, d.i).reverse().find(q => q && q.r > 0);
      if (!x.ex.noload) s.w ??= prevSet?.w ?? x.target ?? 0;
      s.r ??= prevSet?.r ?? Math.round((x.reps[0] + x.reps[1]) / 2);
      s.rir ??= x.rir;
      s.auto = true;
    }
    save(); render();
  },
  addSet: d => { const f = findDay(ui.logKey), x = f.day.exercises.find(e => e.ex.id === d.ex), arr = (ensureLog(f).ex[d.ex] ||= []); arr[+d.n] = { p: x.rir }; save(); render(); },
  finish: () => {
    const f = findDay(ui.logKey), log = state.logs[f.day.key];
    const n = log ? Object.values(log.ex).flat().filter(s => s && s.r > 0).length : 0;
    if (!n) return toast('Trage mindestens einen Satz ein.');
    const was = log.done;
    log.done = true; save(); view = 'home';
    toast(was ? 'Gespeichert.' : `${f.day.name} abgeschlossen – ${n} Sätze.`);
    window.scrollTo(0, 0);
  },

  addWeight: () => {
    const w = parse(document.getElementById('bw-val').value), date = document.getElementById('bw-date').value || E.today();
    if (!(w >= 30 && w <= 300)) return toast('Bitte ein gültiges Gewicht eingeben.');
    addWeight(date, w); save(); toast('Gewicht gespeichert.');
  },
  delWeight: d => { state.body = state.body.filter(b => b.date !== d.date); save(); render(); },

  modalClose: () => { ui.modal = 'close'; ui.rec = 3; render(); },
  modalReset: () => { ui.modal = 'reset'; render(); },
  modalHide: (d, t, ev) => { if (d.force || ev.target === t) { ui.modal = null; render(); } },
  rec: d => { ui.rec = +d.n; const w = document.getElementById('close-w').value; render(); document.getElementById('close-w').value = w; },
  closeWeek: () => {
    const pr = state.program, w = parse(document.getElementById('close-w').value);
    if (w >= 30 && w <= 300) addWeight(E.today(), w);
    state.checkins.push({ date: E.today(), key: `${pr.macro}-${pr.meso}-${pr.week}`, recovery: ui.rec });
    const r = E.closeWeek(state);
    ui.modal = null; ui.meso = ui.week = null; save(); view = 'home';
    const ph = PHASES[state.profile.goal][pr.meso].name;
    toast(r === 'week' ? `Woche ${pr.week + 1} ist geplant.` : r === 'meso' ? `Neuer Mesozyklus: ${ph}.` : `Makrozyklus ${pr.macro + 1} startet – Lasten basieren auf deinen neuen Bestwerten.`);
    window.scrollTo(0, 0);
  },

  syncOpen: () => { ui.modal = 'sync'; ui.syncErr = ''; render(); setTimeout(() => document.getElementById('sync-token')?.focus(), 50); },
  syncConnect: async () => {
    const token = document.getElementById('sync-token').value;
    ui.syncBusy = true; ui.syncErr = ''; render();
    try {
      const conn = await S.connect(token);
      ui.syncBusy = false;
      if (conn.remote && state.profile && !ui.ob?.age) { ui.conn = conn; ui.modal = 'syncChoice'; render(); return; }
      await finishSync(conn, conn.remote ? 'remote' : 'local');
    } catch (e) {
      ui.syncBusy = false; ui.syncErr = e.message; render();
      document.getElementById('sync-token').value = token;
    }
  },
  syncChoose: d => finishSync(ui.conn, d.mode),
  syncCancel: () => { ui.conn = null; ui.modal = null; render(); },
  syncNow: () => S.syncNow(),
  syncOff: () => { S.disconnect(); toast('Synchronisierung getrennt. Deine Daten bleiben auf diesem Gerät.'); },

  export: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.download = `formkurve-${(state.profile.name || 'backup').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${E.today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  reset: () => { S.disconnect(); replace(fresh()); ui.modal = null; ui.ob = null; ui.obStep = 0; view = 'home'; render(); },
};

function addWeight(date, weight) {
  state.body = state.body.filter(b => b.date !== date).concat({ date, weight }).sort((a, b) => (a.date < b.date ? -1 : 1));
}

document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]');
  if (t) actions[t.dataset.act]?.(t.dataset, t, ev);
});

document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.dataset.ob) {
    const path = el.dataset.ob.split('.'), last = path.pop();
    const o = path.reduce((a, k) => (a[k] ||= {}), ui.ob);
    o[last] = last === 'name' ? el.value.trim() : parse(el.value);
  } else if (el.dataset.log) {
    const [id, i, f] = el.dataset.log.split('|'), fd = findDay(ui.logKey), x = fd.day.exercises.find(e => e.ex.id === id);
    const arr = (ensureLog(fd).ex[id] ||= []), s = (arr[i] ||= { p: x.rir }), v = parse(el.value);
    if (f === 'e') s.rir = v == null ? undefined : Math.max(0, state.settings.unit === 'rpe' ? 10 - v : v);
    else s[f] = v;
    if (f === 'r' && v > 0 && s.w == null && !x.ex.noload) {
      // Gewicht leer gelassen: Vorsatz bzw. Ziellast übernehmen, damit der Satz zählt.
      s.w = arr.slice(0, i).reverse().find(q => q && q.w != null)?.w ?? x.target ?? 0;
      const wEl = el.closest('.setrow').querySelector('[data-log$="|w"]');
      if (wEl) wEl.value = s.w;
    }
    delete s.auto;
    el.closest('.setrow').classList.toggle('ok', s.r > 0);
    save(false);
  }
});

document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset.change === 'chartEx') { ui.chartEx = el.value; render(); }
  if (el.dataset.change === 'import' && el.files[0]) {
    el.files[0].text().then(t => {
      const data = JSON.parse(t);
      if (!data.profile || !data.program || !data.logs) throw new Error();
      replace(data); touchAll(); view = 'home'; toast('Backup importiert.');
    }).catch(() => toast('Die Datei ist kein gültiges Formkurve-Backup.'));
  }
});

document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && ui.modal) { ui.modal = null; render(); } });

async function finishSync(conn, mode) {
  ui.conn = null; ui.modal = null;
  await S.activate(conn, mode);
  if (state.profile) { ui.ob = null; ui.obStep = 0; }
  view = 'home';
  toast(S.status.error ? S.status.error : conn.remote ? `Verbunden – Daten von ${conn.login} geladen.` : 'Verbunden – deine Daten werden ab jetzt abgeglichen.');
  window.scrollTo(0, 0);
}

// Änderungen von anderen Geräten anzeigen, ohne laufende Eingaben zu stören.
const typing = () => { const a = document.activeElement; return a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName); };
S.onRemoteChange(() => { if (!typing() && !ui.modal && !ui.ob) render(); });
S.onStatus(() => { if (view === 'profile' && state.profile && !ui.ob && !ui.modal && !typing()) render(); });

render();
S.start();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
