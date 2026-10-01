/**
 * Valide un modèle de monture AVANT de l'ajouter au catalogue.
 *
 *   node outils/valider-monture.js 3dmodel/cube/model.glb [--marquage 49-20-140]
 *
 * Il lit le fichier GLB sans le dessiner et vérifie ce qu'une erreur de
 * livraison rend invisible jusqu'au jour où un client essaie la monture :
 * l'unité, la taille, la symétrie, la présence de verres, les extensions
 * obsolètes, le poids des textures. Avec --marquage (largeur de verre, pont,
 * branche, en mm : le chiffre gravé sur la monture), il compare le modèle à
 * la monture réelle. C'est ainsi qu'on a trouvé que la monture Cube avait
 * une face 25 % trop grande pour ses branches.
 * Sortie 0 si aucune erreur, 1 sinon. Les avertissements ne bloquent pas.
 */
const fs = require('fs');
const THREE = require('three');

const fichier = process.argv[2];
if (!fichier) { console.error('usage : node outils/valider-monture.js modele.glb [--marquage 49-20-140]'); process.exit(2); }
const iM = process.argv.indexOf('--marquage');
const marquage = iM > 0 ? process.argv[iM + 1].split('-').map(Number) : null;

const err = [], avert = [], info = [];
const buf = fs.readFileSync(fichier);
if (buf.readUInt32LE(0) !== 0x46546C67) { console.error('ce n\'est pas un GLB'); process.exit(1); }
const lgJson = buf.readUInt32LE(12);
const g = JSON.parse(buf.slice(20, 20 + lgJson).toString('utf8'));
info.push(`fichier : ${(buf.length / 1048576).toFixed(1)} Mo · ${g.meshes?.length || 0} maillages · ${g.materials?.length || 0} matériaux · ${g.images?.length || 0} images`);

// Boîtes englobantes dans le monde, par maillage (accessors POSITION min/max).
const nodes = g.nodes || [];
const local = n => {
  const m = new THREE.Matrix4();
  if (n.matrix) return m.fromArray(n.matrix);
  return m.compose(new THREE.Vector3(...(n.translation || [0, 0, 0])),
                   new THREE.Quaternion(...(n.rotation || [0, 0, 0, 1])),
                   new THREE.Vector3(...(n.scale || [1, 1, 1])));
};
const boites = [];                            // { nom, box }
const parcourir = (i, parent) => {
  const n = nodes[i], M = parent.clone().multiply(local(n));
  if (n.mesh != null) {
    const mesh = g.meshes[n.mesh], box = new THREE.Box3();
    for (const p of mesh.primitives) {
      const a = g.accessors[p.attributes.POSITION];
      if (!a || !a.min || !a.max) continue;
      box.union(new THREE.Box3(new THREE.Vector3(...a.min), new THREE.Vector3(...a.max)).applyMatrix4(M));
    }
    if (!box.isEmpty()) boites.push({ nom: n.name || mesh.name || ('maillage' + n.mesh), box });
  }
  (n.children || []).forEach(c => parcourir(c, M));
};
const racines = g.scenes?.[g.scene || 0]?.nodes || [];
racines.forEach(r => parcourir(r, new THREE.Matrix4()));
if (!boites.length) { console.error('aucune géométrie lisible'); process.exit(1); }

