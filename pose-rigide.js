/**
 * N.O.A — Pose de la tête sur les points RIGIDES du visage seulement.
 *
 * MediaPipe calcule la pose de la tête avec tous ses points, bouche et mâchoire comprises : quand le client parle, rit
 * ou ouvre la bouche, la pose « glisse » (surtout en inclinaison et en hauteur) et la monture, posée sur cette pose,
 * monte et descend sur son visage. Ici on recalcule la pose avec les seuls points qui ne bougent pas avec les
 * expressions : front, arête du nez, coins des yeux, tempes.
 *
 * Principe, sans bibliothèque de têtes :
 *   1. APPRENTISSAGE (quelques dizaines d'images, bouche fermée) : chaque point rigide est exprimé dans le repère de la
 *      tête du client, par la pose de MediaPipe : c'est le modèle rigide DE CE CLIENT.
 *   2. SUIVI : à chaque image, on cherche la pose (6 degrés de liberté) qui projette ce modèle sur les points observés
 *      (moindres carrés robustes, quelques itérations de Levenberg-Marquardt), en partant de la pose de MediaPipe.
 * Sans modèle (début de séance, bouche jamais fermée), ou si le calcul diverge, on garde la pose de MediaPipe.
 *
 * Fonctionne dans le navigateur (window.NOAPose) et sous Node (banc de test).
 */
