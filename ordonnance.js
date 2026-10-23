/**
 * N.O.A — Détection d'une ordonnance tenue devant la caméra.
 *
 * Une feuille imprimée se reconnaît à trois choses dans la zone du cadre-guide : elle est CLAIRE, peu
 * COLORÉE (blanche ou crème), et couverte de TRAITS fins (le texte). Un mur clair n'a pas de traits ;
 * un vêtement clair a des plis doux, pas de texte ; un visage est coloré. Il faut en plus que la zone
 * reste STABLE pendant `IMAGES_STABLES` mesures de suite : on ne déclenche pas sur un geste qui passe.
 *
 * La détection ne fait que DÉMARRER le compte à rebours de la photo : le client voit 3, 2, 1 et peut
 * reprendre. Une erreur de détection coûte donc trois secondes, jamais une photo ratée sans le savoir.
 * Le bouton manuel reste disponible.
 *
 * Fonctionne dans le navigateur (window.NOAOrdonnance) et sous Node (banc de test).
 */
(function (racine, usine) {
  if (typeof module === 'object' && module.exports) module.exports = usine();
  else racine.NOAOrdonnance = usine();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Zone du cadre-guide, en fraction de l'image (x0, y0, x1, y1).
  const ZONE = { x0: 0.30, y0: 0.48, x1: 0.70, y1: 0.88 };
  const SEUILS = { lumMin: 140, satMax: 0.30, partClaireMin: 0.45, bordMin: 0.025, bordMax: 0.70, saut: 40, diffMax: 7 };
  const IMAGES_STABLES = 5;     // à 300 ms d'intervalle : environ 1,5 s

  /** Mesures de la zone : luminosité, saturation, part de pixels clairs, densité de traits. */
  function analyser(data, w, h, zone) {
    const z = zone || ZONE;
    const x0 = Math.floor(z.x0 * w), x1 = Math.floor(z.x1 * w), y0 = Math.floor(z.y0 * h), y1 = Math.floor(z.y1 * h);
    const g = new Float32Array((x1 - x0) * (y1 - y0));
    let lum = 0, sat = 0, claire = 0, n = 0, i = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++, i++) {
      const o = (y * w + x) * 4, r = data[o], gr = data[o + 1], b = data[o + 2];
      const mx = Math.max(r, gr, b), mn = Math.min(r, gr, b), l = 0.299 * r + 0.587 * gr + 0.114 * b;
      g[i] = l; lum += l; sat += mx > 0 ? (mx - mn) / mx : 0; if (l > 150) claire++; n++;
    }
    const lw = x1 - x0, lh = y1 - y0; let bords = 0, m = 0;
    for (let y = 0; y < lh - 1; y++) for (let x = 0; x < lw - 1; x++) {
      const p = y * lw + x;
      if (Math.abs(g[p] - g[p + 1]) + Math.abs(g[p] - g[p + lw]) > SEUILS.saut) bords++; m++;
    }
    return { lum: lum / n, sat: sat / n, partClaire: claire / n, bord: m ? bords / m : 0, gris: g, lw, lh };
  }
  const ressemble = (a) => a.lum >= SEUILS.lumMin && a.sat <= SEUILS.satMax && a.partClaire >= SEUILS.partClaireMin
                         && a.bord >= SEUILS.bordMin && a.bord <= SEUILS.bordMax;

  /** Détecteur à état : à appeler avec chaque mesure ; `pret` devient vrai après IMAGES_STABLES mesures concordantes. */
  function creer() {
    let prec = null, suite = 0;
    return {
      pousser(data, w, h) {
        const a = analyser(data, w, h);
        let stable = false;
        if (prec && prec.length === a.gris.length) {
          let d = 0; for (let i = 0; i < a.gris.length; i += 3) d += Math.abs(a.gris[i] - prec[i]);
          stable = d / Math.ceil(a.gris.length / 3) <= SEUILS.diffMax;
        }
        prec = a.gris;
        suite = (ressemble(a) && stable) ? suite + 1 : 0;
        return { pret: suite >= IMAGES_STABLES, progression: Math.min(1, suite / IMAGES_STABLES), mesures: { lum: a.lum, sat: a.sat, partClaire: a.partClaire, bord: a.bord } };
      },
      raz() { prec = null; suite = 0; },
    };
  }
  /* ── Lisibilité de la photo prise ───────────────────────────────────
     Détecter une feuille ne dit pas que la photo est LISIBLE : feuille floue (bougée, mise au point ratée),
     trop sombre, éblouie par un reflet, trop loin pour que le texte ait du détail. Sans ce contrôle, le client
     paie et l'opticien reçoit une ordonnance qu'il ne peut pas lire. On mesure sur la zone du cadre-guide,
     ramenée à une largeur fixe pour que le résultat ne dépende pas de la caméra.
     Les seuils viennent de rendus d'un texte réel (flou, obscurité, reflet) ; ils ne remplacent pas un essai
     sur la borne avec la vraie caméra et de vraies ordonnances (voir outils/ordonnance-banc.js). */
  const LISIBLE = { largeur: 480, encreMin: 30, contrasteMin: 60, papierMin: 135, texteMin: 0.018, nettetéMin: 0.60, reflet: 0.06, lignesMin: 4 };
  const RAISONS = {
    feuille:   "Je ne vois pas d'ordonnance. Placez la feuille dans le cadre.",
    vide:      "Je ne vois pas de texte. Approchez l'ordonnance du cadre.",
    sombre:    "Il fait trop sombre. Mettez l'ordonnance à la lumière.",
    reflet:    "Il y a un reflet sur la feuille. Penchez-la un peu.",
    contraste: "Le texte est trop pâle. Tenez la feuille bien à plat, à la lumière.",
    floue:     "L'ordonnance est floue. Tenez-la droite et ne bougez pas.",
  };
  /** @returns {{lisible:boolean, raison:string|null, message:string|null, mesures:object}} */
  function lisibilite(data, w, h, zone) {
    const z = zone || ZONE;
    const x0 = Math.floor(z.x0 * w), x1 = Math.floor(z.x1 * w), y0 = Math.floor(z.y0 * h), y1 = Math.floor(z.y1 * h);
    // Zone ramenée à 480 px de large (moyenne par aires) : la mesure ne dépend ni de la caméra ni de sa résolution.
    const gw = LISIBLE.largeur, fx = (x1 - x0) / gw, gh = Math.max(16, Math.floor((y1 - y0) / fx)), fy = (y1 - y0) / gh, n = gw * gh;
    const g = new Float32Array(n), hist = new Uint32Array(256);
    for (let j = 0; j < gh; j++) {
      const sy0 = y0 + Math.floor(j * fy), sy1 = Math.max(sy0 + 1, y0 + Math.floor((j + 1) * fy));
      for (let i = 0; i < gw; i++) {
        const sx0 = x0 + Math.floor(i * fx), sx1 = Math.max(sx0 + 1, x0 + Math.floor((i + 1) * fx));
        let t = 0, c = 0;
        for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) {
          const o = (yy * w + xx) * 4; t += 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]; c++;
        }
        const v = t / c; g[j * gw + i] = v; hist[Math.min(255, Math.round(v))]++;
      }
    }
    const pct = q => { let c = 0; const cible = q * n; for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= cible) return v; } return 255; };
    // Le texte couvre peu de surface : l'encre se lit dans les tout derniers pourcents sombres, le papier dans les clairs.
    const encre = pct(0.007), papier = pct(0.90), contraste = papier - encre;
    // Reflet : des blocs 8×8 entièrement brûlés ALORS QU'il reste du papier normalement exposé autour. Une feuille
    // entière saturée (caméra trop sensible) n'est pas un reflet : le texte y reste lisible tant que l'encre est noire.
    let blocs = 0, brules = 0, normaux = 0;
    for (let j = 0; j + 8 <= gh; j += 8) for (let i = 0; i + 8 <= gw; i += 8) {
      let min = 255, max = 0; for (let b = 0; b < 8; b++) for (let a = 0; a < 8; a++) { const v = g[(j + b) * gw + i + a]; if (v < min) min = v; if (v > max) max = v; }
      blocs++; if (min >= 250) brules++; else if (min > encre + 0.6 * contraste && max < 250) normaux++;
    }
    const reflet = blocs && normaux / blocs >= 0.15 ? brules / blocs : 0;
    // Traits : gradient (différence centrée) rapporté au contraste de la scène
    const mags = new Float32Array((gw - 2) * (gh - 2)); let traits = 0, k = 0;
    for (let j = 1; j < gh - 1; j++) for (let i = 1; i < gw - 1; i++) {
      const p = j * gw + i, m = Math.abs(g[p + 1] - g[p - 1]) + Math.abs(g[p + gw] - g[p - gw]);
      mags[k++] = m; if (contraste > 0 && m > 0.25 * contraste) traits++;
    }
    const texte = mags.length ? traits / mags.length : 0;
    mags.sort();
    const nh = Math.max(1, Math.floor(mags.length * 0.02)); let sh = 0;
    for (let q = mags.length - nh; q < mags.length; q++) sh += mags[q];
    const nettete = contraste > 0 ? (sh / nh) / contraste : 0;
    // Lignes de texte : profil de l'encre rangée par rangée ; une page écrite alterne lignes et interlignes.
    const seuilEncre = encre + 0.5 * contraste, prof = new Float32Array(gh);
    for (let j = 0; j < gh; j++) { let c = 0; for (let i = 0; i < gw; i++) if (g[j * gw + i] < seuilEncre) c++; prof[j] = c / gw; }
    const lisse = new Float32Array(gh); for (let j = 1; j < gh - 1; j++) lisse[j] = (prof[j - 1] + prof[j] + prof[j + 1]) / 3;
    let lignes = 0, dernier = -99;
    if (contraste >= LISIBLE.encreMin) for (let j = 2; j < gh - 2; j++) {
      if (lisse[j] >= 0.012 && lisse[j] >= lisse[j - 1] && lisse[j] > lisse[j + 1]) {
        if (j - dernier >= 6) { lignes++; dernier = j; }
        else if (lisse[j] > lisse[dernier]) dernier = j;           // pic voisin plus haut : même ligne
      }
    }
    // Une feuille est CLAIRE et peu COLORÉE sur l'essentiel de la zone (mur, visage, vêtement ne le sont pas). Les traits ne sont
    // pas exigés ici : une feuille floue reste une feuille, et se verra refuser pour son flou, avec le bon message.
    const a = analyser(data, w, h, z);
    const sur_feuille = a.lum >= 130 && a.sat <= SEUILS.satMax && a.partClaire >= SEUILS.partClaireMin;
    const mesures = { contraste, papier, texte: +texte.toFixed(4), nettete: +nettete.toFixed(3), reflet: +reflet.toFixed(3), lignes, feuille: sur_feuille, clair: +a.partClaire.toFixed(2), sat: +a.sat.toFixed(2) };
    let raison = null;
    if (papier < LISIBLE.papierMin) raison = 'sombre';
    else if (reflet > LISIBLE.reflet) raison = 'reflet';
    else if (!sur_feuille) raison = 'feuille';                                   // pas de feuille dans le cadre : mur, visage, vêtement
    else if (contraste < LISIBLE.encreMin || lignes < LISIBLE.lignesMin) raison = 'vide';   // une feuille, mais sans lignes de texte
    else if (texte < LISIBLE.texteMin || nettete < LISIBLE.nettetéMin) raison = 'floue';   // de l'encre, mais sans traits nets
    else if (contraste < LISIBLE.contrasteMin) raison = 'contraste';
    return { lisible: !raison, raison, message: raison ? RAISONS[raison] : null, mesures };
  }
  return { ZONE, SEUILS, IMAGES_STABLES, LISIBLE, RAISONS, analyser, ressemble, creer, lisibilite };
});
