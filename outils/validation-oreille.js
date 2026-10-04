/**
 * Validation terrain de la profondeur d'oreille : compare l'estimation de la borne
 * (`ear_depth_estimated_*`) à la mesure faite au mètre (`ear_depth_measured_*`, coin externe
 * de l'œil → oreille, en mm).
 *
 *   node outils/validation-oreille.js noa-morphologie.json            export du tableau de bord
 *   node outils/validation-oreille.js noa-morphologie.csv
 *   node outils/validation-oreille.js mesures.ndjson --manuel manuelles.csv     fichiers locaux d'une borne
 *   node outils/validation-oreille.js --auto-test                      vérifie ce script lui-même
 *
 * Options : --seuil 5         erreur acceptable en mm (défaut 5)
 *           --exploitables    ne garde que les estimations marquées exploitables par la borne
 *
 * manuelles.csv : participant,ear_depth_measured_right,ear_depth_measured_left (mm ; cellule vide permise).
 *
 * Il ne modifie rien. Tant que le verdict n'est pas « acceptable » sur assez de personnes et
 * de morphologies, la profondeur d'oreille ne doit PAS piloter les branches.
 */
const fs = require('fs');

const moy = a => a.reduce((s, x) => s + x, 0) / a.length;
const med = a => { const t = [...a].sort((x, y) => x - y), m = t.length >> 1; return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2; };
const ecart = a => { const m = moy(a); return Math.sqrt(moy(a.map(x => (x - m) ** 2))); };
const pearson = (x, y) => {
  if (x.length < 3) return null;
  const mx = moy(x), my = moy(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
};

/* ── Lecture : JSON, CSV ou NDJSON ─────────────────────────────────── */
function csv(texte) {
  const lignes = []; let champ = '', ligne = [], q = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (q) { if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else q = false; } else champ += c; }
    else if (c === '"') q = true;
    else if (c === ',') { ligne.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texte[i + 1] === '\n') i++; ligne.push(champ); champ = ''; if (ligne.some(x => x !== '')) lignes.push(ligne); ligne = []; }
    else champ += c;
  }
  if (champ !== '' || ligne.length) { ligne.push(champ); if (ligne.some(x => x !== '')) lignes.push(ligne); }
  if (!lignes.length) return [];
  const [tete, ...corps] = lignes; tete[0] = tete[0].replace(/^﻿/, '');
  return corps.map(l => Object.fromEntries(tete.map((h, i) => { let v = l[i]; if (v === undefined || v === '') return [h, null]; if (/^'[=+\-@]/.test(v)) v = v.slice(1); return [h, /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v]; })));
}
function lire(fichier) {
  const t = fs.readFileSync(fichier, 'utf8');
  if (/\.csv$/i.test(fichier)) return csv(t);
  if (/\.ndjson$/i.test(fichier)) return t.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  const j = JSON.parse(t); return Array.isArray(j) ? j : (j.mesures || []);
}
function joindre(lignes, manuelles) {
  if (!manuelles) return lignes;
  const m = new Map(manuelles.map(r => [String(r.participant), r]));
  return lignes.map(r => {
    const x = m.get(String(r.participant)); if (!x) return r;
    return { ...r,
      ear_depth_measured_right: r.ear_depth_measured_right ?? x.ear_depth_measured_right ?? x.droite_mm ?? null,
      ear_depth_measured_left: r.ear_depth_measured_left ?? x.ear_depth_measured_left ?? x.gauche_mm ?? null };
  });
}

/* ── Statistiques ──────────────────────────────────────────────────── */
function paires(lignes, exploitablesSeulement) {
  const P = [];
  for (const r of lignes) for (const c of ['right', 'left']) {
    const e = r['ear_depth_estimated_' + c], m = r['ear_depth_measured_' + c];
    if (!Number.isFinite(e) || !Number.isFinite(m)) continue;
    if (exploitablesSeulement && r['ear_depth_usable_' + c] !== 1) continue;
    P.push({ cote: c, est: e, mes: m, err: e - m, yaw: r['ear_yaw_' + c + '_deg'], largeur: r.face_width_mm, usable: r['ear_depth_usable_' + c] === 1,
             conf: r['ear_depth_confidence_' + c], participant: r.participant });
  }
  return P;
}
function resume(P) {
  if (!P.length) return null;
  const e = P.map(p => p.err), a = e.map(Math.abs);
  return { n: P.length, mae: moy(a), mediane: med(a), ecart_type: P.length > 1 ? ecart(e) : null, biais: moy(e), r: pearson(P.map(p => p.est), P.map(p => p.mes)) };
}
function analyser(lignes, { seuil = 5, exploitables = false } = {}) {
  const P = paires(lignes, exploitables);
  const tout = resume(P);
  const parCote = { right: resume(P.filter(p => p.cote === 'right')), left: resume(P.filter(p => p.cote === 'left')) };
  const tranches = [[15, 22], [22, 28], [28, 34], [34, 40.01]];
  const parYaw = tranches.map(([a, b]) => ({ plage: `${a}–${Math.min(b, 40)}°`, ...(resume(P.filter(p => p.yaw >= a && p.yaw < b)) || { n: 0 }) }));
  const lar = P.filter(p => Number.isFinite(p.largeur)).sort((x, y) => x.largeur - y.largeur), t = Math.floor(lar.length / 3);
  const parMorpho = lar.length >= 6 ? [['têtes étroites', lar.slice(0, t)], ['têtes moyennes', lar.slice(t, 2 * t)], ['têtes larges', lar.slice(2 * t)]].map(([nom, l]) => ({ nom, ...(resume(l) || { n: 0 }) })) : [];
  const parFlag = { exploitables: resume(P.filter(p => p.usable)), non_exploitables: resume(P.filter(p => !p.usable)) };
  const participants = new Set(P.map(p => p.participant)).size;
  const dans = P.length ? P.filter(p => Math.abs(p.err) <= seuil).length / P.length : null;
  const raisons = [];
  if (!tout || participants < 10) raisons.push(`pas assez de participants mesurés au mètre (${participants} ; il en faut au moins 10)`);
  if (tout) {
    if (tout.mae > seuil) raisons.push(`erreur absolue moyenne ${tout.mae.toFixed(1)} mm > ${seuil} mm`);
    if (Math.abs(tout.biais) > seuil / 2) raisons.push(`biais ${tout.biais.toFixed(1)} mm (> ${seuil / 2} mm) : l'estimation est décalée`);
    if (tout.r != null && tout.r < 0.7) raisons.push(`corrélation ${tout.r.toFixed(2)} < 0,70 : l'estimation ne suit pas les différences entre têtes`);
    for (const m of parMorpho) if (m.n >= 3 && m.mae > seuil * 1.5) raisons.push(`${m.nom} : erreur moyenne ${m.mae.toFixed(1)} mm`);
  }
  return { n_paires: P.length, participants, seuil, part_dans_seuil: dans, tout, parCote, parYaw, parMorpho, parFlag, verdict: raisons.length ? 'NON VALIDÉ' : 'ACCEPTABLE', raisons };
}

function afficher(R) {
  const f = (x, d = 1) => x == null ? '—' : x.toFixed(d), L = (nom, s) => s && s.n ? `${nom.padEnd(22)} n=${String(s.n).padStart(3)}  erreur moy. ${f(s.mae).padStart(5)} mm  médiane ${f(s.mediane).padStart(5)}  écart-type ${f(s.ecart_type).padStart(5)}  biais ${(s.biais >= 0 ? '+' : '') + f(s.biais)}  r ${f(s.r, 2)}` : `${nom.padEnd(22)} n=  0`;
  console.log(`${R.n_paires} paires estimation/mesure, ${R.participants} participant(s), seuil d'acceptation ${R.seuil} mm\n`);
  console.log(L('Toutes', R.tout)); console.log(L('Oreille droite', R.parCote.right)); console.log(L('Oreille gauche', R.parCote.left));
  if (R.tout && R.parCote.right && R.parCote.left) console.log(`  écart droite − gauche (biais) : ${f(R.parCote.right.biais - R.parCote.left.biais)} mm`);
  console.log(`  part des mesures dans ±${R.seuil} mm : ${R.part_dans_seuil == null ? '—' : Math.round(R.part_dans_seuil * 100) + ' %'}`);
  console.log('\nSelon le lacet (yaw) de la tête pendant la mesure'); R.parYaw.forEach(y => console.log('  ' + L(y.plage, y)));
  if (R.parMorpho.length) { console.log('\nSelon la largeur de visage'); R.parMorpho.forEach(m => console.log('  ' + L(m.nom, m))); }
  console.log('\nLe drapeau « exploitable » de la borne sépare-t-il les bonnes des mauvaises mesures ?');
  console.log('  ' + L('exploitables', R.parFlag.exploitables)); console.log('  ' + L('non exploitables', R.parFlag.non_exploitables));
  console.log(`\nVERDICT : ${R.verdict}`); R.raisons.forEach(r => console.log('  - ' + r));
  console.log("Verdict indicatif : à confirmer par une personne. « Acceptable » ne veut pas dire « activer » : on active progressivement, sur une borne d'abord.");
}

/* ── Auto-test : des données dont on connaît le biais et le bruit ───── */
function autoTest() {
  let g = 99; const al = () => { g = (g * 16807) % 2147483647; return g / 2147483647 - 0.5; };
  const gauss = () => (al() + al() + al() + al()) * 1.73;
  const L = [], man = [];
  for (let i = 0; i < 24; i++) {
    const vraiD = 62 + al() * 30, vraiG = vraiD + gauss() * 1.5, p = ('0000000' + i).slice(-8);
    L.push({ participant: p, face_width_mm: 130 + i, ear_yaw_right_deg: 18 + (i % 4) * 6, ear_yaw_left_deg: 18 + (i % 4) * 6,
      ear_depth_estimated_right: vraiD + 3 + gauss() * 2, ear_depth_estimated_left: vraiG + 3 + gauss() * 2, ear_depth_usable_right: 1, ear_depth_usable_left: 1 });
    man.push({ participant: p, ear_depth_measured_right: vraiD, ear_depth_measured_left: vraiG });
  }
  const R = analyser(joindre(L, man), { seuil: 5 });
  const csvTexte = 'participant,ear_depth_estimated_right,ear_depth_measured_right\n' + L.slice(0, 12).map((r, i) => `${r.participant},${r.ear_depth_estimated_right},${man[i].ear_depth_measured_right}`).join('\n');
  const rc = analyser(csv(csvTexte));
  const ec = [];
  if (Math.abs(R.tout.biais - 3) > 1.2) ec.push('biais retrouvé ' + R.tout.biais.toFixed(2) + ' au lieu de ≈ 3');
  if (R.tout.mae < 2 || R.tout.mae > 5) ec.push('erreur absolue moyenne hors attente : ' + R.tout.mae.toFixed(2));
  if (R.tout.r < 0.9) ec.push('corrélation trop basse : ' + R.tout.r.toFixed(2));
  if (R.n_paires !== 48) ec.push('nombre de paires ' + R.n_paires);
  if (R.parYaw.reduce((s, y) => s + y.n, 0) !== 48) ec.push('toutes les paires doivent tomber dans une tranche de lacet');
  if (rc.n_paires !== 12) ec.push('lecture CSV : ' + rc.n_paires + ' paires au lieu de 12');
  const nul = analyser(joindre(L.slice(0, 4), man.slice(0, 4)), { seuil: 5 });
  if (nul.verdict !== 'NON VALIDÉ') ec.push('4 participants ne doivent pas suffire');
  const mauvais = analyser(L.map(r => ({ ...r, ear_depth_estimated_right: r.ear_depth_estimated_right + 15, ear_depth_estimated_left: r.ear_depth_estimated_left + 15 })).map((r, i) => ({ ...r, ear_depth_measured_right: man[i].ear_depth_measured_right, ear_depth_measured_left: man[i].ear_depth_measured_left })), { seuil: 5 });
  if (mauvais.verdict !== 'NON VALIDÉ') ec.push('un biais de 15 mm doit être refusé');
  console.log(`biais ${R.tout.biais.toFixed(2)} mm (attendu ≈ 3) · erreur moy. ${R.tout.mae.toFixed(2)} mm · r ${R.tout.r.toFixed(2)} · ${R.n_paires} paires`);
  if (ec.length) { console.error('AUTO-TEST ÉCHEC\n - ' + ec.join('\n - ')); process.exit(1); }
  console.log('AUTO-TEST OK');
}

const args = process.argv.slice(2);
if (args.includes('--auto-test')) autoTest();
else {
  const opt = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };
  const fichiers = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--manuel' && args[i - 1] !== '--seuil');
  if (!fichiers.length) { console.error('usage : node outils/validation-oreille.js export.json|export.csv|mesures.ndjson [--manuel manuelles.csv] [--seuil 5] [--exploitables]'); process.exit(2); }
  const lignes = joindre(fichiers.flatMap(lire), opt('--manuel') ? lire(opt('--manuel')) : null);
  afficher(analyser(lignes, { seuil: Number(opt('--seuil')) || 5, exploitables: args.includes('--exploitables') }));
}