const tout = new THREE.Box3(); boites.forEach(b => tout.union(b.box));
const T = tout.getSize(new THREE.Vector3());
// Unité : une monture adulte fait 11 à 16 cm de large.
const grand = Math.max(T.x, T.y, T.z);
let unite = null, facteurMm = null;
if (grand > 0.05 && grand < 0.3) { unite = 'mètres'; facteurMm = 1000; }
else if (grand > 5 && grand < 30) { unite = 'centimètres'; facteurMm = 10; }
else if (grand > 50 && grand < 300) { unite = 'millimètres'; facteurMm = 1; }
if (!unite) err.push(`unité indéterminable : plus grande dimension ${grand.toFixed(3)}`);
else info.push(`unité probable : ${unite} (plus grande dimension ${grand.toFixed(2)})`);
if (facteurMm) {
  const [x, y, z] = [T.x, T.y, T.z].map(v => v * facteurMm);
  info.push(`dimensions : largeur ${x.toFixed(1)} mm · hauteur ${y.toFixed(1)} mm · profondeur (branches) ${z.toFixed(1)} mm`);
  if (x < 110 || x > 165) avert.push(`largeur de face ${x.toFixed(0)} mm hors de la plage usuelle 110-165`);
  if (z < 110 || z > 160) avert.push(`longueur de branche ${z.toFixed(0)} mm hors de la plage usuelle 110-160`);
  if (y > x * 0.6) avert.push('hauteur très grande par rapport à la largeur : orientation à vérifier');
  // Symétrie gauche/droite autour de x = 0 : un modèle décentré se décale sur le visage.
  const centre = (tout.min.x + tout.max.x) / 2 * facteurMm;
  if (Math.abs(centre) > 3) err.push(`modèle décentré de ${centre.toFixed(1)} mm : l'origine doit être au milieu du pont`);
  else info.push(`centrage gauche/droite : ${centre.toFixed(1)} mm`);
  // Verres
  const verres = boites.filter(b => /lens|verre|glass/i.test(b.nom) && !/frame|rim/i.test(b.nom));
  if (verres.length < 2) avert.push('moins de deux maillages nommés « lens / verre » : teinte et reflets des verres impossibles');
  else {
    const gx = verres.map(v => v.box.getSize(new THREE.Vector3()).x * facteurMm);
    const lv = Math.max(...gx);
    const tri = [...verres].sort((a, b) => a.box.min.x - b.box.min.x);
    const pont = (tri[tri.length - 1].box.min.x - tri[0].box.max.x) * facteurMm;
    info.push(`verre mesuré : ${lv.toFixed(1)} mm · pont entre verres : ${pont.toFixed(1)} mm`);
    if (marquage) {
      const [lm, pm, bm] = marquage;
      const e = (a, b) => Math.abs(a - b) / b * 100;
      info.push(`marquage ${marquage.join('-')} : écart verre ${e(lv, lm).toFixed(0)} %, pont ${e(pont, pm).toFixed(0)} %, branche ${e(z, bm).toFixed(0)} %`);
      if (e(lv, lm) > 8) avert.push(`le verre mesure ${lv.toFixed(1)} mm pour ${lm} annoncés : face à remettre à l'échelle`);
      if (e(z, bm) > 8) avert.push(`la branche mesure ${z.toFixed(1)} mm pour ${bm} annoncés`);
    }
  }
}
// Matériaux et fichier
if ((g.extensionsUsed || []).includes('KHR_materials_pbrSpecularGlossiness'))
  avert.push('extension KHR_materials_pbrSpecularGlossiness : obsolète, Three.js l\'ignore (couleurs possiblement fausses)');
if (buf.length > 25 * 1048576) avert.push('fichier de plus de 25 Mo : chargement lent sur une borne');
if (!(g.images || []).length) avert.push('aucune texture : monture en couleurs unies');
if ((g.cameras || []).length) avert.push('le fichier contient des caméras (Sketchfab ?) : elles sont ignorées');
if ((g.extensionsUsed || []).includes('KHR_draco_mesh_compression')) info.push('géométrie compressée Draco');

console.log(`\n${fichier}`);
info.forEach(l => console.log('  ' + l));
avert.forEach(l => console.log('  ⚠ ' + l));
err.forEach(l => console.log('  ✗ ' + l));
console.log(err.length ? '  → REFUSÉ' : avert.length ? '  → acceptable, avec réserves' : '  → OK');
process.exit(err.length ? 1 : 0);
