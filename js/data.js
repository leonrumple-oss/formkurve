// Übungsbibliothek, Trainings-Templates und Phasenmodell.
// eq: g = Studio, h = Homegym (Langhantel, Rack, Bank, Kurzhanteln), d = Kurzhanteln + Bank
// ref/ratio: Startlast wird aus dem Referenz-Kraftwert geschätzt, bis echte Einträge vorliegen.

const e = (id, name, pat, eq, ref, ratio, o = {}) => ({ id, name, pat, eq, ref, ratio, step: 2.5, ...o });
const KH = { step: 2, per: 'je Hand' };
const KH1 = { step: 2 };

const LIST = [
  // Kniebeuge-Muster
  e('sq', 'Kniebeuge', 'squat', 'gh', 'squat', 1),
  e('legpress', 'Beinpresse', 'squat', 'g', 'squat', 1.8, { step: 5 }),
  e('hack', 'Hackenschmidt-Kniebeuge', 'squat', 'g', 'squat', 0.9),
  e('goblet', 'Goblet-Kniebeuge', 'squat', 'hd', 'squat', 0.35, KH1),
  e('heel', 'Goblet-Kniebeuge, Fersen erhöht', 'squat', 'hd', 'squat', 0.3, KH1),
  // Quadrizeps / einbeinig
  e('legext', 'Beinstrecker', 'quad', 'g', 'squat', 0.45, { avoid: ['knie'] }),
  e('bss', 'Bulgarian Split Squat', 'quad', 'ghd', 'squat', 0.18, { ...KH, avoid: ['knie'] }),
  e('lunge', 'Ausfallschritte', 'quad', 'ghd', 'squat', 0.18, { ...KH, avoid: ['knie'] }),
  e('stepup', 'Step-ups', 'quad', 'ghd', 'squat', 0.15, KH),
  // Hüftstreckung
  e('dl', 'Kreuzheben', 'hinge', 'gh', 'deadlift', 1, { avoid: ['ruecken'] }),
  e('rdl', 'Rumänisches Kreuzheben', 'hinge', 'gh', 'deadlift', 0.7, { avoid: ['ruecken'] }),
  e('hipthrust', 'Hip Thrust', 'hinge', 'gh', 'deadlift', 0.8),
  e('dbrdl', 'KH-Rumänisches Kreuzheben', 'hinge', 'ghd', 'deadlift', 0.27, KH),
  e('dbhip', 'KH-Hip-Thrust', 'hinge', 'd', 'deadlift', 0.3, KH1),
  // Beinbeuger
  e('legcurl', 'Beinbeuger', 'ham', 'g', 'deadlift', 0.28),
  e('slrdl', 'Einbeiniges KH-Kreuzheben', 'ham', 'ghd', 'deadlift', 0.12, KH),
  e('slidecurl', 'Beinbeuger am Slider/Ball', 'ham', 'hd', null, 0, { noload: true }),
  // Drücken horizontal
  e('bench', 'Bankdrücken', 'hpush', 'gh', 'bench', 1),
  e('dbbench', 'KH-Bankdrücken', 'hpush', 'ghd', 'bench', 0.36, KH),
  e('chestpress', 'Brustpresse', 'hpush', 'g', 'bench', 0.9),
  // Drücken schräg
  e('incdb', 'KH-Schrägbankdrücken', 'ipush', 'ghd', 'bench', 0.32, KH),
  e('incbb', 'Schrägbankdrücken', 'ipush', 'gh', 'bench', 0.8),
  // Drücken vertikal
  e('ohp', 'Überkopfdrücken', 'vpush', 'gh', 'ohp', 1, { avoid: ['schulter'] }),
  e('dbohp', 'KH-Schulterdrücken', 'vpush', 'ghd', 'ohp', 0.38, KH),
  e('mshoulder', 'Schulterpresse (Maschine)', 'vpush', 'g', 'ohp', 0.95),
  // Ziehen horizontal
  e('row', 'Langhantelrudern', 'hpull', 'gh', 'row', 1, { avoid: ['ruecken'] }),
  e('dbrow', 'KH-Rudern einarmig', 'hpull', 'ghd', 'row', 0.45, KH),
  e('cablerow', 'Kabelrudern sitzend', 'hpull', 'g', 'row', 0.95),
  e('csrow', 'Brustgestütztes KH-Rudern', 'hpull', 'ghd', 'row', 0.36, KH),
  // Ziehen vertikal
  e('latpull', 'Latzug', 'vpull', 'g', 'row', 0.95),
  e('pullup', 'Klimmzüge', 'vpull', 'gh', 'row', 0, { bw: true }),
  e('pullover', 'KH-Überzüge', 'vpull', 'ghd', 'row', 0.3, KH1),
  // Isolation
  e('cablefly', 'Kabelzug-Flys', 'fly', 'g', 'bench', 0.14, { per: 'je Seite' }),
  e('dbfly', 'KH-Flys', 'fly', 'ghd', 'bench', 0.16, KH),
  e('latraise', 'KH-Seitheben', 'delt', 'ghd', 'ohp', 0.14, { step: 1, per: 'je Hand' }),
  e('cablelat', 'Seitheben am Kabel', 'delt', 'g', 'ohp', 0.1, { per: 'je Seite' }),
  e('facepull', 'Face Pulls', 'rear', 'g', 'row', 0.35),
  e('revfly', 'KH-Reverse-Flys', 'rear', 'ghd', 'row', 0.1, { step: 1, per: 'je Hand' }),
  e('bbcurl', 'Langhantel-Curls', 'biceps', 'gh', 'row', 0.42),
  e('dbcurl', 'KH-Curls', 'biceps', 'ghd', 'row', 0.17, KH),
  e('hammer', 'Hammer-Curls', 'biceps', 'ghd', 'row', 0.19, KH),
  e('pushdown', 'Trizepsdrücken am Kabel', 'triceps', 'g', 'bench', 0.35),
  e('ohtri', 'KH-Trizepsstrecken über Kopf', 'triceps', 'ghd', 'bench', 0.24, KH1),
  e('skull', 'French Press', 'triceps', 'gh', 'bench', 0.35),
  e('kickback', 'KH-Trizeps-Kickbacks', 'triceps', 'ghd', 'bench', 0.1, { step: 1, per: 'je Hand' }),
  e('calf', 'Wadenheben stehend', 'calves', 'g', 'squat', 0.8, { step: 5 }),
  e('dbcalf', 'Wadenheben einbeinig (KH)', 'calves', 'ghd', 'squat', 0.15, KH1),
  e('cablecrunch', 'Cable Crunch', 'core', 'g', 'row', 0.5),
  e('legraise', 'Hängendes Beinheben', 'core', 'gh', null, 0, { noload: true }),
  e('revcrunch', 'Reverse Crunch', 'core', 'ghd', null, 0, { noload: true }),
];

