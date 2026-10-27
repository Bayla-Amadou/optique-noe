/**
 * Banc du lissage de pose : « la monture traîne-t-elle derrière le visage, et tremble-t-elle à l'arrêt ? »
 *
 * Mouvement synthétique, donc la vérité est connue exactement — ce qu'aucune vidéo ne donne. On fait
 * tourner une tête sur un axe (c'est le mouvement dont se plaint l'œil : « quand je tourne la tête »),
 * on ajoute un bruit de mesure, on passe le tout dans la LOI RÉELLE de la borne (pose-lissage.js), et
 * on mesure l'écart entre la monture affichée et le visage, EN PIXELS À L'ÉCRAN.
 *
 * Sur un seul axe, l'interpolation sphérique des quaternions se ramène exactement à une interpolation
 * linéaire des angles : le banc travaille donc en degrés, sans rien approximer.
 *
 * Le bruit de mesure n'est pas mesurable ici (le conteneur rend à 2 images/s) : on balaie donc une
 * plage de bruits plausibles, et une amélioration n'est retenue que si elle tient sur toute la plage.
 *
 * Le banc GARDE la loi en service : il vérifie qu'elle tient des bornes absolues (moins d'une image
 * de retard, pas de tremblement visible à l'arrêt), pour que personne ne la dégrade sans le voir.
 * Il affiche aussi la loi `vecteur`, étudiée puis écartée — voir l'en-tête de pose-lissage.js.
 *
 *   node outils/lissage-banc.js            les bornes, et la comparaison des deux lois
 *   node outils/lissage-banc.js --detail   une ligne par scénario et par niveau de bruit
 */
const L = require('../pose-lissage.js');

const FPS = 30, DT = 1 / FPS;
// Géométrie de la borne : la monture est à 13,6 cm de l'articulation du cou, vue à 52 cm par un
// objectif de 693 px de focale. Un degré de retard se voit donc comme 3,2 px de glissement.
const PX_PAR_DEG = 13.6 * 693 / 52 * Math.PI / 180;

let graine = 20261027;
const alea = () => { graine = (graine * 1664525 + 1013904223) >>> 0; return graine / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(alea() + 1e-12)) * Math.cos(2 * Math.PI * alea());

/* ── Les mouvements, en degrés de lacet au cours du temps ─────────────── */
const rampe = (t, t0, v) => t < t0 ? 0 : (t - t0) * v;
const SCENARIOS = {
  immobile:   { duree: 5, verite: () => 0 },
  demarrage:  { duree: 3, verite: t => Math.min(rampe(t, 1, 60), 48), depart: 1 },
  lent:       { duree: 6, verite: t => 20 * Math.sin(2 * Math.PI * 0.25 * t) },
  rapide:     { duree: 5, verite: t => 25 * Math.sin(2 * Math.PI * 1.0 * t) },
  demi_tour:  { duree: 3, verite: t => t < 1 ? 0 : t < 1.6 ? (t - 1) * 50 : Math.max(0, 30 - (t - 1.6) * 50), depart: 1 },
};
// De profil, MediaPipe voit la moitié du visage : son bruit grandit avec l'angle. Un scénario le
// modélise, parce que c'est précisément là que le client dit « la monture bouge toute seule ».
const BRUIT_PROFIL = a => 1 + 3 * Math.min(1, Math.abs(a) / 55);
SCENARIOS.profil = { duree: 6, verite: t => Math.min(55, Math.max(0, (t - 1) * 28)), depart: 1,
                     bruitSelonAngle: BRUIT_PROFIL };
// Le cas de la borne : le client tourne la tête, PUIS la garde tournée pour se regarder. C'est là
// qu'il dit « la monture bouge toute seule ». On ne mesure le tremblement que pendant qu'il tient.
SCENARIOS.profil_tenu = { duree: 7, verite: t => Math.min(50, Math.max(0, (t - 0.5) * 50)),
                          bruitSelonAngle: BRUIT_PROFIL, stable_a: 3.5 };   // 2 s de battement avant de juger
const BRUITS = [0.10, 0.25, 0.50];   // écart-type du bruit de mesure, en degrés par image

