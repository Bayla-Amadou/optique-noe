/**
 * Contrôle de plausibilité d'une tête de référence livrée (GLB + measurements).
 *   node outils/controle-tete.js 3dmodel/morphologies/H06
 * Vérifie ce que le rapport de validation de l'auteur ne vérifie pas : que les
 * repères d'oreille tombent sur l'oreille, que le nez est centré, et que les
 * proportions ressemblent à celles d'un adulte. Les seuils sont des ordres de
 * grandeur d'anthropométrie courante, pas des vérités : un écart est une
 * question à poser, pas un verdict.
 */
const fs = require('fs');
const base = process.argv[2];
const b = fs.readFileSync(base + '.glb'), L = b.readUInt32LE(12), g = JSON.parse(b.slice(20, 20 + L));
const m = JSON.parse(fs.readFileSync(base + '_measurements.json', 'utf8')), l = m.landmarks_mm, d = (a, c) => Math.hypot(...a.map((x, i) => x - c[i]));
const av = [], inf = [];
let ecart = 0, n = 0;
for (const nd of g.nodes) if (l[nd.name] && nd.translation) { n++; ecart = Math.max(ecart, d(nd.translation, l[nd.name])); }
inf.push(`${m.id} · ${(b.length / 1024).toFixed(0)} Ko · ${n} repères GLB, écart au JSON ${ecart.toExponential(0)} mm`);
const dim = m.dimensions_mm;
inf.push(`largeur ${dim.head_width} · hauteur ${dim.head_height} · profondeur ${dim.head_depth} · IPD ${dim.ipd} mm`);
if (dim.head_depth < 165) av.push(`profondeur de tête ${dim.head_depth} mm : un adulte fait 175 à 200`);
// oreille : le bas du pavillon est-il à portée du haut ?
for (const s of ['L', 'R']) {
  const top = l['EAR_TOP_' + s], bo = l['EAR_BOTTOM_' + s], tr = l['TRAGUS_' + s], re = l['EAR_REST_' + s];
  const haut = top[1] - bo[1];
  if (haut > 75) av.push(`oreille ${s} : pavillon de ${haut.toFixed(0)} mm de haut (un adulte : 55 à 70) — EAR_BOTTOM_${s} est peut-être sur le cou`);
  if (Math.abs(top[2] - bo[2]) > 25) av.push(`oreille ${s} : EAR_BOTTOM recule de ${Math.abs(top[2] - bo[2]).toFixed(0)} mm par rapport à EAR_TOP`);
  inf.push(`oreille ${s} : repos à ${(-re[2]).toFixed(1)} mm derrière les pupilles, ${(re[1] - tr[1]).toFixed(1)} mm au-dessus du tragus`);
}
if (Math.abs(l.NOSE_BRIDGE[0]) > 2) av.push(`pont du nez décentré de ${l.NOSE_BRIDGE[0].toFixed(1)} mm`);
if (Math.abs(l.EAR_REST_L[2] - l.EAR_REST_R[2]) > 3) av.push(`repos d'oreille asymétrique de ${Math.abs(l.EAR_REST_L[2] - l.EAR_REST_R[2]).toFixed(1)} mm en profondeur`);
if (l.NOSE_TIP[2] < 18) av.push(`bout du nez à ${l.NOSE_TIP[2].toFixed(0)} mm devant le plan des pupilles (un adulte : 20 à 30)`);
console.log(inf.join('\n'));
av.forEach(x => console.log('  ⚠ ' + x));
console.log(av.length ? '  → à discuter' : '  → plausible');
