/**
 * Banc de précision du suivi. Lit une trace enregistrée sur la borne
 * (lancer l'application avec --trace=60, puis bouger la tête comme indiqué
 * ci-dessous) et mesure ce qu'on compare entre deux technologies de suivi :
 *
 *   • cadence du détecteur et part d'images sans visage ;
 *   • tremblement tête immobile (écart-type, en mm et en degrés), pose brute
 *     du détecteur contre pose affichée ;
 *   • retard de la pose affichée sur la pose brute pendant le mouvement ;
 *   • écart maximal entre les deux (ce que l'œil voit comme « ça traîne »).
 *
 * Protocole (60 s) : 10 s immobile de face · 10 s tête qui monte et descend
 * (hochements lents) · 10 s qui tourne gauche-droite · 10 s immobile · le reste
 * libre. Éclairage normal, à 50-60 cm de l'écran.
 *
 *   node outils/precision-suivi.js trace-....ndjson     (analyse)
 *   node outils/precision-suivi.js --auto-test          (vérifie le banc lui-même)
 */
const fs = require('fs');

const moy = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const ecart = a => { const m = moy(a); return Math.sqrt(moy(a.map(x => (x - m) ** 2))); };
const q = (a, p) => { const t = [...a].sort((x, y) => x - y); return t[Math.min(t.length - 1, Math.floor(p * t.length))]; };

// Matrice 4×4 colonne-majeure → quaternion [x,y,z,w] (rotation seule, échelle retirée).
function quatDeMatrice(m) {
  const c = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]].map(v => { const n = Math.hypot(...v) || 1; return v.map(x => x / n); });
  const [r00, r10, r20] = c[0], [r01, r11, r21] = c[1], [r02, r12, r22] = c[2];
  const tr = r00 + r11 + r22; let x, y, z, w;
  if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; w = S / 4; x = (r21 - r12) / S; y = (r02 - r20) / S; z = (r10 - r01) / S; }
  else if (r00 > r11 && r00 > r22) { const S = Math.sqrt(1 + r00 - r11 - r22) * 2; w = (r21 - r12) / S; x = S / 4; y = (r01 + r10) / S; z = (r02 + r20) / S; }
  else if (r11 > r22) { const S = Math.sqrt(1 + r11 - r00 - r22) * 2; w = (r02 - r20) / S; x = (r01 + r10) / S; y = S / 4; z = (r12 + r21) / S; }
  else { const S = Math.sqrt(1 + r22 - r00 - r11) * 2; w = (r10 - r01) / S; x = (r02 + r20) / S; y = (r12 + r21) / S; z = S / 4; }
  return [x, y, z, w];
}
const angle = (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; };

function analyser(lignes) {
  const det = lignes.filter(l => l.k === 'd'), aff = lignes.filter(l => l.k === 'a');
  const bruts = det.filter(l => l.m).map(l => ({ t: l.t, p: [l.m[12], l.m[13], l.m[14]], q: quatDeMatrice(l.m) }));
  const out = {};
  const dts = det.slice(1).map((l, i) => l.t - det[i].t);
  out.cadence_hz = 1000 / q(dts, .5);
  out.part_sans_visage = det.filter(l => !l.m).length / det.length;
  out.duree_s = (det[det.length - 1].t - det[0].t) / 1000;

  // Fenêtres immobiles : 2 s glissantes où la pose brute bouge le moins.
  const fen = (src) => {
    let best = null;
    for (let i = 0; i < src.length; i++) {
      const j = src.findIndex(x => x.t >= src[i].t + 2000); if (j < 0) break;
      const seg = src.slice(i, j); if (seg.length < 10) continue;
      const v = [0, 1, 2].reduce((s, k) => s + ecart(seg.map(x => x.p[k])), 0);
      if (!best || v < best.v) best = { i, j, v };
    }
    return best;
  };
  const w = fen(bruts);
  const tremble = (src, t0, t1) => {
    const seg = src.filter(x => x.t >= t0 && x.t < t1);
    const mq = seg.reduce((m, x) => m.map((v, k) => v + x.q[k]), [0, 0, 0, 0]); const n = Math.hypot(...mq); const qm = mq.map(v => v / n);
    return { pos_mm: 10 * Math.hypot(...[0, 1, 2].map(k => ecart(seg.map(x => x.p[k])))), rot_deg: Math.sqrt(moy(seg.map(x => angle(x.q, qm) ** 2))), n: seg.length };
  };
  if (w) { const t0 = bruts[w.i].t, t1 = bruts[w.j].t; out.immobile = { brut: tremble(bruts, t0, t1), affiche: tremble(aff.map(a => ({ t: a.t, p: a.p, q: a.q })), t0, t1), de: (t0 - det[0].t) / 1000, a: (t1 - det[0].t) / 1000 }; }

  // Retard : on décale la pose affichée jusqu'à ce qu'elle colle à la brute.
  const interp = (src, t) => { let lo = 0, hi = src.length - 1; if (t <= src[0].t || t >= src[hi].t) return null; while (hi - lo > 1) { const m = (lo + hi) >> 1; (src[m].t <= t ? lo = m : hi = m); } const u = (t - src[lo].t) / (src[hi].t - src[lo].t); return src[lo].p.map((v, k) => v + u * (src[hi].p[k] - v)); };
  const affs = aff.map(a => ({ t: a.t, p: a.p }));
  // Mouvement = là où la pose brute varie : on cherche le décalage qui minimise l'erreur sur y et x.
  const erreur = (dec) => { let s = 0, n = 0; for (const b of bruts) { const a = interp(affs, b.t + dec); if (!a) continue; s += (a[0] - b.p[0]) ** 2 + (a[1] - b.p[1]) ** 2; n++; } return n ? s / n : Infinity; };
  let meil = { d: 0, e: Infinity }; for (let d = -100; d <= 400; d += 5) { const e = erreur(d); if (e < meil.e) meil = { d, e }; }
  out.retard_ms = meil.d; out.erreur_residuelle_mm = 10 * Math.sqrt(meil.e);
  // Écart maximal, sans compensation du retard : ce qui se voit.
  const ecarts = bruts.map(b => { const a = interp(affs, b.t); return a ? 10 * Math.hypot(a[0] - b.p[0], a[1] - b.p[1]) : null; }).filter(x => x != null);
  out.ecart_affiche_brut_mm = { mediane: q(ecarts, .5), p95: q(ecarts, .95), max: Math.max(...ecarts) };
  return out;
}

