/**
 * Une monture tient-elle sur chaque tête de référence ? Trois questions
 * géométriques, sans rien dessiner :
 *   1. LARGEUR : la face est-elle plus large que la tête à la hauteur des
 *      tempes, à la profondeur de la charnière ? Sinon la monture pince.
 *   2. ÉCARTEMENT : de combien les branches doivent-elles s'ouvrir pour
 *      rejoindre le repos d'oreille ?
 *   3. LONGUEUR : la branche est-elle assez longue pour atteindre l'oreille ?
 *
 * Hypothèses, à corriger si on les connaît mieux (elles sont en tête du fichier) :
 *   la charnière est à PROF_CHARNIERE mm derrière le plan des pupilles.
 * Lancer : node outils/ajustement-montures.js   (têtes de corrige/)
 */
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', '3dmodel', 'morphologies', 'corrige');
const PROF_CHARNIERE = [10, 20];       // mm derrière les pupilles : bornes plausibles
const MONTURES = [{ nom: 'Cube 49-20-140', largeur: 135, branche: 140 }];
function sommets(base) {
  const b = fs.readFileSync(base + '.glb'), L = b.readUInt32LE(12), g = JSON.parse(b.slice(20, 20 + L)), bin = b.slice(20 + L + 8);
  const m = JSON.parse(fs.readFileSync(base + '_measurements.json', 'utf8')), l = m.landmarks_mm;
  const nd = g.nodes.find(n => n.mesh != null && !l[n.name] && !/GEOMETRY/.test(n.name));
  const p = g.meshes[nd.mesh].primitives[0], ac = g.accessors[p.attributes.POSITION], bv = g.bufferViews[ac.bufferView];
  const off = (bv.byteOffset || 0) + (ac.byteOffset || 0), V = [];
  for (let i = 0; i < ac.count; i++) V.push([0, 1, 2].map(k => bin.readFloatLE(off + i * 12 + k * 4)));
  return { m, l, V };
}
const demi = (V, y, z) => { const s = V.filter(v => Math.abs(v[1] - y) < 4 && Math.abs(v[2] - z) < 4 && v[0] > 0); return s.length ? Math.max(...s.map(v => v[0])) : NaN; };
for (const mt of MONTURES) {
  console.log(`\n${mt.nom} : face ${mt.largeur} mm, branche ${mt.branche} mm\n`);
  const lignes = [];
  for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.glb')).sort()) {
    const { m, l, V } = sommets(path.join(DIR, f.replace('.glb', '')));
    const yT = (l.TEMPLE_L[1] + l.TEMPLE_R[1]) / 2, ear = l.EAR_REST_L;
    const out = { tete: m.id, largeur: m.dimensions_mm.head_width };
    for (const pc of PROF_CHARNIERE) {
      const hw = demi(V, yT, -pc), ouv = hw - mt.largeur / 2;     // > 0 : la tête dépasse la face
      out['pince_' + pc] = isNaN(hw) ? '?' : (ouv > 0 ? `+${ouv.toFixed(0)} mm` : 'libre') + ` (tête ±${hw.toFixed(0)})`;
    }
    const pc = 15, hx = mt.largeur / 2, dz = pc + Math.abs(ear[2]), dx = ear[0] - hx;
    out.ouverture = dx > 0 ? `${(Math.atan2(dx, dz) * 180 / Math.PI).toFixed(1)}°` : `${(-Math.atan2(-dx, dz) * 180 / Math.PI).toFixed(1)}° (rentre)`;
    out.branche_utile = `${Math.hypot(dx, dz).toFixed(0)} mm`;
    out.longueur = Math.hypot(dx, dz) > mt.branche - 20 ? 'courte' : 'ok';
    lignes.push(out);
  }
  console.table(lignes);
  const pince = lignes.filter(r => r.pince_10.startsWith('+'));
  console.log(`têtes plus larges que la face de la monture (charnière à ${PROF_CHARNIERE[0]} mm) : ${pince.length} sur ${lignes.length} — ${pince.map(r => r.tete).join(' ') || 'aucune'}`);
}
