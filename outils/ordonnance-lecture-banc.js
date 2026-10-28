/**
 * Banc de lecture d'ordonnance : ce qui compte n'est pas de lire beaucoup, c'est de ne JAMAIS
 * proposer un chiffre faux. Un verre commandé sur une sphère mal lue est refait aux frais de la
 * boutique, et le client ne voit pas en attendant.
 *
 * Le banc exerce donc deux choses :
 *   1. les FORMES d'ordonnance réellement rencontrées — étiquetées, non étiquetées, françaises,
 *      anglaises, avec virgule ou point décimal, avec parenthèses ou sans ;
 *   2. les PANNES de l'OCR — O lu pour 0, I pour 1, S pour 5, tiret typographique, chiffre perdu.
 *      Pour chacune : soit la valeur est rendue juste, soit elle est refusée avec sa raison.
 *      Jamais un chiffre faux rendu sans alerte. C'est la seule chose qui compte vraiment.
 *
 * Lancer : node outils/ordonnance-lecture-banc.js
 */
const L = require('../ordonnance-lecture.js');
const ec = [], ok = (c, m) => { if (!c) ec.push(m); };

const ATTENDU = { od: { sph: -2.25, cyl: -0.75, axe: 90 }, og: { sph: -1.75, cyl: -0.5, axe: 85 } };

/** Compare ce qui est lu à la vérité. Un champ null est « non proposé » : acceptable. FAUX ne l'est pas. */
function controler(nom, r, attendu = ATTENDU, extra = {}) {
  for (const cle of ['od', 'og']) {
    const vrai = attendu[cle], lu = r[cle];
    if (!vrai) continue;
    if (!lu) { ec.push(`${nom} : œil ${cle} pas lu du tout`); continue; }
    for (const champ of ['sph', 'cyl', 'axe']) {
      if (lu[champ] == null) continue;                       // non proposé : c'est permis
      if (Math.abs(lu[champ] - vrai[champ]) > 1e-6)
        ec.push(`${nom} : ${cle}.${champ} FAUX — lu ${lu[champ]}, attendu ${vrai[champ]}`);
    }
  }
  for (const [champ, v] of Object.entries(extra)) {
    if (r[champ] == null) continue;
    if (Math.abs(r[champ] - v) > 1e-6) ec.push(`${nom} : ${champ} FAUX — lu ${r[champ]}, attendu ${v}`);
  }
}
/** Pour les formes propres, on exige en plus que tout ait bien été lu. */
function exigerComplet(nom, r) {
  for (const cle of ['od', 'og']) {
    const lu = r[cle];
    if (!lu) { ec.push(`${nom} : œil ${cle} non trouvé`); continue; }
    for (const champ of ['sph', 'cyl', 'axe'])
      if (lu[champ] == null) ec.push(`${nom} : ${cle}.${champ} non lu alors que le texte est propre`);
  }
}

/* ── 1. Les formes qu'on rencontre vraiment ──────────────────────────── */
const FORMES = {
  'français étiqueté': `Dr A. DIOP — Ophtalmologie
OD : Sph -2.25  Cyl -0.75  Axe 90
OG : Sph -1.75  Cyl -0.50  Axe 85
Addition : +1.50
Écart pupillaire : 62 mm`,
  'virgule décimale': `OD : Sph -2,25  Cyl -0,75  Axe 90
OG : Sph -1,75  Cyl -0,50  Axe 85
Addition : +1,50
Écart pupillaire : 62 mm`,
  'sans étiquette': `OD   -2.25   -0.75   90
OG   -1.75   -0.50   85
Add +1.50     EP 62`,
  'parenthèses': `OD : -2.25 (-0.75) 90°
OG : -1.75 (-0.50) 85°
Add. +1.50   PD 62`,
  'œil écrit en toutes lettres': `Œil droit  : sphère -2.25  cylindre -0.75  axe 90
Œil gauche : sphère -1.75  cylindre -0.50  axe 85
Addition +1.50 — écart pupillaire 62`,
  'anglais': `R  SPH -2.25  CYL -0.75  AXIS 90
L  SPH -1.75  CYL -0.50  AXIS 85
ADD +1.50   PD 62`,
  'points dans OD': `O.D. : -2.25  -0.75  90
O.G. : -1.75  -0.50  85
Add +1.50   E.P. 62`,
};
for (const [nom, texte] of Object.entries(FORMES)) {
  const r = L.lire(texte);
  controler(nom, r, ATTENDU, { add: 1.5, pd: 62 });
  exigerComplet(nom, r);
  ok(r.complet, `${nom} : devrait être complet`);
}

