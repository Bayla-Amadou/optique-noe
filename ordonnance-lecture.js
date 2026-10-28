/**
 * N.O.A — Lire les valeurs d'une ordonnance à partir d'un texte reconnu (OCR).
 *
 * ── CE QUE CE MODULE REFUSE DE FAIRE ────────────────────────────────────────
 * Il ne commande JAMAIS un verre. Il propose des valeurs à un opticien, qui les confirme devant la
 * photo. La raison est simple : une sphère lue −2,75 au lieu de −2,25 donne une paire de lunettes
 * inutilisable, refaite aux frais de la boutique, et un client qui ne voit pas. Un module qui se
 * trompe une fois sur cinquante coûte plus cher que la saisie à la main qu'il remplace.
 *
 * Toute la conception découle de là : **mieux vaut ne rien proposer que proposer un chiffre faux**.
 *
 * ── CE QUI REND LA LECTURE SÛRE ─────────────────────────────────────────────
 * Les valeurs d'une ordonnance obéissent à une grammaire très étroite, et c'est elle qui rattrape
 * l'OCR, pas l'inverse :
 *   · sphère et cylindre sont des MULTIPLES DE 0,25 — aucune exception en optique de prescription ;
 *   · l'axe est un entier de 0 à 180 ;
 *   · l'addition est positive, entre +0,50 et +4,00 ;
 *   · l'écart pupillaire est entre 45 et 80 mm.
 * Un nombre hors de cette grammaire n'est pas une ordonnance inhabituelle : c'est une erreur de
 * lecture. On le REFUSE, en disant lequel et pourquoi, au lieu de l'arrondir vers le plus proche —
 * arrondir est précisément ce qui transformerait une erreur visible en erreur invisible.
 *
 * Les confusions classiques de l'OCR sur des chiffres (O pour 0, l ou I pour 1, S pour 5, B pour 8)
 * sont corrigées AVANT la grammaire, puis la grammaire tranche.
 *
 * Fonctionne dans le navigateur (window.NOAOrdonnanceLecture) et sous Node (banc de test).
 */