export const EX = Object.fromEntries(LIST.map(x => [x.id, x]));
export const BY_PAT = LIST.reduce((m, x) => ((m[x.pat] ||= []).push(x), m), {});

export const PATTERN_MUSCLE = {
  squat: 'beine', quad: 'beine', hinge: 'gesaess', ham: 'gesaess',
  hpush: 'brust', ipush: 'brust', fly: 'brust',
  vpush: 'schultern', delt: 'schultern', rear: 'schultern',
  hpull: 'ruecken', vpull: 'ruecken',
  biceps: 'arme', triceps: 'arme', calves: 'waden', core: 'rumpf',
};

export const MUSCLES = { brust: 'Brust', ruecken: 'Rücken', schultern: 'Schultern', arme: 'Arme', beine: 'Beine', gesaess: 'Gesäß & Beinbeuger' };

// [Muster, Variante, Rolle] – hintere Slots fallen bei kurzer Trainingszeit zuerst weg.
export const TEMPLATES = {
  fbA: ['Ganzkörper A', [['squat', 0, 'main'], ['hpush', 0, 'main'], ['hpull', 0, 'main'], ['ham', 0, 'acc'], ['delt', 0, 'iso'], ['biceps', 0, 'iso'], ['core', 0, 'iso']]],
  fbB: ['Ganzkörper B', [['hinge', 0, 'main'], ['vpush', 0, 'main'], ['vpull', 0, 'main'], ['quad', 0, 'acc'], ['ipush', 0, 'acc'], ['triceps', 0, 'iso'], ['calves', 0, 'iso']]],
  fbC: ['Ganzkörper C', [['squat', 1, 'main'], ['ipush', 0, 'main'], ['hpull', 1, 'main'], ['hinge', 1, 'acc'], ['vpull', 0, 'acc'], ['delt', 0, 'iso'], ['triceps', 0, 'iso']]],
  upA: ['Oberkörper A', [['hpush', 0, 'main'], ['hpull', 0, 'main'], ['vpush', 1, 'acc'], ['vpull', 0, 'acc'], ['triceps', 0, 'iso'], ['biceps', 0, 'iso'], ['delt', 0, 'iso']]],
  upB: ['Oberkörper B', [['vpush', 0, 'main'], ['vpull', 0, 'main'], ['ipush', 0, 'acc'], ['hpull', 1, 'acc'], ['delt', 0, 'iso'], ['biceps', 1, 'iso'], ['triceps', 1, 'iso']]],
  loA: ['Unterkörper A', [['squat', 0, 'main'], ['hinge', 1, 'main'], ['quad', 0, 'acc'], ['ham', 0, 'acc'], ['calves', 0, 'iso'], ['core', 0, 'iso']]],
  loB: ['Unterkörper B', [['hinge', 0, 'main'], ['squat', 1, 'main'], ['ham', 0, 'acc'], ['quad', 1, 'acc'], ['calves', 0, 'iso'], ['core', 1, 'iso']]],
  push: ['Push', [['hpush', 0, 'main'], ['vpush', 0, 'main'], ['ipush', 0, 'acc'], ['delt', 0, 'iso'], ['triceps', 0, 'iso'], ['fly', 0, 'iso'], ['triceps', 1, 'iso']]],
  pull: ['Pull', [['vpull', 0, 'main'], ['hpull', 0, 'main'], ['hpull', 1, 'acc'], ['rear', 0, 'iso'], ['biceps', 0, 'iso'], ['biceps', 1, 'iso'], ['core', 0, 'iso']]],
  legs: ['Beine', [['squat', 0, 'main'], ['hinge', 1, 'main'], ['quad', 0, 'acc'], ['ham', 0, 'acc'], ['calves', 0, 'iso'], ['core', 0, 'iso']]],
  push2: ['Push B', [['vpush', 0, 'main'], ['ipush', 0, 'main'], ['hpush', 1, 'acc'], ['delt', 1, 'iso'], ['triceps', 1, 'iso'], ['fly', 0, 'iso']]],
  pull2: ['Pull B', [['hpull', 0, 'main'], ['vpull', 1, 'main'], ['hpull', 2, 'acc'], ['rear', 1, 'iso'], ['biceps', 1, 'iso'], ['biceps', 2, 'iso']]],
  legs2: ['Beine B', [['hinge', 0, 'main'], ['squat', 1, 'main'], ['ham', 0, 'acc'], ['quad', 1, 'acc'], ['calves', 0, 'iso'], ['core', 1, 'iso']]],
};

