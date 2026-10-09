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
  return { ZONE, SEUILS, IMAGES_STABLES, analyser, ressemble, creer };
});
