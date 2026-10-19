/**
 * Banc de la pose sur points rigides (pose-rigide.js) : une tête simulée parle (la bouche s'ouvre et se ferme) et tourne.
 * La « pose de MediaPipe » simulée est faussée par la bouche, comme on l'observe sur de vrais visages : inclinaison et
 * hauteur qui glissent quand la mâchoire bouge. On mesure l'écart, en pixels, entre la position affichée d'un point
 * de la monture et sa vraie position, avec et sans le recalcul sur les points rigides.
 * Lancer : node outils/pose-rigide-banc.js
 */
const P = require('../pose-rigide.js');
const W = 640, H = 480, FOCALE = 500, PROF = 55;
let g = 99; const al = () => { g = (g * 16807) % 2147483647; return g / 2147483647 - 0.5; };
const gauss = () => (al() + al() + al() + al()) * 1.73;

// Tête (cm, repère de la tête, y vers le haut, z vers l'avant)
const TETE = {};
const rigide = { 10: [0, 9, 2], 151: [0, 7.5, 3], 9: [0, 5.5, 4.2], 8: [0, 4.2, 4.8], 168: [0, 2.8, 5.0], 6: [0, 1.6, 5.4], 197: [0, 0.2, 6.0], 195: [0, -0.8, 6.3],
  133: [-1.6, 1.2, 3.8], 362: [1.6, 1.2, 3.8], 33: [-4.6, 1.2, 3.0], 263: [4.6, 1.2, 3.0], 130: [-5.0, 1.0, 2.4], 359: [5.0, 1.0, 2.4], 226: [-4.4, 1.6, 3.4], 446: [4.4, 1.6, 3.4],
  127: [-6.6, 2.5, 0], 356: [6.6, 2.5, 0], 162: [-6.2, 4.5, 0.4], 389: [6.2, 4.5, 0.4], 129: [-1.8, -2.2, 5.2], 358: [1.8, -2.2, 5.2], 98: [-1.2, -2.4, 4.9], 327: [1.2, -2.4, 4.9] };
Object.assign(TETE, rigide);
const levres = (o) => ({ 13: [0, -5.2 + o * 0.0, 4.6], 14: [0, -5.2 - o * 1.4, 4.6], 152: [0, -9.0 - o * 1.4, 2.5] });
const LENTILLE = [3.2, 1.0, 3.6];   // centre d'un verre (repère de la tête)

const Rx = a => [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)];
const Ry = a => [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)];
const mul3 = (A, B) => { const R = new Array(9); for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) R[j * 3 + i] = A[i] * B[j * 3] + A[3 + i] * B[j * 3 + 1] + A[6 + i] * B[j * 3 + 2]; return R; };
const M4 = (R, t) => [R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, t[0], t[1], t[2], 1];
const proj = (M, p) => { const q = P.applique(M, p), z = -q[2]; return [FOCALE * q[0] / z, FOCALE * q[1] / z]; };

function image(MVrai, ouverte, bruitPx) {
  const lm = {}, kxy = PROF / FOCALE, pts = { ...TETE, ...levres(ouverte) };
  for (const [i, p] of Object.entries(pts)) {
    const q = P.applique(MVrai, p), zl = -q[2];
    lm[i] = { x: (FOCALE * q[0] / zl + gauss() * bruitPx) / W + 0.5, y: 0.5 - (FOCALE * q[1] / zl + gauss() * bruitPx) / H, z: (zl - PROF) / (W * kxy) };
  }
  return lm;
}
// Pose « MediaPipe » faussée par la bouche : inclinaison en plus et hauteur qui glisse, plus un peu de bruit
function faussee(R, t, ouverte) {
  const b = Rx(ouverte * 7 * Math.PI / 180 + gauss() * 0.004);
  return M4(mul3(R, b), [t[0] + gauss() * 0.03, t[1] - ouverte * 0.7 + gauss() * 0.03, t[2] + gauss() * 0.1]);
}

const brut = [], affine = [], ouvertures = [];
const tracker = P.creer();
for (let i = 0; i < 360; i++) {
  const t = i / 30;
  const yaw = 14 * Math.sin(t * 0.9), pitch = 5 * Math.sin(t * 0.55 + 1);
  const ouverte = t < 1.2 ? 0 : Math.max(0, Math.sin((t - 1.2) * 7)) * (t > 3 ? 1 : 0.0) + (t > 3 ? 0 : 0);   // bouche fermée au début, puis elle parle
  const R = mul3(Ry(yaw * Math.PI / 180), Rx(pitch * Math.PI / 180)), tr = [0.3 + 0.5 * Math.sin(t * 0.7), 0.1, -PROF];
  const MV = M4(R, tr), lm = image(MV, ouverte, 0.35);
  const Mg = faussee(R, tr, ouverte), Ma = tracker.affiner(lm, Mg, W, H, FOCALE);
  if (i < 60) continue;                                   // apprentissage
  const vrai = proj(MV, LENTILLE), eb = proj(Mg, LENTILLE), ea = proj(Ma, LENTILLE);
  brut.push(Math.hypot(eb[0] - vrai[0], eb[1] - vrai[1])); affine.push(Math.hypot(ea[0] - vrai[0], ea[1] - vrai[1])); ouvertures.push(ouverte);
}
const moy = a => a.reduce((s, x) => s + x, 0) / a.length, p95 = a => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)];
const parle = (a) => a.filter((_, k) => ouvertures[k] > 0.3), calme = (a) => a.filter((_, k) => ouvertures[k] <= 0.05);
console.log(`modèle appris : ${tracker.pret()} · images affinées ${tracker.etat.utilise}, repli sur MediaPipe ${tracker.etat.repli}`);
console.log('écart de la monture à sa vraie position (px)       moyenne    95 %     pire');
for (const [nom, a, b] of [['bouche fermée', calme(brut), calme(affine)], ['quand il parle', parle(brut), parle(affine)], ['toute la séance', brut, affine]])
  console.log(`  ${nom.padEnd(16)} MediaPipe seul   ${moy(a).toFixed(2).padStart(7)} ${p95(a).toFixed(2).padStart(8)} ${Math.max(...a).toFixed(2).padStart(8)}\n  ${''.padEnd(16)} points rigides   ${moy(b).toFixed(2).padStart(7)} ${p95(b).toFixed(2).padStart(8)} ${Math.max(...b).toFixed(2).padStart(8)}`);
const ok = tracker.pret() && moy(parle(affine)) < 0.5 * moy(parle(brut)) && moy(calme(affine)) < 1.5 * moy(calme(brut)) + 0.3 && tracker.etat.utilise > 200;
console.log(ok ? 'POSE RIGIDE OK : la bouche ne déplace plus la monture' : 'POSE RIGIDE ÉCHEC');
process.exit(ok ? 0 : 1);