/* ── 2. Les pannes de l'OCR : juste, ou refusé, jamais faux ──────────── */
const PANNES = {
  'O lu pour zéro':      'OD : -2.25 -O.75 9O\nOG : -1.75 -O.5O 85',
  'I lu pour un':        'OD : -2.25 -0.75 90\nOG : -I.75 -0.50 85',
  'S lu pour cinq':      'OD : -2.2S -0.7S 90\nOG : -1.7S -0.50 8S',
  'tiret typographique': 'OD : –2.25 –0.75 90\nOG : –1.75 –0.50 85',
  'moins mathématique':  'OD : −2.25 −0.75 90\nOG : −1.75 −0.50 85',
  'espaces insécables':  'OD : -2.25 -0.75 90\nOG : -1.75 -0.50 85',
};
for (const [nom, texte] of Object.entries(PANNES)) controler('OCR ' + nom, L.lire(texte));

/* ── 2 bis. Ce que l'OCR rend VRAIMENT, relevé sur des ordonnances imprimées ─ */
// Ces textes ne sont pas inventés : ils sortent d'un vrai moteur OCR lancé sur des ordonnances
// rendues à l'écran (voir OCR_ORDONNANCE.md). Chacun a fait apparaître un défaut qu'aucun texte
// écrit à la main n'aurait révélé.
const RELEVES = {
  // « Cyl » rendu « Cy1l » et collé à sa valeur. Le « l » devenait le chiffre 1 : une valeur fausse.
  'mot-clé abîmé et collé': 'OD : Sph -2,25 Cy1l-0,75 Axe 90\nOG : Sph -1,75 Cyl-0,50 Axe 85',
  // Un tableau bordé : l'OCR rend de la bouillie. Rien ne doit en être proposé.
  'tableau illisible': "[| onère | vindre | me |\n\n[on | 25 | 45 | w |",
};
{
  const r = L.lire(RELEVES['mot-clé abîmé et collé']);
  controler('relevé mot-clé abîmé', r);
  ok(r.od && r.od.cyl === -0.75, `le cylindre collé au mot-clé doit se lire (lu ${r.od && r.od.cyl})`);
  const t = L.lire(RELEVES['tableau illisible']);
  ok(!t.complet, 'un tableau rendu en bouillie ne doit rien produire');
  for (const cle of ['od', 'og']) if (t[cle]) for (const c of ['sph', 'cyl', 'axe'])
    ok(t[cle][c] == null, `tableau illisible : ${cle}.${c} ne doit rien proposer (${t[cle][c]})`);
}
// Une lettre seule n'est jamais un chiffre, quelle que soit la confusion possible.
ok(L.nombre('l') === null && L.nombre('O') === null && L.nombre('S') === null,
   'une lettre isolée ne doit jamais devenir un chiffre');
ok(L.nombre('-1.75') === -1.75 && L.nombre('-O.75') === -0.75,
   'mais un chiffre mal lu dans un vrai nombre se corrige');