/** Passe un scénario dans la loi et rend les mesures, en pixels et millisecondes. */
function passer(scenario, bruitDeg, reglages) {
  const sc = SCENARIOS[scenario];
  const liss = L.creer(reglages);
  graine = 20261027;                                   // même bruit pour toutes les lois comparées
  let sortie = null, mesurePrec = null;
  const traces = [];
  for (let i = 0; i * DT <= sc.duree; i++) {
    const t = i * DT;
    const vrai = sc.verite(t);
    const mesure = vrai + gauss() * bruitDeg * (sc.bruitSelonAngle ? sc.bruitSelonAngle(vrai) : 1);
    if (sortie === null) { sortie = mesure; mesurePrec = mesure; traces.push({ t, vrai, sortie }); continue; }
    const residu = Math.abs(mesure - sortie) * L.DEG;
    const omega = (mesure - mesurePrec) * L.DEG / DT;      // signée : c'est tout l'objet de la loi
    const a = liss.alpha(residu, omega, DT);
    sortie += a * (mesure - sortie);
    mesurePrec = mesure;
    traces.push({ t, vrai, sortie });
  }
  const px = x => x * PX_PAR_DEG;
  const apres = t0 => traces.filter(x => x.t >= t0);
  const err = traces.map(x => x.sortie - x.vrai);

  // Tremblement : dispersion de l'écart une fois le régime ÉTABLI. Le délai `stable_a` laisse au
  // filtre le temps de rejoindre la tête, sans quoi on compterait son rattrapage comme un tremblement.
  const stable = apres(sc.stable_a != null ? sc.stable_a : 1).map(x => x.sortie - x.vrai);
  const moy = stable.reduce((s, v) => s + v, 0) / stable.length;
  const tremblement = px(Math.sqrt(stable.reduce((s, v) => s + (v - moy) ** 2, 0) / stable.length));

  const r = { tremblement_px: +tremblement.toFixed(2), erreur_max_px: +px(Math.max(...err.map(Math.abs))).toFixed(2) };

  // Retard : sur un mouvement continu, l'écart divisé par la vitesse donne directement le retard.
  const mob = traces.filter((x, i) => i > 2 && Math.abs(sc.verite(x.t) - sc.verite(x.t - DT)) / DT > 15);
  if (mob.length > 4) {
    const lags = mob.map(x => {
      const v = (sc.verite(x.t) - sc.verite(x.t - DT)) / DT;
      return Math.abs(v) > 1 ? (x.vrai - x.sortie) / v * 1000 : null;
    }).filter(v => v !== null);
    r.retard_ms = +(lags.reduce((s, v) => s + v, 0) / lags.length).toFixed(1);
  }
  // Dépassement : de combien la monture part-elle de l'autre côté quand la tête repart en arrière.
  if (sc.depart != null) {
    const fin = apres(sc.depart + 0.4);
    r.depassement_px = +px(Math.max(0, ...fin.map(x => -(x.sortie - x.vrai) * Math.sign(x.vrai || 1)))).toFixed(2);
  }
  return r;
}

module.exports = { passer, SCENARIOS, BRUITS, PX_PAR_DEG };
if (require.main === module) comparer();
function comparer(){

const LOIS = { service: { SOURCE_V: 'residu' }, vecteur_etudiee: { SOURCE_V: 'vecteur', ZONE_MORTE: 6 * L.DEG, V_REF: 15 * L.DEG, LISSAGE_V: 0.35 } };
const detail = process.argv.includes('--detail');
const res = {}, ec = [];

for (const scenario of Object.keys(SCENARIOS)) {
  res[scenario] = {};
  for (const [nom, reg] of Object.entries(LOIS)) {
    const par = BRUITS.map(b => passer(scenario, b, reg));
    const moyenne = {};
    for (const k of Object.keys(par[0])) moyenne[k] = +(par.reduce((s, x) => s + x[k], 0) / par.length).toFixed(2);
    res[scenario][nom] = moyenne;
    if (detail) BRUITS.forEach((b, i) => console.log(`${scenario.padEnd(13)} ${nom.padEnd(16)} bruit ${b.toFixed(2)}°  ${JSON.stringify(par[i])}`));
  }
}

/* ── Ce que la loi EN SERVICE doit tenir ──────────────────────────────── */
// Bornes absolues, pas une comparaison : elles disent ce qu'un client doit voir, et elles claquent
// le jour où quelqu'un touche aux coefficients sans mesurer.
const ok = (c, m) => { if (!c) ec.push(m); };
const S = x => res[x].service;
const UNE_IMAGE = 1000 / FPS;

ok(S('immobile').tremblement_px < 0.6,
   `tête immobile : la monture ne doit pas frémir (${S('immobile').tremblement_px} px, limite 0,6)`);
ok(S('lent').retard_ms < UNE_IMAGE && S('demarrage').retard_ms < UNE_IMAGE && S('rapide').retard_ms < UNE_IMAGE,
   `le retard doit rester sous une image (${UNE_IMAGE.toFixed(0)} ms) : lent ${S('lent').retard_ms}, démarrage ${S('demarrage').retard_ms}, rapide ${S('rapide').retard_ms}`);
ok(S('rapide').erreur_max_px < 6,
   `rotation vive : l'écart maximal doit rester sous 6 px (${S('rapide').erreur_max_px})`);
ok(S('demi_tour').depassement_px < 4,
   `demi-tour : la monture ne doit pas partir de l'autre côté de plus de 4 px (${S('demi_tour').depassement_px})`);
ok(S('profil').erreur_max_px < 12,
   `de profil, là où MediaPipe est le plus bruité, l'écart doit rester sous 12 px (${S('profil').erreur_max_px})`);
ok(L.REGLAGES.SOURCE_V === 'residu',
   'pose-lissage.js doit livrer la loi en service ; `vecteur` a été mesurée puis écartée');

console.log(JSON.stringify({ unites: "px à l'écran, ms", bruits_deg: BRUITS, image_ms: +UNE_IMAGE.toFixed(1),
  scenarios: res, resultat: ec.length ? 'ÉCHEC' : 'OK', echecs: ec }, null, 1));
process.exit(ec.length ? 1 : 0);
}
