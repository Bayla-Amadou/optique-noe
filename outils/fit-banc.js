/**
 * Banc du moteur de fitting (fit.js) : le pipeline repères → profil du client → dimensions réelles
 * de la monture → correction, sans aucune bibliothèque de têtes.
 *   • les dimensions physiques des montures sont contrôlées ;
 *   • le profil ne contient que des mesures fiables, et chaque client a le sien ;
 *   • la profondeur d'oreille reste expérimentale (jamais dans les mesures du fitting) ;
 *   • la correction de hauteur suit la hauteur des pupilles de CHAQUE client, bornée.
 * Lancer : node outils/fit-banc.js
 */
const M = require('../morphologie.js'), F = require('../fit.js');
const fs = require('fs');
const W = 640, H = 480, FOCALE = 500, PROF = 55;
let graine = 777; const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647 - 0.5; };
const gauss = () => (alea() + alea() + alea() + alea()) * 1.73;

// Un client : dimensions propres. Rien n'est tiré d'une bibliothèque.
function client(o = {}) {
  const e = o.yeux ?? 1.2, l = o.largeur ?? 7.2, t = o.tempes ?? 6.6, z = o.oreille ?? 3.0;
  return {
    234: [-l, 0, -z], 454: [l - 0.4, 0, -z - 0.4], 127: [-t, 2.5, 0], 356: [t, 2.5, 0], 168: [0, 2.8, 5.0], 129: [-1.8, -2.2, 5.2], 358: [1.8, -2.2, 5.2],
    10: [0, 9.0, 2.0], 152: [0, -9.0, 2.5], 468: [-3.2, e, 3.6], 473: [3.2, e, 3.6], 33: [-4.6, e, 3.0], 263: [4.6, e, 3.0], 133: [-1.6, e, 3.8], 362: [1.6, e, 3.8],
  };
}
function vue(T, yawDeg, bruit = 0) {
  const th = yawDeg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th);
  const R = [[c, 0, s], [0, 1, 0], [-s, 0, c]];
  const mat = [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, 0.3, 0.1, -PROF, 1];
  const lm = {}, kxy = PROF / FOCALE;
  for (const [i, q] of Object.entries(T)) {
    const X = [0, 1, 2].map(k => R[k][0] * q[0] + R[k][1] * q[1] + R[k][2] * q[2]); X[0] += 0.3; X[1] += 0.1; X[2] -= PROF;
    const zl = -X[2];
    lm[i] = { x: (X[0] * FOCALE / zl + gauss() * bruit) / W + 0.5, y: 0.5 - (X[1] * FOCALE / zl + gauss() * bruit) / H, z: (zl - PROF) / (W * kxy) };
  }
  return M.observation(lm, mat, W, H, FOCALE);
}
function profilDe(T, bruit = 0, yaws = [0, 1.5, -1.5, 24, -24]) {
  const S = M.creerSession();
  for (const y of yaws) for (let k = 0; k < 45; k++) M.observer(S, vue(T, y + (k % 3 - 1) * 0.6, bruit));
  return F.profilUtilisateur(M.resultat(S), { yaw: 3, pitch: 1 });
}

const ec = []; const ok = (c, m) => { if (!c) ec.push(m); };
const proche = (a, b, tol, nom) => ok(a != null && Math.abs(a - b) <= tol, `${nom} : ${a} ≠ ${b} (±${tol})`);

// 1. Dimensions physiques des montures
const cube = { lensWidth: 49, bridge: 20, templeLength: 140, frameWidth: 135, lensHeight: 38 };
{
  const v = F.validerSpecs(cube);
  ok(v.ok && v.specs.bridgeWidth === 20, 'la monture Cube doit être valide (bridge accepté comme bridgeWidth)');
  ok(F.validerSpecs({ lensWidth: 49, frameWidth: 135 }).manque.join() === 'bridgeWidth,lensHeight,templeLength', 'les dimensions manquantes doivent être listées');
  ok(F.validerSpecs({ ...cube, templeLength: 14 }).hors.length === 1, 'une longueur de branche de 14 mm doit être refusée');
  const e = F.echelle({ lensWidth: 6.07, templeLength: 13.09, frameWidth: 16.69 }, v.specs);
  proche(e.sc, 0.807, 0.002, 'échelle de face'); proche(e.scZ, 1.0695, 0.002, 'échelle des branches');
  // Le catalogue réel de index.html déclare les cinq dimensions
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  const m = html.match(/mm:\s*\{([^}]*)\}/);
  const decl = m ? Object.fromEntries(m[1].split(',').map(x => x.split(':').map(y => y.trim())).filter(x => x.length === 2).map(([k, v]) => [k, +v])) : {};
  ok(F.validerSpecs(decl).ok, 'les dimensions déclarées dans le catalogue (index.html) doivent être complètes : ' + JSON.stringify(F.validerSpecs(decl).manque));
}