(function (racine, usine) {
  if (typeof module === 'object' && module.exports) module.exports = usine();
  else racine.NOAOrdonnanceLecture = usine();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BORNES = {
    sph: [-30, 30], cyl: [-10, 10], add: [0.5, 4], axe: [0, 180], pd: [45, 80],
  };

  /** Confusions de l'OCR là où l'on attend un chiffre. Jamais appliqué à du texte libre. */
  const CHIFFRE = { O: '0', o: '0', Q: '0', D: '0', l: '1', I: '1', i: '1', '|': '1',
                    S: '5', s: '5', B: '8', Z: '2', z: '2', G: '6', T: '7', g: '9' };
  const enChiffres = t => t.replace(/[OoQDlIi|SsBZzGTg]/g, c => CHIFFRE[c] || c);

  /** Tous les signes moins possibles après un OCR, plus le point et la virgule décimale. */
  const normaliser = t => String(t || '')
    .replace(/[‐-―−－]/g, '-')     // tirets typographiques → moins
    .replace(/[   ]/g, ' ')
    .replace(/[,]/g, '.')                              // virgule décimale française
    .replace(/[ \t]+/g, ' ');

  const multipleDeQuart = v => Math.abs(v * 4 - Math.round(v * 4)) < 1e-6;

  /**
   * Lit un nombre signé là où l'on en attend un, en corrigeant les confusions de chiffres.
   * Rend null si ce n'est pas un nombre — jamais une valeur « au mieux ».
   */
  function nombre(brut) {
    if (brut == null) return null;
    // Un nombre contient au moins un VRAI chiffre. Sans cette ligne, le « l » de « Cyl » collé à sa
    // valeur par l'OCR deviendrait le chiffre 1 — une correction fausse, rendue sans la moindre
    // alerte. C'est exactement le genre d'erreur qui fait refaire une paire de lunettes.
    if (!/[0-9]/.test(String(brut))) return null;
    const t = enChiffres(String(brut).trim()).replace(/[^0-9.+-]/g, '');
    if (!/^[+-]?\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
    const v = parseFloat(t);
    return Number.isFinite(v) ? v : null;
  }

  /** Contrôle une valeur contre sa grammaire. Rend { v } ou { refus } — jamais une valeur corrigée. */
  function valider(champ, v, { signeObligatoire = false } = {}) {
    if (v == null) return { refus: 'illisible' };
    const [mn, mx] = BORNES[champ] || [-1e9, 1e9];
    if (v < mn || v > mx) return { refus: `hors plage (${mn} à ${mx})` };
    if (champ === 'axe') {
      if (!Number.isInteger(v)) return { refus: 'un axe est un nombre entier' };
      return { v };
    }
    if (!multipleDeQuart(v)) return { refus: 'pas un multiple de 0,25' };
    if (champ === 'add' && v <= 0) return { refus: 'une addition est positive' };
    if (signeObligatoire && v === 0) return { v };
    return { v };
  }

  // Un œil : « OD », « O.D. », « Œil droit », « R », « RE », « Droit » — et leurs équivalents gauches.
  // Les formes d'UNE SEULE LETTRE (R, L, à l'anglaise) sont à part : cherchées n'importe où, elles
  // attrapaient le « re » de « sphère » et une ordonnance entière basculait du mauvais œil. Elles ne
  // sont donc admises qu'en TÊTE de ligne, et seulement si un nombre suit.
  const OEIL = {
    od: [/\bo\s*\.?\s*d\b/i, /(?:oeil|œil)\s+droit/i, /\bdroit\b/i],
    og: [/\bo\s*\.?\s*[gs]\b/i, /(?:oeil|œil)\s+gauche/i, /\bgauche\b/i],
  };
  // Ce qui doit suivre une lettre seule pour qu'elle désigne un œil : un mot d'optique, ou un
  // nombre qui ressemble à une correction (signé, ou à décimales). Sans cela, « Le 12/09/2026 »
  // en tête d'ordonnance se lirait comme la ligne de l'œil gauche.
  const SUITE = '(?=[\\s:.\\-]*(?:sph|cyl|ax|[+\\-]\\s*\\d|\\d+[.,]\\d))';
  const OEIL_COURT = {
    od: new RegExp('^\\s*r\\.?e?\\b' + SUITE, 'i'),
    og: new RegExp('^\\s*l\\.?e?\\b' + SUITE, 'i'),
  };
  /** Le marqueur d'œil trouvé dans la ligne, ou null. Rendu pour pouvoir l'ôter avant de lire les nombres. */
  function marqueur(ligne, cle) {
    for (const re of OEIL[cle]) { const m = ligne.match(re); if (m) return m[0]; }
    const m = ligne.match(OEIL_COURT[cle]);
    return m ? m[0] : null;
  }
  const NOMBRE = '[+-]?[0-9OoQDlIiSsBZzGTg|]{1,3}(?:[.,][0-9OoQDlIiSsBZzGTg]{1,2})?';

  /**
   * Les trois nombres d'une ligne d'œil : sphère, cylindre, axe — étiquetés ou non.
   * @param ligne  la ligne DÉBARRASSÉE de son étiquette d'œil. C'est indispensable : « OD » et
   *               « O.G. » sont faits des lettres mêmes que l'OCR confond avec des chiffres, et
   *               l'étiquette se ferait lire comme une sphère.
   */
  function ligneOeil(ligne) {
    const r = { sph: null, cyl: null, axe: null, refus: {} };
    const etiq = (noms, champ) => {
      const m = ligne.match(new RegExp('(?:' + noms + ')\\s*:?\\s*(' + NOMBRE + ')', 'i'));
      if (m) r[champ] = m[1];
    };
    // Les mots-clés sont écrits comme l'OCR les rend, pas comme ils s'écrivent : « Cyl » revient
    // souvent en « Cy1l », « Sph » en « Sqh ». On tolère la confusion sur chaque lettre, et c'est la
    // grammaire des valeurs qui tranche ensuite.
    etiq('s[pq]h(?:[èeé]re|ere|er)?', 'sph');
    etiq('c[yv][l1i]{1,2}(?:indre|indr|ind)?', 'cyl');
    etiq('a[xk](?:[e3]|is|i5)?', 'axe');
    // Sans étiquette, l'ordre est universel : sphère, cylindre, axe.
    if (r.sph == null && r.cyl == null && r.axe == null) {
      // Un vrai nombre porte au moins un VRAI chiffre : une suite de lettres confondables, seule,
      // n'est pas un nombre mal lu, c'est du texte.
      const tous = ligne.match(new RegExp(NOMBRE, 'g')) || [];
      const utiles = tous.filter(x => /[0-9]/.test(x));
      if (utiles.length >= 1) r.sph = utiles[0];
      if (utiles.length >= 2) r.cyl = utiles[1];
      if (utiles.length >= 3) r.axe = utiles[2];
    }
    const out = {};
    for (const champ of ['sph', 'cyl', 'axe']) {
      if (r[champ] == null) { out[champ] = null; continue; }
      const c = valider(champ === 'axe' ? 'axe' : champ, nombre(r[champ]));
      if (c.refus) { out[champ] = null; r.refus[champ] = c.refus; }
      else out[champ] = c.v;
    }
    out._refus = r.refus;
    return out;
  }

  /**
   * @param texte  le texte rendu par l'OCR, tel quel
   * @returns {{od, og, add, pd, complet, confiance, alertes}}
   *   `od`/`og` : { sph, cyl, axe } — chaque champ peut valoir null s'il n'a pas été lu sûrement.
   *   `alertes` : ce qui a été refusé et pourquoi. C'est ce que l'opticien doit lire.
   */
  function lire(texte) {
    const t = normaliser(texte);
    const lignes = t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const res = { od: null, og: null, add: null, pd: null, alertes: [] };

    for (const ligne of lignes) {
      const mOD = marqueur(ligne, 'od'), mOG = marqueur(ligne, 'og');
      if (mOD && mOG) continue;                           // une ligne d'en-tête, pas une mesure
      if (!mOD && !mOG) continue;
      const cle = mOD ? 'od' : 'og';
      const v = ligneOeil(ligne.replace(mOD || mOG, ' '));
      if (res[cle]) { res.alertes.push(`deux lignes pour l'œil ${cle === 'od' ? 'droit' : 'gauche'} : la seconde est ignorée`); continue; }
      res[cle] = { sph: v.sph, cyl: v.cyl, axe: v.axe };
      for (const [champ, raison] of Object.entries(v._refus || {}))
        res.alertes.push(`œil ${cle === 'od' ? 'droit' : 'gauche'}, ${champ} : ${raison}`);
    }

    const seul = (noms, champ) => {
      const m = t.match(new RegExp('(?:' + noms + ')\\s*:?\\s*(' + NOMBRE + ')', 'i'));
      if (!m) return;
      const c = valider(champ, nombre(m[1]));
      if (c.refus) res.alertes.push(`${champ === 'add' ? 'addition' : 'écart pupillaire'} : ${c.refus}`);
      else res[champ] = c.v;
    };
    seul('add(?:ition|)?', 'add');
    seul('(?:écart\\s+pupillaire|ecart\\s+pupillaire|e\\.?p\\.?|p\\.?d\\.?)', 'pd');

    // Un cylindre sans axe, ou un axe sans cylindre, n'a pas de sens : on le signale.
    for (const cle of ['od', 'og']) {
      const o = res[cle]; if (!o) continue;
      const nom = cle === 'od' ? 'droit' : 'gauche';
      if (o.cyl != null && o.cyl !== 0 && o.axe == null) res.alertes.push(`œil ${nom} : un cylindre sans axe`);
      if (o.axe != null && o.cyl == null) res.alertes.push(`œil ${nom} : un axe sans cylindre`);
    }
    if (!res.od && !res.og) res.alertes.push('aucune ligne d\'œil reconnue');
    else if (!res.od) res.alertes.push('œil droit non trouvé');
    else if (!res.og) res.alertes.push('œil gauche non trouvé');

    // La confiance ne récompense QUE ce qui a été lu et validé. Elle ne devine rien.
    const attendus = ['od.sph', 'od.cyl', 'od.axe', 'og.sph', 'og.cyl', 'og.axe'];
    const lus = attendus.filter(c => { const [a, b] = c.split('.'); return res[a] && res[a][b] != null; }).length;
    res.complet = !!(res.od && res.og && res.od.sph != null && res.og.sph != null);
    res.confiance = Math.max(0, lus / attendus.length - 0.1 * res.alertes.length);
    return res;
  }

  return { BORNES, lire, normaliser, nombre, valider, ligneOeil };
});