/* ── 3. Ce qui DOIT être refusé ──────────────────────────────────────── */
const refuse = (nom, texte, cle, champ) => {
  const r = L.lire(texte), o = r[cle];
  ok(!o || o[champ] == null, `${nom} : ${cle}.${champ} aurait dû être refusé, lu ${o && o[champ]}`);
  ok(r.alertes.length > 0, `${nom} : un refus doit toujours s'expliquer`);
};
refuse('sphère hors grille (0,30)', 'OD : -2.30 -0.75 90\nOG : -1.75 -0.50 85', 'od', 'sph');
refuse('sphère absurde (-99)',      'OD : -99.00 -0.75 90\nOG : -1.75 -0.50 85', 'od', 'sph');
refuse('axe au-delà de 180',        'OD : -2.25 -0.75 190\nOG : -1.75 -0.50 85', 'od', 'axe');
refuse('axe à virgule',             'OD : Sph -2.25 Cyl -0.75 Axe 90.5\nOG : Sph -1.75 Cyl -0.50 Axe 85', 'od', 'axe');
refuse('cylindre hors grille',      'OD : -2.25 -0.80 90\nOG : -1.75 -0.50 85', 'od', 'cyl');
{
  const r = L.lire('OD : -2.25 -0.75 90\nOG : -1.75 -0.50 85\nAddition : -1.50');
  ok(r.add == null, `une addition négative doit être refusée (lu ${r.add})`);
  const p = L.lire('OD : -2.25 -0.75 90\nOG : -1.75 -0.50 85\nEP 620');
  ok(p.pd == null, `un écart pupillaire de 620 mm doit être refusé (lu ${p.pd})`);
}

/* ── 4. Ce qui n'est pas une ordonnance ──────────────────────────────── */
{
  const vide = L.lire('');
  ok(!vide.complet && vide.alertes.length > 0 && vide.confiance <= 0, 'un texte vide : rien de lu, et on le dit');
  const lettre = L.lire('Cher confrère,\nJe vous adresse Monsieur Diop pour avis.\nCordialement.');
  ok(!lettre.complet, 'une lettre sans valeurs ne doit pas passer pour une ordonnance');
  ok(!lettre.od || lettre.od.sph == null, 'et rien ne doit en être proposé');
  const unOeil = L.lire('OD : -2.25 -0.75 90');
  ok(!unOeil.complet && unOeil.alertes.some(a => /gauche/.test(a)), 'un seul œil lu doit être signalé');
}

/* ── 5. Le cylindre et l'axe vont par deux ───────────────────────────── */
{
  const r = L.lire('OD : Sph -2.25 Cyl -0.75\nOG : Sph -1.75 Cyl -0.50 Axe 85');
  ok(r.alertes.some(a => /cylindre sans axe/.test(a)), 'un cylindre sans axe doit être signalé');
}
/* ── 6. Une ordonnance simple, sans cylindre ─────────────────────────── */
{
  const r = L.lire('OD : Sph -2.25\nOG : Sph -1.75');
  ok(r.od && r.od.sph === -2.25 && r.og && r.og.sph === -1.75, 'une ordonnance sans cylindre doit se lire');
  ok(r.complet, 'et être tenue pour complète : la sphère suffit à commander');
}
/* ── 7. La confiance ─────────────────────────────────────────────────── */
{
  const bon = L.lire(FORMES['français étiqueté']), mauvais = L.lire('OD : -2.30 -0.80 190\nOG : ???');
  ok(bon.confiance > 0.9, `une ordonnance propre doit inspirer confiance (${bon.confiance.toFixed(2)})`);
  ok(mauvais.confiance < 0.4, `une ordonnance mal lue ne doit pas inspirer confiance (${mauvais.confiance.toFixed(2)})`);
}

if (ec.length) { console.error('ÉCHEC\n - ' + ec.join('\n - ')); process.exit(1); }
console.log('LECTURE ORDONNANCE OK : ' + Object.keys(FORMES).length + ' formes lues, ' +
            Object.keys(PANNES).length + ' pannes d\'OCR sans un seul chiffre faux, ' +
            'valeurs hors grille / hors plage refusées avec leur raison');
