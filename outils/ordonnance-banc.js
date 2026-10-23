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
// ── Lisibilité de la photo prise (ordonnance.js : lisibilite) ──────────────────────────────────────
// Texte synthétique : lignes de mots (barres de 3 px) sur papier crème, flou par moyenne de boîte, obscurité, reflet.
// Les seuils ont été réglés sur un texte réel rendu dans Chromium (flou, obscurité, reflet) ; ce banc garde la logique
// à l'abri des régressions, il ne remplace pas un essai avec la vraie caméra et de vraies ordonnances.
const LW = 640, LH = 480;
function feuilleTexte({ flou = 0, lum = 1, voile = 0, reflet = 0, texte = true, papier = true } = {}) {
  const gris = new Float32Array(LW * LH); let r = 11; const al = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let i = 0; i < gris.length; i++) gris[i] = 140;
  const x0 = Math.floor(0.30 * LW) - 14, x1 = Math.floor(0.70 * LW) + 14, y0 = Math.floor(0.48 * LH) - 10, y1 = Math.floor(0.88 * LH) + 10;
  if (papier) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) gris[y * LW + x] = 236;
  if (papier && texte) for (let l = 0; l < 11; l++) { let x = x0 + 10; const y = y0 + 14 + l * 9;
    while (x < x1 - 30) { const m = 8 + Math.floor(al() * 24); for (let yy = y; yy < y + 3; yy++) for (let xx = x; xx < x + m; xx++) gris[yy * LW + xx] = 30; x += m + 5; } }
  let img = gris;
  for (let passe = 0; passe < flou; passe++) {              // flou = nombre de passes de boîte 3×3
    const o = new Float32Array(img.length);
    for (let y = 1; y < LH - 1; y++) for (let x = 1; x < LW - 1; x++) { let t = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) t += img[(y + b) * LW + x + a]; o[y * LW + x] = t / 9; }
    img = o;
  }
  const d = new Uint8ClampedArray(LW * LH * 4);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    let v = img[y * LW + x]; v = 128 + (v - 128) * (1 - voile); v *= lum;
    if (reflet) { const dd = Math.hypot(x - 0.5 * LW, y - 0.68 * LH); if (dd < reflet) v = 255; }
    const o = (y * LW + x) * 4; d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
  }
  return d;
}
const lis = o => O.lisibilite(feuilleTexte(o), LW, LH);
ok(lis({}).lisible, 'une photo nette et bien éclairée doit être acceptée');
ok(lis({ flou: 1 }).lisible, 'un très léger flou reste lisible');
ok(lis({ flou: 6 }).raison === 'floue' && lis({ flou: 12 }).raison === 'floue', 'une photo floue doit être refusée comme floue');
ok(lis({ papier: false }).lisible === false && lis({ texte: false, papier: false }).lisible === false, 'ni mur ni visage ne passent');
ok(lis({ lum: 0.4 }).raison === 'sombre', 'une photo sombre doit être refusée pour obscurité');
ok(['contraste', 'feuille'].includes(lis({ voile: 0.8 }).raison), 'un texte délavé doit être refusé');
ok(lis({ reflet: 60 }).raison === 'reflet', 'un reflet sur la feuille doit être refusé');
ok(lis({ texte: false }).raison === 'vide', 'une feuille sans texte doit être refusée');
ok(['feuille', 'sombre'].includes(lis({ papier: false }).raison), 'pas de feuille : refus, et on dit qu\'il n\'y a pas de feuille');
ok(lis({ lum: 1.15 }).lisible, 'papier saturé (caméra sensible) mais texte net : accepté, ce n\'est pas un reflet');
ok(lis({ flou: 12 }).message && lis({ lum: 0.4 }).message, 'un refus doit toujours dire quoi faire');
if (ec.length) { console.error('ÉCHEC\n - ' + ec.join('\n - ')); process.exit(1); }
console.log('ORDONNANCE OK : feuille détectée (mur / vêtement / visage / mouvement / feuille sombre refusés) ; photo illisible (floue / sombre / reflet / délavée / vide) refusée');
