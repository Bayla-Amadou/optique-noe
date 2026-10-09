/**
 * Banc de la détection d'ordonnance (ordonnance.js) sur des scènes synthétiques :
 * feuille avec texte, mur clair, vêtement clair, visage, feuille qui bouge, feuille trop sombre.
 * Ne prouve PAS le comportement sur une vraie feuille et une vraie caméra : à valider sur la borne.
 * Lancer : node outils/ordonnance-banc.js
 */
const O = require('../ordonnance.js');
const W = 160, H = 120;
let g = 5; const al = () => { g = (g * 16807) % 2147483647; return g / 2147483647 - 0.5; };
function scene(fond, { papier = false, texte = true, decal = 0, bruit = 3, papierCouleur = [236, 236, 228], pli = false } = {}) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4; let c = fond;
    if (pli) { const k = 1 + 0.06 * Math.sin(x / 9 + y / 14); c = fond.map(v => v * k); }
    if (papier && x > 0.3 * W + decal && x < 0.7 * W + decal && y > 0.48 * H && y < 0.88 * H) {
      c = papierCouleur;
      if (texte && ((y - Math.floor(0.5 * H)) % 8) < 3 && x > 0.33 * W + decal && x < 0.67 * W + decal) c = [40, 40, 45];
    }
    d[o] = c[0] + al() * bruit; d[o + 1] = c[1] + al() * bruit; d[o + 2] = c[2] + al() * bruit; d[o + 3] = 255;
  }
  return d;
}
function essaie(fn, n = 8) { const dt = O.creer(); let r; for (let i = 0; i < n; i++) r = dt.pousser(fn(i), W, H); return r; }
const ec = []; const ok = (c, m) => { if (!c) ec.push(m); };
const mur = [226, 216, 204], tee = [168, 196, 186], peau = [150, 98, 78], tissu = [60, 60, 70];
ok(essaie(() => scene(peau, { papier: true })).pret, 'une feuille avec texte, immobile, doit être détectée');
ok(essaie(() => scene(tissu, { papier: true })).pret, 'idem sur un fond sombre');
ok(!essaie(() => scene(mur)).pret, 'un mur clair ne doit pas déclencher');
ok(!essaie(() => scene(tee, { pli: true })).pret, 'un vêtement clair à plis ne doit pas déclencher');
ok(!essaie(() => scene(peau)).pret, 'un visage seul ne doit pas déclencher');
ok(!essaie(i => scene(peau, { papier: true, decal: (i % 2) * 12 })).pret, 'une feuille qui bouge ne doit pas déclencher');
ok(!essaie(() => scene(peau, { papier: true, papierCouleur: [110, 110, 105] })).pret, 'une feuille sombre ne doit pas déclencher');
ok(!essaie(() => scene(peau, { papier: true, papierCouleur: [200, 215, 120] })).pret, 'un papier très coloré ne doit pas déclencher');
const dt = O.creer(); const suite = []; for (let i = 0; i < 6; i++) suite.push(dt.pousser(scene(peau, { papier: true }), W, H).pret);
ok(suite.slice(0, 4).every(x => !x) && suite[5], 'le déclenchement exige environ 1,5 s de stabilité (5 mesures concordantes)');
if (ec.length) { console.error('ÉCHEC\n - ' + ec.join('\n - ')); process.exit(1); }
console.log('ORDONNANCE OK : feuille détectée, mur / vêtement / visage / mouvement / feuille sombre refusés');
