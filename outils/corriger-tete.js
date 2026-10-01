/**
 * Corrige dans une tête de référence les repères que l'on peut retrouver dans
 * le maillage lui-même, sans rien inventer :
 *   • EAR_BOTTOM_L/R : sur le lobe. On descend le long de l'oreille tant que
 *     la saillie latérale reste au-dessus de la peau du crâne ; le point où
 *     elle retombe est le bas du lobe. (Livré : sur le cou.)
 *   • NOSE_BRIDGE : ramené sur l'axe de symétrie (x = 0), à la hauteur d'origine,
 *     avec la profondeur de la surface à cet endroit.
 * Les fichiers d'origine ne sont jamais modifiés : les versions corrigées vont
 * dans 3dmodel/morphologies/corrige/, avec la liste des corrections.
 *   node outils/corriger-tete.js 3dmodel/morphologies/H05 [...]
 */
const fs = require('fs'), path = require('path');
function corriger(base) {
  const b = fs.readFileSync(base + '.glb'), Lj = b.readUInt32LE(12), g = JSON.parse(b.slice(20, 20 + Lj));
  const bin = b.slice(20 + Lj + 8);
  const m = JSON.parse(fs.readFileSync(base + '_measurements.json', 'utf8')), l = m.landmarks_mm;
  const nd = g.nodes.find(n => n.mesh != null && !l[n.name] && !/GEOMETRY/.test(n.name));
  const p = g.meshes[nd.mesh].primitives[0], ac = g.accessors[p.attributes.POSITION], bv = g.bufferViews[ac.bufferView];
  const off = (bv.byteOffset || 0) + (ac.byteOffset || 0), V = [];
  for (let i = 0; i < ac.count; i++) V.push([0, 1, 2].map(k => bin.readFloatLE(off + i * 12 + k * 4)));
  const fait = [], avant = {};
  for (const s of ['L', 'R']) {
    const sg = s === 'L' ? 1 : -1, t = l['TRAGUS_' + s], top = l['EAR_TOP_' + s];
    const X = v => sg * v[0], tx = Math.abs(t[0]);
    const zlo = t[2] - 30, zhi = t[2] + 6;                         // l'oreille est derrière le tragus
    const dansFenetre = v => X(v) > 0 && v[2] > zlo && v[2] < zhi;
    // saillie latérale par tranches de 2 mm, en descendant depuis le haut de l'oreille
    let yBas = top[1], dernier = null;
    for (let y = top[1]; y > top[1] - 90; y -= 2) {
      const tr = V.filter(v => dansFenetre(v) && v[1] <= y && v[1] > y - 2);
      const mx = tr.length ? Math.max(...tr.map(X)) : 0;
      if (mx >= tx - 6) { yBas = y - 2; dernier = tr.reduce((a, v) => X(v) > X(a) ? v : a, tr[0]); } else if (y < top[1] - 8) break;
    }
    // le sommet le plus bas encore dans la saillie
    const cand = V.filter(v => dansFenetre(v) && X(v) >= tx - 6 && v[1] >= yBas - 2 && v[1] <= top[1]);
    const bas = cand.reduce((a, v) => v[1] < a[1] ? v : a, cand[0]);
    avant['EAR_BOTTOM_' + s] = l['EAR_BOTTOM_' + s].slice();
    l['EAR_BOTTOM_' + s] = bas.map(x => +x.toFixed(6));
    fait.push(`EAR_BOTTOM_${s} : y ${avant['EAR_BOTTOM_' + s][1].toFixed(0)} → ${bas[1].toFixed(0)} mm (longueur d'oreille ${(top[1] - bas[1]).toFixed(0)} mm)`);
  }
  // pont du nez sur l'axe
  const nb = l.NOSE_BRIDGE;
  if (Math.abs(nb[0]) > 1) {
    // La surface au pont du nez peut être trouée (défaut de maillage de la
    // base) : on élargit la fenêtre de recherche tant qu'il n'y a rien.
    let voisins = [];
    for (const dy of [3, 6, 10]) { voisins = V.filter(v => Math.abs(v[0]) < 3 && Math.abs(v[1] - nb[1]) < dy && v[2] > 0); if (voisins.length) break; }
    if (voisins.length) {
      const z = voisins.reduce((a, v) => a + v[2], 0) / voisins.length;
      avant.NOSE_BRIDGE = nb.slice(); l.NOSE_BRIDGE = [0, nb[1], +z.toFixed(6)];
      fait.push(`NOSE_BRIDGE : x ${avant.NOSE_BRIDGE[0].toFixed(1)} → 0, z ${avant.NOSE_BRIDGE[2].toFixed(1)} → ${z.toFixed(1)} mm`);
    }
  }
  // sortie : GLB (translations des repères) + JSON
  for (const n of g.nodes) if (avant[n.name]) { n.translation = l[n.name].slice(); n.extras = { landmark_mm: l[n.name].slice() }; }
  let j = Buffer.from(JSON.stringify(g)); const pad = (4 - j.length % 4) % 4; j = Buffer.concat([j, Buffer.alloc(pad, 0x20)]);
  const tete = Buffer.alloc(12); tete.write('glTF', 0); tete.writeUInt32LE(2, 4);
  const cj = Buffer.alloc(8); cj.writeUInt32LE(j.length, 0); cj.write('JSON', 4);
  const cb = Buffer.alloc(8); cb.writeUInt32LE(bin.length, 0); cb.write('BIN\0', 4);
  tete.writeUInt32LE(12 + 8 + j.length + 8 + bin.length, 8);
  const dir = path.join(path.dirname(base), 'corrige'); fs.mkdirSync(dir, { recursive: true });
  const nom = path.basename(base);
  fs.writeFileSync(path.join(dir, nom + '.glb'), Buffer.concat([tete, cj, j, cb, bin]));
  m.corrections = { outil: 'outils/corriger-tete.js', detail: fait, avant };
  fs.writeFileSync(path.join(dir, nom + '_measurements.json'), JSON.stringify(m, null, 2) + '\n');
  return { id: m.id, ear: m.morph_parameters && m.morph_parameters.ear, fait };
}
if (require.main === module) for (const a of process.argv.slice(2)) { const r = corriger(a); console.log(r.id + (r.ear != null ? ' (ear ' + r.ear + ')' : '')); r.fait.forEach(x => console.log('  ' + x)); }
module.exports = { corriger };