function afficher(o) {
  const f = (x, d = 2) => x == null ? '—' : (+x).toFixed(d);
  console.log(`durée ${f(o.duree_s, 1)} s · cadence du détecteur ${f(o.cadence_hz, 1)} Hz · images sans visage ${f(100 * o.part_sans_visage, 1)} %`);
  if (o.immobile) {
    const i = o.immobile;
    console.log(`\nTête la plus immobile (de ${f(i.de, 1)} à ${f(i.a, 1)} s, ${i.brut.n} images)`);
    console.log(`  tremblement brut du détecteur : ${f(i.brut.pos_mm)} mm · ${f(i.brut.rot_deg)}°`);
    console.log(`  tremblement de la monture     : ${f(i.affiche.pos_mm)} mm · ${f(i.affiche.rot_deg)}°`);
  }
  console.log(`\nRetard de la monture sur la pose brute : ${f(o.retard_ms, 0)} ms (erreur résiduelle ${f(o.erreur_residuelle_mm)} mm)`);
  console.log(`Écart monture / pose brute : médiane ${f(o.ecart_affiche_brut_mm.mediane)} mm · P95 ${f(o.ecart_affiche_brut_mm.p95)} mm · max ${f(o.ecart_affiche_brut_mm.max)} mm`);
  console.log('\nLecture : le tremblement de la monture doit être bien plus bas que celui du détecteur (le lissage fait son travail) ;');
  console.log("le retard doit rester sous ~50 ms (sinon la monture traîne en mouvement). Le tremblement brut est la limite du détecteur lui-même.");
}

// ── Auto-test : un signal dont on connaît le retard et le bruit ─────────────
function autoTest() {
  let graine = 7; const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647 - 0.5; };
  const L = [], DT = 33.3, RET = 60, BR = 0.05;   // bruit 0,5 mm, retard vrai 60 ms
  const vrai = t => [0, t < 10000 ? 0 : 3 * Math.sin((t - 10000) / 1000 * 2 * Math.PI * 0.4), -50];
  let lisse = null;
  for (let t = 0; t < 40000; t += DT) {
    const v = vrai(t), b = v.map(x => x + BR * alea());
    L.push({ k: 'd', t, m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, b[0], b[1], b[2], 1] });
    const k = 1 - Math.exp(-DT / 40);                       // lissage exponentiel ≈ 40 ms
    const cible = vrai(t - RET + 0).map((x, i) => x);       // retard imposé en plus
    lisse = lisse ? lisse.map((x, i) => x + k * (cible[i] + BR * alea() - x)) : cible;
    L.push({ k: 'a', t, p: lisse, q: [0, 0, 0, 1] });
  }
  const o = analyser(L);
  const k0 = 1 - Math.exp(-DT / 40), attendu = Math.round(RET + (1 - k0) / k0 * DT);   // décalage pur + retard d'un lissage exponentiel discret
  const ok = Math.abs(o.retard_ms - attendu) <= 10 && o.immobile && o.immobile.brut.pos_mm > 0.1 && o.immobile.brut.pos_mm < 1 && o.immobile.affiche.pos_mm < o.immobile.brut.pos_mm;
  console.log(`retard mesuré ${o.retard_ms} ms (attendu ≈ ${attendu}) · tremblement brut ${o.immobile && o.immobile.brut.pos_mm.toFixed(2)} mm · lissé ${o.immobile && o.immobile.affiche.pos_mm.toFixed(2)} mm`);
  console.log(ok ? 'AUTO-TEST OK' : 'AUTO-TEST ÉCHEC'); process.exit(ok ? 0 : 1);
}

const arg = process.argv[2];
if (arg === '--auto-test') autoTest();
else if (!arg) { console.error('usage : node outils/precision-suivi.js trace.ndjson | --auto-test'); process.exit(2); }
else afficher(analyser(fs.readFileSync(arg, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))));
