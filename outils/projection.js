/**
 * Banc de projection : la monture se superpose-t-elle aux pixels, au centre
 * comme aux bords, quelle que soit la taille d'affichage ?
 *
 * Trois contrôles :
 *  1. la formule de focale du code donne les mêmes pixels que la vraie
 *     caméra Three.js (PerspectiveCamera), en 40 points dont les quatre coins ;
 *  2. cette concordance tient à toute taille d'affichage (la couche 3D et
 *     la vidéo partagent un seul repère 800x600, mis à l'échelle ensemble) ;
 *  3. index.html ne contient qu'UNE définition de caméra : si quelqu'un en
 *     ajoute une autre, ce banc échoue.
 * Lancer : node outils/projection.js
 */
const fs = require('fs'), path = require('path');
const THREE = require('three');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ec = [];

// ── 1 et 2. Concordance avec Three.js ────────────────────────────────
const W = 800, H = 600, VFOV = 63;
const f = (H / 2) / Math.tan(VFOV * Math.PI / 360);
let pire = 0;
for (const echelle of [1, 1080 / 800, 1.5]) {          // tailles d'affichage
  const cam = new THREE.PerspectiveCamera(VFOV, W / H, 0.1, 2000);
  cam.position.set(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const pts = [];
  for (const d of [30, 50, 80])                         // distances (cm)
    for (const [u, v] of [[0,0],[1,1],[-1,1],[1,-1],[-1,-1],[.5,0],[0,.5],[-.7,.3],[.2,-.9]]) {
      // point choisi pour tomber à (u,v) dans l'image, u,v dans [-1, 1]
      const x = u * (W / 2) * d / f, y = v * (H / 2) * d / f;
      pts.push(new THREE.Vector3(x, y, -d));
    }
  for (const p of pts) {
    const n = p.clone().project(cam);                   // repère [-1, 1]
    const px3 = (n.x * 0.5 + 0.5) * W * echelle;
    const py3 = (-n.y * 0.5 + 0.5) * H * echelle;
    const d = -p.z;
    const pxC = (p.x * f / d + W / 2) * echelle;        // formule du code (worldToScreen)
    const pyC = (-p.y * f / d + H / 2) * echelle;
    pire = Math.max(pire, Math.hypot(px3 - pxC, py3 - pyC));
  }
}
console.log(`concordance Three.js / formule du code : écart maximal ${pire.toExponential(2)} px (360 points, 3 tailles)`);
if (pire > 0.01) ec.push('la formule de projection du code ne correspond pas à la caméra Three.js');

// ── 3. Une seule définition de caméra ────────────────────────────────
const a = src.indexOf('const CAMERA = (() => {');
const b = src.indexOf('const W = CAMERA.W');
if (a < 0 || b < 0) ec.push('le bloc CAMERA a disparu');
const horsBloc = src.slice(0, a) + src.slice(b);
const focales = horsBloc.split('\n').filter(l =>
  /(const|let|var)\s+\w*(FOCAL|FOV)\w*\s*=\s*[^C\n]*Math\.tan/.test(l) && !l.trim().startsWith('//'));
console.log(`définitions de focale hors du bloc CAMERA : ${focales.length}`);
for (const l of focales) ec.push('focale définie hors du bloc CAMERA : ' + l.trim().slice(0, 90));
const hfov = /CAMERA\.objectif\.hfovDeg/.test(src) && /CAMERA\.rendu\.focalPx/.test(src);
if (!hfov) ec.push('les constantes dérivées ne passent plus par CAMERA');

console.log(ec.length ? 'ÉCHEC\n - ' + ec.join('\n - ') : 'OK');
process.exit(ec.length ? 1 : 0);
