/**
 * Banc de la mesure de morphologie (morphologie.js) : des têtes simulées de dimensions
 * connues sont « photographiées » par une caméra simulée, de face puis de côté ; on
 * vérifie que les dimensions, la profondeur d'oreille et les scores de confiance sont
 * ceux qu'on attend, y compris quand la tête est trop tournée ou la mesure bruitée.
 *
 * Ce banc prouve le CALCUL, pas la précision de MediaPipe sur de vrais visages : celle-ci
 * se juge avec les mesures au mètre (outils/validation-oreille.js).
 * Lancer : node outils/morpho-banc.js
 */
const M = require('../morphologie.js');
const W = 640, H = 480, FOCALE = 500, PROF = 55;
let graine = 12345; const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647 - 0.5; };
const gauss = () => (alea() + alea() + alea() + alea()) * 1.73;      // ≈ N(0,1)

// Une tête : positions des repères dans le repère de la tête, en cm.
function tete(o = {}) {
  const ear = o.oreille ?? 3.0;            // oreille derrière le plan z=0
  return {
    234: [-7.4, 0, -ear], 454: [7.0, 0, -ear - 0.4], 127: [-6.6, 2.5, 0], 356: [6.6, 2.5, 0],
    168: [0, 2.8, 5.0], 129: [-1.8, -2.2, 5.2], 358: [1.8, -2.2, 5.2], 10: [0, 9.0, 2.0], 152: [0, -9.0, 2.5],
    468: [-3.2, 1.2, 3.6], 473: [3.2, 1.2, 3.6], 33: [-4.6, 1.2, 3.0], 263: [4.6, 1.2, 3.0],
  };
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Observation d'une tête de lacet donné par la caméra simulée, avec bruit en pixels.
function vue(T, yawDeg, { bruitPx = 0, bruitZ = 0, pitch = 0, roll = 0 } = {}) {
  const th = yawDeg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
  const p = pitch * Math.PI / 180, cp = Math.cos(p), sp = Math.sin(p), r = roll * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r);
  // R = Ry(yaw) · Rx(pitch) · Rz(roll), colonne-majeure (même ordre que le reste de N.O.A : YXZ)
  const Ry = [[c, 0, s], [0, 1, 0], [-s, 0, c]], Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]], Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]];
  const mul = (A, B) => A.map((_, i) => [0, 1, 2].map(j => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]));
  const R = mul(mul(Ry, Rx), Rz);
  const mat = [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, 0.3, 0.1, -PROF, 1];
  const lm = {}, kxy = PROF / FOCALE;
  for (const [i, q] of Object.entries(T)) {
    const X = [0, 1, 2].map(k => R[k][0] * q[0] + R[k][1] * q[1] + R[k][2] * q[2]);
    X[0] += 0.3; X[1] += 0.1; X[2] -= PROF;
    const zl = -X[2];
    lm[i] = { x: (X[0] * FOCALE / zl + gauss() * bruitPx) / W + 0.5, y: 0.5 - (X[1] * FOCALE / zl + gauss() * bruitPx) / H, z: (zl - PROF) / (W * kxy) + gauss() * bruitZ };
  }
  return M.observation(lm, mat, W, H, FOCALE);
}
function session(T, yaws, opts, reps = 30) {
  const S = M.creerSession();
  for (const y of yaws) for (let k = 0; k < reps; k++) M.observer(S, vue(T, y + (k % 3 - 1) * 0.6, opts));
  return S;
}

let ec = [];
const ok = (cond, msg) => { if (!cond) ec.push(msg); };
const proche = (a, b, tol, nom) => ok(a != null && Math.abs(a - b) <= tol, `${nom} : ${a} ≠ ${b} (±${tol})`);