// 2. Profil : chaque client a le sien, uniquement des mesures fiables
const A = profilDe(client()), B = profilDe(client({ largeur: 7.8, tempes: 7.0, yeux: 1.6 })), C = profilDe(client({ largeur: 6.6, tempes: 6.0, yeux: 0.9 }));
{
  ok(A.complet && B.complet && C.complet, 'un profil de face + côtés doit être complet');
  proche(A.faceWidth, 146 - 4, 6, 'largeur A'); ok(B.faceWidth > A.faceWidth && A.faceWidth > C.faceWidth, 'les largeurs doivent suivre les trois clients');
  ok(B.eyePosition > A.eyePosition && A.eyePosition > C.eyePosition, 'la hauteur des pupilles doit suivre les trois clients');
  proche(A.IPD, 64, 1, 'IPD'); proche(A.noseBridgeWidth, 32, 1, 'largeur du pont');
  ok(A.yaw === 3 && A.pitch === 1, 'le profil porte le lacet et le tangage');
  // zéro bibliothèque : ni nom de tête ni fichier de morphologie dans les clés
  ok(!JSON.stringify(Object.keys(A)).match(/morpholog|H\d\d|head|tete_ref/i), 'aucune référence à une bibliothèque de têtes');
  // la profondeur d'oreille est expérimentale et rangée à part
  ok(A.experimental && A.experimental.earDepthRight != null && !('earDepth' in A), 'la profondeur d\'oreille reste dans `experimental`');
}
// 3. Une mesure douteuse est absente, pas devinée
{
  const bruite = profilDe(client(), 4);
  const absentes = ['faceWidth', 'templeWidth', 'eyePosition', 'noseBridgeWidth'].filter(k => bruite[k] == null);
  ok(absentes.length >= 1, 'un bruit fort doit faire disparaître des mesures du profil');
  const seulFace = profilDe(client(), 0, [0, 1, -1]);
  ok(seulFace.faceWidth != null && seulFace.experimental.earDepthUsableRight === false, 'de face seulement : largeurs présentes, oreille non exploitable');
}
// 4. Hauteur de monture : différentielle, suit les pupilles de chaque client, bornée
{
  const specs = F.validerSpecs(cube).specs, geo = { ancreY_cm: 2.47, decalageY_cm: -0.6, centreVerreY_cm: 0.41 };
  const ref = { refPupilles_mm: A.eyePosition };           // le client A est celui dont le placement a été validé
  const rA = F.ajuster(A, specs, geo, ref), rB = F.ajuster(B, specs, geo, ref), rC = F.ajuster(C, specs, geo, ref);
  proche(rA.dy_mm, 0, 0.01, 'client de référence : aucune correction'); ok(rA.appliquer, 'A : applicable');
  ok(rB.dy_mm > 0 && rC.dy_mm < 0, 'des pupilles plus hautes (resp. basses) que la référence doivent monter (resp. descendre) la monture');
  proche(rB.dy_mm, Math.min(3, B.eyePosition - A.eyePosition), 0.01, 'B : correction = écart de pupilles, bornée');
  ok(Math.abs(rB.dy_mm) <= 3 && Math.abs(rC.dy_mm) <= 3, 'la correction est bornée à ±3 mm');
  const fort = F.ajuster({ ...A, eyePosition: A.eyePosition + 9 }, specs, geo, ref);
  ok(fort.dy_mm === 3 && fort.raisons.length === 1, 'un écart de 9 mm est limité à 3 mm et signalé');
  const sansRef = F.ajuster(A, specs, geo);
  ok(!sansRef.appliquer && sansRef.dy_mm === 0 && sansRef.brut_mm != null, 'sans référence calibrée : aucune correction, écart absolu fourni pour la collecte');
  const sans = F.ajuster({ ...A, eyePosition: undefined }, specs, geo, ref);
  ok(!sans.appliquer && sans.dy_mm === 0, 'sans hauteur de pupilles fiable : aucune correction');
  ok(['etroite', 'ajustee', 'large'].includes(rA.largeur.jugement), 'la largeur de la monture est jugée contre les tempes');
}
if (ec.length) { console.error('ÉCHEC\n - ' + ec.join('\n - ')); process.exit(1); }
console.log('FIT OK : dimensions des montures, profil individuel sans bibliothèque, hauteur suivant chaque client, oreille expérimentale');