export const SPLITS = {
  2: ['fbA', 'fbB'],
  3: ['fbA', 'fbB', 'fbC'],
  4: ['upA', 'loA', 'upB', 'loB'],
  5: ['upA', 'loA', 'push', 'pull', 'legs2'],
  6: ['push', 'pull', 'legs', 'push2', 'pull2', 'legs2'],
};
export const SPLIT_NAME = { 2: 'Ganzkörper 2×', 3: 'Ganzkörper 3×', 4: 'Ober-/Unterkörper', 5: 'Ober/Unter + Push/Pull/Beine', 6: 'Push/Pull/Beine 2×' };

// Drei Mesozyklen pro Makrozyklus. Wiederholungsbereiche je Rolle.
const ph = (name, desc, main, acc, iso) => ({ name, desc, main, acc, iso });
export const PHASES = {
  aufbau: [
    ph('Akkumulation', 'Volumen aufbauen, Technik festigen', [8, 10], [10, 12], [12, 15]),
    ph('Hypertrophie', 'Mehr Last bei mittleren Wiederholungen', [6, 8], [8, 12], [10, 15]),
    ph('Intensivierung', 'Schwere Grundübungen, Kraft in Muskelmasse umsetzen', [5, 7], [8, 10], [10, 12]),
  ],
  kraft: [
    ph('Hypertrophie-Basis', 'Muskel- und Arbeitskapazität als Fundament', [6, 8], [8, 10], [10, 12]),
    ph('Kraft', 'Schwerere Lasten, weniger Wiederholungen', [4, 6], [6, 8], [8, 12]),
    ph('Maximalkraft', 'Spitzenlasten – danach neue Bestwerte testen', [2, 4], [5, 7], [8, 12]),
  ],
  abbau: [
    ph('Erhalt I', 'Kraft halten, Muskulatur im Defizit schützen', [6, 8], [8, 12], [12, 15]),
    ph('Erhalt II', 'Intensität hoch, Volumen moderat', [5, 8], [8, 10], [10, 15]),
    ph('Erhalt III', 'Schwer bleiben bis zum Ende der Diät', [5, 7], [8, 10], [10, 12]),
  ],
  fit: [
    ph('Grundlage', 'Bewegungsmuster und Belastbarkeit aufbauen', [8, 10], [10, 12], [12, 15]),
    ph('Aufbau', 'Lasten steigern bei sauberer Technik', [6, 8], [8, 12], [10, 15]),
    ph('Leistung', 'Kraftzuwachs festigen', [5, 7], [8, 10], [10, 12]),
  ],
};

export const GOALS = { aufbau: 'Muskelaufbau', abbau: 'Fettabbau', kraft: 'Kraft', fit: 'Fit & definiert' };
export const LEVELS = { beg: 'Anfänger', mid: 'Fortgeschritten', adv: 'Erfahren' };
export const EQUIP = { g: 'Fitnessstudio', h: 'Homegym', d: 'Kurzhanteln + Bank' };
export const LIFTS = { squat: 'Kniebeuge', bench: 'Bankdrücken', deadlift: 'Kreuzheben', ohp: 'Überkopfdrücken', row: 'Langhantelrudern' };

// Geschätztes 1RM als Vielfaches des Körpergewichts, falls kein Kraftwert angegeben wurde.
export const EST = {
  beg: { squat: 0.75, bench: 0.6, deadlift: 1.0, ohp: 0.4, row: 0.55 },
  mid: { squat: 1.25, bench: 1.0, deadlift: 1.5, ohp: 0.65, row: 0.9 },
  adv: { squat: 1.75, bench: 1.35, deadlift: 2.1, ohp: 0.85, row: 1.15 },
};