// 1. Tête propre, face + deux trois-quarts : dimensions retrouvées au dixième de mm près.
{
  const T = tete(), r = M.resultat(session(T, [0, 1.5, -1.5, 24, -24], {}, 45));
  proche(r.face_width_mm, 144, 1, 'largeur'); proche(r.face_height_mm, 180, 1, 'hauteur');
  proche(r.temple_width_mm, 132, 1, 'tempes'); proche(r.nose_width_mm, 36, 1, 'nez');
  proche(r.nose_bridge_y_mm, 16, 1, 'pont y'); proche(r.nose_bridge_z_mm, 14, 1, 'pont z');
  // droite = côté du repère 234 (x<0 ici), gauche = 454
  proche(r.ear_depth_estimated_right, dist(T[33], T[234]) * 10, 1.5, 'oreille droite');
  proche(r.ear_depth_estimated_left, dist(T[263], T[454]) * 10, 1.5, 'oreille gauche');
  proche(r.ear_height_right_mm, -12, 1.5, 'hauteur oreille droite');
  ok(r.ear_depth_usable_right === 1 && r.ear_depth_usable_left === 1, 'oreilles exploitables en conditions propres');
  ok(r.face_width_confidence >= 0.9 && r.ear_depth_confidence_right >= 0.9, 'confiances élevées en conditions propres');
}
// 2. Plusieurs morphologies : l'estimation suit la vraie profondeur d'oreille.
{
  const lues = [2.0, 3.0, 4.2].map(e => { const T = tete({ oreille: e }); const r = M.resultat(session(T, [0, 24, -24])); return { vrai: dist(T[33], T[234]) * 10, lu: r.ear_depth_estimated_right }; });
  ok(lues[0].lu < lues[1].lu && lues[1].lu < lues[2].lu, 'l\'estimation doit croître avec la profondeur réelle');
  lues.forEach((l, i) => proche(l.lu, l.vrai, 1.5, 'morphologie ' + i));
}
// 3. Trop tourné : pas d'estimation d'oreille au-delà de 40°, confiance basse vers 38°.
{
  const T = tete();
  const r45 = M.resultat(session(T, [0, 45, -45]));
  ok(r45.ear_depth_estimated_right == null && r45.ear_depth_usable_right === 0, 'à 45° l\'oreille ne doit pas être estimée');
  const r38 = M.resultat(session(T, [0, 38, -38]));
  ok(r38.ear_depth_usable_right === 0 || r38.ear_depth_confidence_right < 0.6, 'à 38° la mesure doit être non exploitable');
}
// 4. Seulement de face : les largeurs oui, l'oreille non.
{
  const r = M.resultat(session(tete(), [0, 2, -2]));
  ok(r.face_width_mm != null && r.ear_depth_usable_left === 0 && r.ear_depth_usable_right === 0, 'sans vues de côté, pas d\'oreille exploitable');
}
// 5. Bruit : la confiance baisse quand les repères dansent.
{
  const T = tete(), propre = M.resultat(session(T, [0, 24, -24], { bruitPx: 0.3, bruitZ: 0.0005 }));
  const bruite = M.resultat(session(T, [0, 24, -24], { bruitPx: 3, bruitZ: 0.01 }));
  ok(bruite.face_width_confidence < propre.face_width_confidence, 'le bruit doit baisser la confiance de la largeur');
  ok(bruite.ear_depth_confidence_right < propre.ear_depth_confidence_right, 'le bruit doit baisser la confiance de l\'oreille');
  ok(bruite.ear_depth_usable_right === 0, 'une oreille très bruitée est non exploitable');
}
// 6. Tête inclinée : confiance de la largeur réduite.
{
  const droite = M.resultat(session(tete(), [0, 1, -1])), penchee = M.resultat(session(tete(), [0, 1, -1], { pitch: 22 }));
  ok(penchee.face_width_confidence < droite.face_width_confidence, 'une tête baissée doit baisser la confiance');
}
// 7. Fusion de plusieurs sessions d'un même client (futur balayage guidé).
{
  const T = tete(), A = session(T, [0, 1], {}, 12), B = session(T, [24], {}, 25), C = session(T, [-24], {}, 25);
  const seul = M.resultat(A), fusion = M.resultat(M.fusionner([A, B, C]));
  ok(seul.ear_depth_estimated_right == null, 'la vue de face seule ne donne pas d\'oreille');
  ok(fusion.ear_depth_estimated_right != null && fusion.ear_depth_estimated_left != null && fusion.n_front === 24, 'la fusion de trois vues doit donner les deux oreilles');
}
// 8. Le module ne touche à rien : aucune dépendance au DOM ni à Three.js.
ok(!/document\.|window\.|THREE/.test(require('fs').readFileSync(__dirname + '/../morphologie.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')), 'morphologie.js doit rester indépendant du DOM et de Three.js');

if (ec.length) { console.error('ÉCHEC\n - ' + ec.join('\n - ')); process.exit(1); }
console.log('MORPHO OK : dimensions, côtés séparés, confiance, angles limites, fusion');
