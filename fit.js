/**
 * N.O.A — Moteur de fitting : profil du visage + dimensions physiques de la monture
 *
 * Pipeline : repères MediaPipe → calibration métrique → PROFIL TEMPORAIRE de l'utilisateur →
 * dimensions réelles de la monture → fitting → rendu Three.js.
 *
 * Aucune bibliothèque de têtes : chaque utilisateur est traité individuellement, sur ses propres
 * mesures. Le profil ne contient que des mesures dont la confiance atteint SEUIL_CONFIANCE ;
 * une mesure douteuse est absente, jamais devinée.
 *
 * La profondeur d'oreille est calculée à titre EXPÉRIMENTAL (champ `experimental`) et ne pilote
 * aucune branche.
 *
 * Fonctionne dans le navigateur (window.NOAFit) et sous Node (banc de test).
 */
(function (racine, usine) {
  if (typeof module === 'object' && module.exports) module.exports = usine();
  else racine.NOAFit = usine();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SEUIL_CONFIANCE = 0.6;
  const bornes = (v, a, b) => Math.max(a, Math.min(b, v));
  const ok = v => Number.isFinite(v);

  /* ── Dimensions physiques de la monture ───────────────────────────── */
  // Plages plausibles, en mm : au-delà, c'est une faute de saisie, pas un modèle rare.
  const PLAGES = {
    frameWidth:   [110, 165],   // largeur totale de la face
    lensWidth:    [35, 65],     // largeur d'un verre
    bridgeWidth:  [12, 28],     // largeur du pont
    lensHeight:   [25, 55],     // hauteur d'un verre
    templeLength: [115, 160],   // longueur d'une branche
  };
  /**
   * Normalise et contrôle les dimensions d'une monture. Accepte `bridge` comme synonyme de
   * `bridgeWidth` (ancien nom dans le catalogue). Renvoie { ok, specs, manque, hors }.
   */
  function validerSpecs(mm) {
    const s = { ...(mm || {}) };
    if (s.bridgeWidth == null && s.bridge != null) s.bridgeWidth = s.bridge;
    const manque = [], hors = [], specs = {};
    for (const [k, [a, b]] of Object.entries(PLAGES)) {
      if (!ok(+s[k]) || s[k] === null || s[k] === '') { manque.push(k); continue; }
      specs[k] = +s[k];
      if (specs[k] < a || specs[k] > b) hors.push(`${k} = ${specs[k]} mm (plage ${a}–${b})`);
    }
    return { ok: !manque.length && !hors.length, specs, manque, hors };
  }

  /**
   * Échelle d'un modèle 3D à ses dimensions réelles : la face se cale sur la largeur d'un verre
   * gravée, les branches sur leur longueur gravée. `natif` : mesures du modèle livré, en cm.
   * Même formule que le chargement des montures : elle ne dépend d'aucune tête.
   */
  function echelle(natif, specs, templeScaleRepli) {
    const sc = (specs.lensWidth && natif.lensWidth > 0) ? (specs.lensWidth / 10) / natif.lensWidth
             : (specs.frameWidth && natif.frameWidth > 0) ? (specs.frameWidth / 10) / natif.frameWidth : 1;
    const scZ = (specs.templeLength && natif.templeLength > 0) ? (specs.templeLength / 10) / natif.templeLength
              : sc * (templeScaleRepli || 1);
    return { sc, scZ };
  }

  /* ── Profil de l'utilisateur ──────────────────────────────────────── */
  /**
   * @param m     résultat de NOAMorpho.resultat() (mm, degrés, confiances)
   * @param pose  { yaw, pitch } courants, en degrés
   * @param ext   { ipdAncre_mm } : écart pupillaire ancré sur l'iris, s'il est connu (plus précis)
   * Ne garde que les mesures dont la confiance atteint le seuil.
   */
  function profilUtilisateur(m, pose, ext) {
    const p = { fiable: {} }, c = (nom, valeur, confiance) => {
      if (ok(valeur) && ok(confiance) && confiance >= SEUIL_CONFIANCE) { p[nom] = valeur; p.fiable[nom] = confiance; }
    };
    m = m || {};
    c('faceWidth', m.face_width_mm, m.face_width_confidence);
    c('templeWidth', m.temple_width_mm, m.temple_width_confidence);
    if (ext && ok(ext.ipdAncre_mm)) { p.IPD = ext.ipdAncre_mm; p.fiable.IPD = 1; }
    else c('IPD', m.ipd_head_mm, m.ipd_head_confidence);
    c('noseBridgeWidth', m.nose_bridge_width_mm, m.nose_bridge_width_confidence);
    c('noseBridgeHeight', m.nose_bridge_y_mm, m.nose_bridge_confidence);
    c('eyePosition', m.eye_position_y_mm, m.eye_position_confidence);       // hauteur des pupilles, repère de la tête
    // Oreille : hauteur seulement si assez fiable (côtés séparés).
    const eh = ['right', 'left'].map(s => ok(m['ear_height_' + s + '_mm']) ? m['ear_height_' + s + '_mm'] : null).filter(v => v != null);
    if (eh.length) p.earHeight = eh.reduce((a, b) => a + b, 0) / eh.length;
    if (pose) { if (ok(pose.yaw)) p.yaw = pose.yaw; if (ok(pose.pitch)) p.pitch = pose.pitch; }
    // Profondeur d'oreille : EXPÉRIMENTALE. Visible pour la collecte, jamais lue par le fitting.
    p.experimental = {
      earDepthRight: m.ear_depth_estimated_right ?? null, earDepthLeft: m.ear_depth_estimated_left ?? null,
      earDepthUsableRight: m.ear_depth_usable_right === 1, earDepthUsableLeft: m.ear_depth_usable_left === 1,
    };
    p.complet = ['faceWidth', 'templeWidth', 'IPD', 'eyePosition'].every(k => p[k] != null);
    return p;
  }

  /* ── Fitting ──────────────────────────────────────────────────────── */
  /**
   * Hauteur de la monture : le centre optique des verres doit tomber sur les pupilles de CE client.
   *
   *  - `eyePosition` : hauteur mesurée des pupilles dans le repère de la tête (mm).
   *  - La hauteur ABSOLUE des pupilles dans ce repère n'est pas calibrée (elle dépend du gabarit de
   *    la pose), donc la correction est DIFFÉRENTIELLE : on compare le client à une référence
   *    `refPupilles_mm`, la hauteur mesurée sur un client dont le placement a été validé à l'écran.
   *    Un client dont les pupilles sont plus hautes que la référence voit la monture montée d'autant,
   *    un client dont elles sont plus basses la voit descendue. Sans référence : aucune correction.
   *  - correction bornée à ± `limite_mm`.
   *
   * N'utilise que le profil du client et une référence mesurée : aucune tête de bibliothèque.
   * `brut_mm` (écart absolu contre le centre des verres) est fourni pour la collecte seulement.
   */
  function ajuster(profil, specs, geo, opts) {
    const o = { limite_mm: 3, ...(opts || {}) };
    const r = { dy_mm: 0, brut_mm: null, relatif_mm: null, appliquer: false, raisons: [] };
    if (!profil || profil.eyePosition == null) { r.raisons.push('hauteur des pupilles non fiable : aucune correction'); return r; }
    if (geo && ok(geo.ancreY_cm) && ok(geo.decalageY_cm) && ok(geo.centreVerreY_cm))
      r.brut_mm = profil.eyePosition - (geo.ancreY_cm + geo.decalageY_cm + geo.centreVerreY_cm) * 10;
    // Adéquation de la largeur (information, ne déplace rien) : face de la monture contre tempes.
    if (specs && profil.templeWidth != null && ok(specs.frameWidth)) {
      const e = specs.frameWidth - profil.templeWidth;
      r.largeur = { ecart_mm: Math.round(e * 10) / 10, jugement: e < -4 ? 'etroite' : e > 12 ? 'large' : 'ajustee' };
    }
    if (!ok(o.refPupilles_mm)) { r.raisons.push('référence de hauteur non calibrée : aucune correction'); return r; }
    r.relatif_mm = profil.eyePosition - o.refPupilles_mm;
    r.dy_mm = bornes(r.relatif_mm, -o.limite_mm, o.limite_mm);
    if (Math.abs(r.relatif_mm) > o.limite_mm) r.raisons.push(`écart ${r.relatif_mm.toFixed(1)} mm limité à ±${o.limite_mm} mm`);
    r.appliquer = true;
    return r;
  }

  return { SEUIL_CONFIANCE, PLAGES, validerSpecs, echelle, profilUtilisateur, ajuster };
});
