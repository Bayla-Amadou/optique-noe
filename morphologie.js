/**
 * N.O.A — Mesure de morphologie (validation terrain)
 *
 * ⚠ RIEN ICI N'INFLUENCE L'ESSAYAGE. Ce module sert uniquement au mode collecte
 * (--collecte) : il transforme les repères du visage en dimensions de la tête du
 * client, avec un score de confiance par mesure, pour comparer les estimations à
 * des mesures faites au mètre. Tant que la validation n'est pas faite, aucune de
 * ces valeurs ne doit piloter les montures.
 *
 * Fonctionne dans le navigateur (window.NOAMorpho) et sous Node (banc de test).
 *
 * Conventions
 *   • repère de la tête : celui de la matrice de pose MediaPipe, en cm ;
 *     x vers la gauche du visage vu de face, y vers le haut, z vers l'avant ;
 *   • « droite » / « gauche » = côtés du CLIENT (repères 33/234/127 à sa droite,
 *     263/454/356 à sa gauche) ;
 *   • les sorties sont en millimètres, les angles en degrés, les confiances de 0 à 1.
 *
 * Structure prévue pour le balayage guidé (face, gauche, droite, environ 1 s) :
 * `observer()` accepte autant d'observations qu'on veut, de n'importe quelle vue,
 * et `fusionner()` rassemble plusieurs sessions d'un même client. Le balayage
 * n'est pas encore obligatoire ni construit : il alimentera simplement ceci.
 */