(function (racine, usine) {
  if (typeof module === 'object' && module.exports) module.exports = usine();
  else racine.NOAPose = usine();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Points rigides (indices MediaPipe) et poids. Aucun point de bouche, de mâchoire, de joue, de paupière ou de sourcil.
  const RIGIDES = [
    [10, 1.0], [151, 1.2], [9, 1.2], [8, 1.5],          // front
    [168, 2.0], [6, 2.0], [197, 1.5], [195, 1.2],        // arête du nez
    [133, 1.5], [362, 1.5], [33, 1.2], [263, 1.2],       // coins des yeux
    [130, 0.8], [359, 0.8], [226, 0.8], [446, 0.8],      // rebords orbitaires
    [127, 0.8], [356, 0.8], [162, 0.6], [389, 0.6],      // tempes
    [129, 0.8], [358, 0.8], [98, 0.6], [327, 0.6],       // ailes du nez (peu mobiles)
    [103, 0.9], [332, 0.9], [54, 0.7], [284, 0.7],       // front, de part et d'autre (os frontal)
    [109, 0.7], [338, 0.7], [67, 0.6], [297, 0.6],       // haut du front
    [21, 0.6], [251, 0.6],                               // tempes hautes
    [193, 1.0], [417, 1.0], [122, 0.8], [351, 0.8],      // racine du nez, côté des coins internes
  ];
  const NB_APPRENTISSAGE = 20;
  const LIM_ANGLE = 9, LIM_POS = 2.0, LIM_RMS = 2.0;            // écart maximal toléré avec la pose de MediaPipe
  const LIM_SAUT_ANGLE = 2.5, LIM_SAUT_POS = 0.8;               // variation maximale de la correction d'une image à l'autre
  const YAW_PLEIN = 18, YAW_NUL = 32;                           // degrés : pleine correction jusqu'à 18°, aucune à partir de 32°
  const BOUCHE_FERMEE_MAX = 0.035;     // écart des lèvres / hauteur du visage
  const YAW_APPRENTISSAGE_MAX = 25;    // degrés

  const mediane = a => { const t = [...a].sort((x, y) => x - y), m = t.length >> 1; return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2; };

  /* ── Algèbre 4x4 colonne-majeure, 3x3 ───────────────────────────── */
  function inverse(m) {
    const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
    const r = 1 / det;
    const i00 = A * r, i01 = -(b * i - c * h) * r, i02 = (b * f - c * e) * r, i10 = B * r, i11 = (a * i - c * g) * r, i12 = -(a * f - c * d) * r, i20 = C * r, i21 = -(a * h - b * g) * r, i22 = (a * e - b * d) * r;
    const tx = m[12], ty = m[13], tz = m[14];
    return [i00, i10, i20, 0, i01, i11, i21, 0, i02, i12, i22, 0, -(i00 * tx + i01 * ty + i02 * tz), -(i10 * tx + i11 * ty + i12 * tz), -(i20 * tx + i21 * ty + i22 * tz), 1];
  }
  const applique = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  function rotationVecteur(w) {   // Rodrigues → matrice 3x3 (colonne-majeure)
    const th = Math.hypot(w[0], w[1], w[2]);
    if (th < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const x = w[0] / th, y = w[1] / th, z = w[2] / th, c = Math.cos(th), s = Math.sin(th), k = 1 - c;
    return [c + x * x * k, y * x * k + z * s, z * x * k - y * s, x * y * k - z * s, c + y * y * k, z * y * k + x * s, x * z * k + y * s, y * z * k - x * s, c + z * z * k];
  }
  const mul3 = (A, B) => { const R = new Array(9); for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) R[j * 3 + i] = A[i] * B[j * 3] + A[3 + i] * B[j * 3 + 1] + A[6 + i] * B[j * 3 + 2]; return R; };
  function matrice4(R, t, echelle) {
    const s = echelle || 1;
    return [R[0] * s, R[1] * s, R[2] * s, 0, R[3] * s, R[4] * s, R[5] * s, 0, R[6] * s, R[7] * s, R[8] * s, 0, t[0], t[1], t[2], 1];
  }
  function orthonormer(m, s) {      // ramène la partie rotation à une rotation propre (Gram-Schmidt), échelle s conservée
    let a = [m[0], m[1], m[2]], b = [m[4], m[5], m[6]];
    const n = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    a = n(a); const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; b = n([b[0] - d * a[0], b[1] - d * a[1], b[2] - d * a[2]]);
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    return [a[0] * s, a[1] * s, a[2] * s, 0, b[0] * s, b[1] * s, b[2] * s, 0, c[0] * s, c[1] * s, c[2] * s, 0, m[12], m[13], m[14], 1];
  }
  const lacet = m => Math.atan2(m[8], m[10]) * 180 / Math.PI;

  /* ── Observation d'un point : pixel (repère centré, y vers le haut) et position 3D déprojetée ── */
  function pixel(L, W, H) { return [(L.x - 0.5) * W, -(L.y - 0.5) * H]; }
  function point3D(L, W, H, focale, prof) {   // profondeur propre au point : celle de la tête plus son z relatif
    const zl = prof + (L.z || 0) * W * (prof / focale), ks = zl / focale;
    return [(L.x - 0.5) * W * ks, -(L.y - 0.5) * H * ks, -zl];
  }

  function ouverture(lm) {
    if (!lm[13] || !lm[14] || !lm[10] || !lm[152]) return 1;
    const h = Math.abs(lm[10].y - lm[152].y);
    return h > 1e-4 ? Math.abs(lm[13].y - lm[14].y) / h : 1;
  }

  /** Une instance par client. */
  function creer() {
    let ech = [], modele = null, ecartPrec = null;
    const etat = { appris: 0, utilise: 0, repli: 0 };

    function apprendre(lm, M, W, H, focale) {
      if (modele) return;
      if (ouverture(lm) > BOUCHE_FERMEE_MAX || Math.abs(lacet(M)) > YAW_APPRENTISSAGE_MAX) return;
      const inv = inverse(M), prof = -M[14];
      if (!inv || !(prof > 15 && prof < 150)) return;
      const pts = [];
      for (const [i] of RIGIDES) { if (!lm[i]) return; pts.push(applique(inv, point3D(lm[i], W, H, focale, prof))); }
      ech.push(pts); etat.appris = ech.length;
      if (ech.length >= NB_APPRENTISSAGE) {
        modele = RIGIDES.map(([i, w], k) => ({ i, w, p: [0, 1, 2].map(a => mediane(ech.map(e => e[k][a]))) }));
        ech = [];
      }
    }

    /** Pose affinée ; renvoie la matrice de MediaPipe si le modèle n'existe pas encore ou si le calcul n'est pas fiable. */
    function affiner(lm, M, W, H, focale) {
      if (!modele) { apprendre(lm, M, W, H, focale); return M; }
      // état : rotation (vecteur) relative à M, translation absolue
      const s = Math.hypot(M[0], M[1], M[2]) || 1;
      const R0 = [M[0] / s, M[1] / s, M[2] / s, M[4] / s, M[5] / s, M[6] / s, M[8] / s, M[9] / s, M[10] / s];
      const obs = modele.map(m => ({ m, px: pixel(lm[m.i], W, H) }));
      if (obs.some(o => !lm[o.m.i])) return M;
      const t0 = [M[12], M[13], M[14]];
      let x = [0, 0, 0, t0[0], t0[1], t0[2]];
      const residus = (v) => {
        const R = mul3(rotationVecteur([v[0], v[1], v[2]]), R0), T = matrice4(R, [v[3], v[4], v[5]], s), r = [];
        for (const o of obs) {
          const q = applique(T, o.m.p), z = -q[2];
          if (!(z > 1)) return null;
          const e1 = focale * q[0] / z - o.px[0], e2 = focale * q[1] / z - o.px[1];
          // perte de Huber : un point aberrant ne tire pas la pose
          const hub = (e) => { const a = Math.abs(e), k = 3; return a <= k ? e : Math.sign(e) * Math.sqrt(2 * k * a - k * k); };
          r.push(hub(e1) * Math.sqrt(o.m.w), hub(e2) * Math.sqrt(o.m.w));
        }
        r.push((v[5] - t0[2]) * 1.5);                 // a priori faible sur la profondeur (échelle mal contrainte par la perspective)
        return r;
      };
      let r = residus(x); if (!r) return M;
      let cout = r.reduce((a, b) => a + b * b, 0), lambda = 1e-2;
      for (let it = 0; it < 6; it++) {
        const J = []; const pas = [1e-4, 1e-4, 1e-4, 1e-2, 1e-2, 1e-2];
        for (let k = 0; k < 6; k++) { const y = x.slice(); y[k] += pas[k]; const ry = residus(y); if (!ry) return M; J.push(ry.map((v, j) => (v - r[j]) / pas[k])); }
        const A = Array.from({ length: 6 }, () => new Array(6).fill(0)), g = new Array(6).fill(0);
        for (let a = 0; a < 6; a++) { for (let b = 0; b < 6; b++) { let q = 0; for (let j = 0; j < r.length; j++) q += J[a][j] * J[b][j]; A[a][b] = q; } let q = 0; for (let j = 0; j < r.length; j++) q += J[a][j] * r[j]; g[a] = q; }
        let ameliore = false;
        for (let essai = 0; essai < 4 && !ameliore; essai++) {
          const Ad = A.map((l, a) => l.map((v, b) => a === b ? v * (1 + lambda) + 1e-9 : v));
          const dx = resoudre(Ad, g.map(v => -v)); if (!dx) { lambda *= 10; continue; }
          const y = x.map((v, k) => v + dx[k]), ry = residus(y);
          if (ry) { const c = ry.reduce((a, b) => a + b * b, 0); if (c < cout) { x = y; r = ry; cout = c; lambda = Math.max(1e-6, lambda * 0.3); ameliore = true; } else lambda *= 10; } else lambda *= 10;
        }
        if (!ameliore) break;
      }
      // Garde-fous : un résultat très éloigné de MediaPipe est un échec du calcul, pas un geste.
      const R = mul3(rotationVecteur([x[0], x[1], x[2]]), R0);
      const ecartAngle = Math.hypot(x[0], x[1], x[2]) * 180 / Math.PI, ecartPos = Math.hypot(x[3] - t0[0], x[4] - t0[1], x[5] - t0[2]);
      const rms = Math.sqrt(cout / r.length);
      // La correction due à la bouche est PETITE (quelques degrés, un ou deux centimètres) : un écart plus grand est un
      // échec du calcul, pas un geste. Sans cela, la monture partait sur le front quand la tête tournait de côté.
      if (!(ecartAngle < LIM_ANGLE && ecartPos < LIM_POS && rms < LIM_RMS)) { etat.repli++; ecartPrec = null; return M; }
      // Cohérence dans le temps : la correction varie doucement (la bouche s'ouvre sur plusieurs images).
      const d = [x[0], x[1], x[2], x[3] - t0[0], x[4] - t0[1], x[5] - t0[2]];
      if (ecartPrec && (Math.hypot(d[0] - ecartPrec[0], d[1] - ecartPrec[1], d[2] - ecartPrec[2]) * 180 / Math.PI > LIM_SAUT_ANGLE
          || Math.hypot(d[3] - ecartPrec[3], d[4] - ecartPrec[4], d[5] - ecartPrec[5]) > LIM_SAUT_POS)) { etat.repli++; ecartPrec = null; return M; }
      ecartPrec = d;
      // Fondu selon le lacet : de face le recalcul est fiable, de profil la moitié du visage est cachée et ses points
      // sont devinés par MediaPipe : on rend la main à MediaPipe, progressivement.
      const ay = Math.abs(lacet(M)), w = ay <= YAW_PLEIN ? 1 : ay >= YAW_NUL ? 0 : (YAW_NUL - ay) / (YAW_NUL - YAW_PLEIN);
      if (w <= 0) { etat.repli++; return M; }
      etat.utilise++;
      const Mr = matrice4(R, [x[3], x[4], x[5]], s);
      if (w >= 1) return Mr;
      const out = M.slice();                                   // mélange M → Mr : rotation par interpolation de matrices puis re-orthonormalisation
      for (const k of [0, 1, 2, 4, 5, 6, 8, 9, 10]) out[k] = M[k] * (1 - w) + Mr[k] * w;
      for (const k of [12, 13, 14]) out[k] = M[k] * (1 - w) + Mr[k] * w;
      return orthonormer(out, s);
    }
    return { affiner, etat, pret: () => !!modele, raz: () => { ech = []; modele = null; ecartPrec = null; etat.appris = etat.utilise = etat.repli = 0; } };
  }

  function resoudre(A, b) {   // élimination de Gauss avec pivot
    const n = b.length, M = A.map((l, i) => [...l, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-14) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) { let q = M[r][n]; for (let k = r + 1; k < n; k++) q -= M[r][k] * x[k]; x[r] = q / M[r][r]; }
    return x;
  }

  return { RIGIDES, creer, ouverture, inverse, applique, rotationVecteur, matrice4 };
});
