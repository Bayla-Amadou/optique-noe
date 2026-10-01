/**
 * Lit une tête de référence NOA (OBJ à objets nommés) et en tire ce qui sert
 * à l'essayage : dimensions, repères (LOCATOR_*), parties du visage.
 *   node outils/lire-tete.js 3dmodel/morphologies/H01_NOA.obj
 */
const fs = require('fs');
const f = process.argv[2];
const lignes = fs.readFileSync(f, 'utf8').split('\n');
const v = []; const objets = []; let cur = null;
for (const l of lignes) {
  if (l.startsWith('v ')) { const [, x, y, z] = l.split(/\s+/); v.push([+x, +y, +z]); }
  else if (l.startsWith('o ')) { cur = { nom: l.slice(2).trim(), debutV: v.length, fv: new Set(), nf: 0 }; objets.push(cur); }
  else if (l.startsWith('f ') && cur) { cur.nf++; for (const t of l.slice(2).trim().split(/\s+/)) cur.fv.add(parseInt(t) - 1); }
}
const bbox = idx => { const b = { mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] };
  for (const i of idx) for (let k = 0; k < 3; k++) { b.mn[k] = Math.min(b.mn[k], v[i][k]); b.mx[k] = Math.max(b.mx[k], v[i][k]); } return b; };
const fmt = a => a.map(x => x.toFixed(1)).join(', ');
console.log(`${f}\n${v.length} sommets · ${objets.length} objets\n`);
const tout = bbox(v.keys()); console.log('boîte globale mn', fmt(tout.mn), '| mx', fmt(tout.mx), '| taille', fmt(tout.mx.map((x, i) => x - tout.mn[i])));
console.log('\nobjet                       sommets   centre (x, y, z)            taille (x, y, z)');
for (const o of objets) {
  const idx = o.fv.size ? [...o.fv] : Array.from({ length: Math.max(0, (objets[objets.indexOf(o) + 1]?.debutV ?? v.length) - o.debutV) }, (_, i) => o.debutV + i);
  if (!idx.length) { console.log(o.nom.padEnd(28), '0'); continue; }
  const b = bbox(idx), c = b.mn.map((x, i) => (x + b.mx[i]) / 2), t = b.mx.map((x, i) => x - b.mn[i]);
  console.log(o.nom.padEnd(28), String(idx.length).padStart(6), '  ', fmt(c).padEnd(26), fmt(t));
}