(function (racine, usine) {
  if (typeof module === 'object' && module.exports) module.exports = usine();
  else racine.NOAMorpho = usine();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COTES = {
    droite: { oeil: 33,  oreille: 234, temple: 127 },
    gauche: { oeil: 263, oreille: 454, temple: 356 },
  };
  const POINTS = [234, 454, 127, 356, 168, 129, 358, 10, 152, 468, 473, 33, 263, 133, 362];

  // Fenêtres d'angle, en degrés de lacet (yaw).
  const YAW_FACE_MAX = 12;           // en dessous : vue de face
  const YAW_OREILLE = [15, 40];      // au-delà de 40°, le contour du visage glisse : on n'estime pas l'oreille
  const YAW_OREILLE_IDEAL = 32;      // au-delà, la confiance baisse
  const CAP = 90;                    // échantillons gardés par grandeur

  // Description du futur balayage guidé. `obligatoire:false` : décrit, pas déployé.
  const BALAYAGE_GUIDE = {
    obligatoire: false, duree_ms: 1000,
    etapes: [
      { id: 'face',   yaw: 0,   tolerance: 8 },
      { id: 'gauche', yaw: -22, tolerance: 8 },
      { id: 'droite', yaw: 22,  tolerance: 8 },
    ],
  };

  const bornes = (v, a, b) => Math.max(a, Math.min(b, v));
  const mediane = (a) => { if (!a.length) return null; const t = [...a].sort((x, y) => x - y); const m = t.length >> 1; return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2; };
  const arrondi = (v, d = 2) => v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d;

  /* ── Géométrie : repère image → repère de la tête ─────────────────── */

  // Inverse d'une transformation affine 4x4 (colonne-majeure) : rotation (éventuellement à
  // échelle uniforme) plus translation.
  function inverseAffine(m) {
    const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
    const r = 1 / det;
    const i00 = A * r, i01 = -(b * i - c * h) * r, i02 = (b * f - c * e) * r;
    const i10 = B * r, i11 = (a * i - c * g) * r, i12 = -(a * f - c * d) * r;
    const i20 = C * r, i21 = -(a * h - b * g) * r, i22 = (a * e - b * d) * r;
    const tx = m[12], ty = m[13], tz = m[14];
    return [i00, i10, i20, 0, i01, i11, i21, 0, i02, i12, i22, 0,
            -(i00 * tx + i01 * ty + i02 * tz), -(i10 * tx + i11 * ty + i12 * tz), -(i20 * tx + i21 * ty + i22 * tz), 1];
  }

  // Angles de la tête (ordre YXZ, comme le reste de N.O.A), en degrés.
  function anglesDepuisMatrice(m) {
    const r = 180 / Math.PI;
    return { yaw: Math.atan2(m[8], m[10]) * r, pitch: Math.asin(bornes(-m[9], -1, 1)) * r, roll: Math.atan2(m[1], m[5]) * r };
  }

  /**
   * Une observation à partir des repères d'une image.
   * @param lm      repères MediaPipe (x, y normalisés ; z relatif, même échelle que x)
   * @param matrice pose de la tête, 16 nombres colonne-majeure, translation en cm
   * @param W, H    taille de l'image en pixels
   * @param focale  focale en pixels
   * Chaque repère est dé-projeté à SA profondeur : une oreille 8 cm derrière les
   * yeux serait sinon lue environ 15 % trop étroite.
   */
  function observation(lm, matrice, W, H, focale) {
    if (!lm || !matrice || matrice.length !== 16 || !(focale > 0)) return null;
    const prof = -matrice[14];
    if (!(prof > 15 && prof < 150)) return null;
    const inv = inverseAffine(matrice); if (!inv) return null;
    const kxy = prof / focale, pts = {}, profondeur = {};
    for (const i of POINTS) {
      const L = lm[i]; if (!L) return null;
      const zl = prof + (L.z || 0) * W * kxy, ks = zl / focale;
      const x = (L.x - 0.5) * W * ks, y = -(L.y - 0.5) * H * ks, z = -zl;
      pts[i] = [inv[0] * x + inv[4] * y + inv[8] * z + inv[12],
                inv[1] * x + inv[5] * y + inv[9] * z + inv[13],
                inv[2] * x + inv[6] * y + inv[10] * z + inv[14]];
      profondeur[i] = zl;
    }
    return { ...anglesDepuisMatrice(matrice), pts, profondeur };
  }

  /* ── Accumulation ─────────────────────────────────────────────────── */

  const serie = () => ({ v: [], yaw: [], pitch: [], roll: [] });
  function creerSession() {
    return {
      face: { n: 0, yaw: [], pitch: [], roll: [], largeur: [], hauteur: [], tempes: [], tempeD: [], tempeG: [], nez: [], pontY: [], pontZ: [], asym: [], pupY: [], ipd: [], pontL: [] },
      oreille: { droite: { d: [], dz: [], h: [], yaw: [], pitch: [], roll: [] }, gauche: { d: [], dz: [], h: [], yaw: [], pitch: [], roll: [] } },
    };
  }
  const pousse = (a, v) => { if (a.length < CAP && Number.isFinite(v)) a.push(v); };
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

  function observer(session, obs) {
    if (!session || !obs || !obs.pts) return;
    const ay = Math.abs(obs.yaw), P = obs.pts;
    if (ay < YAW_FACE_MAX) {
      const F = session.face; if (F.n >= CAP) return; F.n++;
      pousse(F.yaw, ay); pousse(F.pitch, Math.abs(obs.pitch)); pousse(F.roll, Math.abs(obs.roll));
      pousse(F.largeur, Math.abs(P[234][0] - P[454][0]));
      pousse(F.hauteur, Math.abs(P[10][1] - P[152][1]));
      pousse(F.tempes, Math.abs(P[127][0] - P[356][0]));
      pousse(F.tempeD, Math.abs(P[127][0])); pousse(F.tempeG, Math.abs(P[356][0]));
      pousse(F.nez, Math.abs(P[129][0] - P[358][0]));
      pousse(F.pupY, (P[468][1] + P[473][1]) / 2);                 // hauteur des pupilles dans le repère de la tête
      pousse(F.ipd, Math.abs(P[468][0] - P[473][0]));
      pousse(F.pontL, Math.abs(P[133][0] - P[362][0]));            // entre les coins internes des yeux : largeur du pont
      const ym = (P[468][1] + P[473][1]) / 2, zm = (P[468][2] + P[473][2]) / 2;
      pousse(F.pontY, P[168][1] - ym); pousse(F.pontZ, P[168][2] - zm);
      const a = Math.abs(P[234][0]), b = Math.abs(P[454][0]);
      if (a + b > 1) pousse(F.asym, 100 * Math.abs(a - b) / (a + b));
    }
    if (ay >= YAW_OREILLE[0] && ay <= YAW_OREILLE[1]) {
      // Seule l'oreille la plus proche de la caméra est lue : l'autre est cachée par la joue.
      const prof = obs.profondeur || {};
      const proche = (prof[234] != null && prof[454] != null)
        ? (prof[234] < prof[454] ? 'droite' : 'gauche')
        : (obs.yaw < 0 ? 'droite' : 'gauche');
      const c = COTES[proche], S = session.oreille[proche];
      const oeil = P[c.oeil], ore = P[c.oreille];
      const ym = (P[468][1] + P[473][1]) / 2;
      pousse(S.d, dist(oeil, ore));            // la grandeur du mètre : coin externe de l'œil → oreille
      pousse(S.dz, oeil[2] - ore[2]);
      pousse(S.h, ore[1] - ym);
      pousse(S.yaw, ay); pousse(S.pitch, Math.abs(obs.pitch)); pousse(S.roll, Math.abs(obs.roll));
    }
  }

  // Rassemble plusieurs sessions d'un même client (futur balayage guidé).
  function fusionner(sessions) {
    const out = creerSession();
    for (const s of sessions || []) {
      if (!s) continue;
      out.face.n = Math.min(CAP, out.face.n + s.face.n);
      for (const k of Object.keys(out.face)) if (Array.isArray(out.face[k])) for (const v of s.face[k]) pousse(out.face[k], v);
      for (const cote of ['droite', 'gauche']) for (const k of Object.keys(out.oreille[cote])) for (const v of s.oreille[cote][k]) pousse(out.oreille[cote][k], v);
    }
    return out;
  }

  /* ── Résultat et confiance ────────────────────────────────────────── */

  // Médiane et confiance : la confiance vaut (assez d'échantillons) × (stabilité).
  // Stabilité = 1 − (dispersion robuste relative / limite) ; une mesure qui danse de plus
  // de `limite` d'elle-même n'est pas fiable.
  // `absolu` : pour les grandeurs proches de zéro (pont du nez, hauteur d'oreille, asymétrie),
  // la limite est une dispersion en unités de la mesure, pas une fraction d'elle-même.
  function sommaire(a, limite, nMin, nPlein, absolu) {
    if (!a || a.length < nMin) return null;
    const med = mediane(a), mad = mediane(a.map(x => Math.abs(x - med)));
    const sd = 1.4826 * mad, rel = absolu ? sd : (Math.abs(med) > 1e-6 ? sd / Math.abs(med) : 1);
    return { med, n: a.length, conf: arrondi(bornes(a.length / nPlein, 0, 1) * bornes(1 - rel / limite, 0, 1), 2) };
  }
  // Facteur de pose de face : la tête doit être droite pour mesurer des largeurs.
  const poseFace = (F) => {
    const p = mediane(F.pitch) ?? 0, r = mediane(F.roll) ?? 0;
    return (p > 15 || r > 12) ? 0.6 : 1;
  };

  function resultat(session) {
    const r = {}, F = session && session.face;
    if (!session) return r;
    r.n_front = F.n;
    r.measure_yaw_front_deg = arrondi(mediane(F.yaw), 1);
    r.measure_pitch_front_deg = arrondi(mediane(F.pitch), 1);
    r.measure_roll_front_deg = arrondi(mediane(F.roll), 1);
    const pf = poseFace(F);
    const mm = (nom, a, limite, cle) => {
      const s = sommaire(a, limite, 15, 40); if (!s) return;
      r[nom + '_mm'] = arrondi(s.med * 10, 1);
      if (cle) r[cle] = arrondi(s.conf * pf, 2);
    };
    mm('face_width', F.largeur, 0.04, 'face_width_confidence');
    mm('face_height', F.hauteur, 0.05, 'face_height_confidence');
    mm('temple_width', F.tempes, 0.05, 'temple_width_confidence');
    mm('temple_half_right', F.tempeD, 0.06);
    mm('temple_half_left', F.tempeG, 0.06);
    mm('nose_width', F.nez, 0.08, 'nose_width_confidence');
    mm('ipd_head', F.ipd, 0.03, 'ipd_head_confidence');
    mm('nose_bridge_width', F.pontL, 0.06, 'nose_bridge_width_confidence');
    // Hauteur des pupilles dans le repère de la tête : base de l'alignement monture/pupilles.
    // Dispersion jugée en absolu (limite 3 mm), la valeur n'étant pas proche de zéro par construction.
    const ey = sommaire(F.pupY, 0.30, 15, 40, true);
    if (ey) { r.eye_position_y_mm = arrondi(ey.med * 10, 1); r.eye_position_confidence = arrondi(ey.conf * pf, 2); }
    // Le pont du nez : hauteur et avancée par rapport à la ligne des pupilles. Valeurs
    // petites, donc la dispersion est jugée en millimètres absolus, pas relatifs.
    const pY = sommaire(F.pontY, 0.30, 15, 40, true), pZ = sommaire(F.pontZ, 0.30, 15, 40, true);   // dispersion limite : 3 mm
    if (pY) r.nose_bridge_y_mm = arrondi(pY.med * 10, 1);
    if (pZ) r.nose_bridge_z_mm = arrondi(pZ.med * 10, 1);
    if (pY && pZ) r.nose_bridge_confidence = arrondi(Math.min(pY.conf, pZ.conf) * pf, 2);
    const as = sommaire(F.asym, 5, 15, 40, true); if (as) r.asym_pct = arrondi(as.med, 1);

    // Oreilles : chaque côté séparément, à partir des seules vues où il est le plus proche.
    for (const cote of ['droite', 'gauche']) {
      const S = session.oreille[cote], sfx = cote === 'droite' ? 'right' : 'left';
      r['n_ear_' + sfx] = S.d.length;
      const d = sommaire(S.d, 0.06, 20, 40);
      if (!d) { r['ear_depth_usable_' + sfx] = 0; continue; }
      const yawMed = mediane(S.yaw), p = mediane(S.pitch) ?? 0, ro = mediane(S.roll) ?? 0;
      // Au-delà de ~32° de lacet le repère de contour glisse sur la joue : la confiance baisse
      // jusqu'à zéro à 40°. Une tête penchée ou inclinée la réduit aussi.
      const yawF = yawMed <= YAW_OREILLE_IDEAL ? 1 : bornes((YAW_OREILLE[1] - yawMed) / (YAW_OREILLE[1] - YAW_OREILLE_IDEAL), 0, 1);
      const poseF = (p > 20 || ro > 15) ? 0.5 : 1;
      const conf = arrondi(d.conf * yawF * poseF, 2);
      r['ear_depth_estimated_' + sfx] = arrondi(d.med * 10, 1);
      r['ear_depth_confidence_' + sfx] = conf;
      r['ear_depth_usable_' + sfx] = conf >= 0.6 ? 1 : 0;       // « exploitable » : seuil volontairement strict
      r['ear_yaw_' + sfx + '_deg'] = arrondi(yawMed, 1);
      const dz = sommaire(S.dz, 0.10, 20, 40); if (dz) r['ear_dz_' + sfx + '_mm'] = arrondi(dz.med * 10, 1);
      const h = sommaire(S.h, 0.40, 20, 40, true);       // dispersion limite : 4 mm
      if (h && h.conf >= 0.5) r['ear_height_' + sfx + '_mm'] = arrondi(h.med * 10, 1);
    }
    return r;
  }

  return { POINTS, COTES, BALAYAGE_GUIDE, YAW_OREILLE, observation, observer, fusionner, resultat, creerSession, inverseAffine, anglesDepuisMatrice };
});
