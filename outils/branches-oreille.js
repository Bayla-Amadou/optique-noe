// Les branches doivent se POSER sur l'oreille, pas flotter au-dessus ni rentrer dans la joue.
//
// Deux contrôles, de deux natures :
//   1. La DÉRIVATION, sans navigateur : la hauteur du point d'appui (EAR_REST_Y_CM) est relue dans
//      la tête canonique de Google livrée avec le projet (3dmodel/mp/face_occluder.glb, 468 sommets
//      rangés dans l'ordre des repères). Si quelqu'un change la constante sans changer la géométrie,
//      ou l'inverse, cela se voit ici — et non six mois plus tard sur une capture de client.
//   2. La GÉOMÉTRIE POSÉE, dans la vraie page : pour chaque monture du catalogue, on mesure par où
//      passe réellement la branche au plan des oreilles, après mise à l'échelle et cintrage.
//
//   node outils/branches-oreille.js                      le contrôle 1 seul (rapide, sans navigateur)
//   NODE_PATH=... node outils/branches-oreille.js <vidéo> les deux
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

/* ── 1. La dérivation, lue dans la tête canonique ────────────────────── */
function canonique() {
  const b = fs.readFileSync(path.join(ROOT, '3dmodel/mp/face_occluder.glb'));
  let o = 12, json = null, bin = null;
  while (o < b.length) {
    const len = b.readUInt32LE(o), type = b.readUInt32LE(o + 4), d = b.slice(o + 8, o + 8 + len);
    if (type === 0x4E4F534A) json = JSON.parse(d.toString('utf8'));
    else if (type === 0x004E4942) bin = d;
    o += 8 + len;
  }
  const acc = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  const bv = json.bufferViews[acc.bufferView], off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const P = i => [0, 1, 2].map(k => bin.readFloatLE(off + i * 12 + k * 4));
  return { n: acc.count, P };
}

const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const lire = re => { const m = page.match(re); return m ? parseFloat(m[1]) : null; };
const EAR_REST_Y_CM  = lire(/const EAR_REST_Y_CM\s*=\s*(-?[\d.]+)/);
const EAR_LOCAL_Z_CM = lire(/const EAR_LOCAL_Z_CM\s*=\s*(-?[\d.]+)/);
const OFF_Y          = lire(/const GLASSES_OFFSET_Y_CM\s*=\s*(-?[\d.]+)/);
const OFF_Z          = lire(/const GLASSES_OFFSET_Z_CM\s*=\s*(-?[\d.]+)/);
const DESCENTE_ON    = /const TEMPLE_DROP_ON\s*=\s*true/.test(page);

const ec = [], ok = (c, m) => { if (!c) ec.push(m); };
const c = canonique();
ok(c.n === 468, `la tête canonique doit avoir 468 sommets (${c.n})`);
const nasion = c.P(6), tragusD = c.P(234), tragusG = c.P(454), hautD = c.P(127);
// Repère de la monture : origine au point d'appui sur le nez, soit nasion + décalage.
const versMonture = p => ({ y: p[1] - nasion[1] - OFF_Y, z: p[2] - nasion[2] - OFF_Z });
const tr = versMonture(tragusD), ht = versMonture(hautD);
ok(Math.abs(tragusD[1] - tragusG[1]) < 0.01, 'les deux tragus doivent être à la même hauteur');
ok(Math.abs(tr.z - EAR_LOCAL_Z_CM) < 0.1,
   `EAR_LOCAL_Z_CM (${EAR_LOCAL_Z_CM}) doit tomber sur le tragus canonique (${tr.z.toFixed(2)})`);
ok(Math.abs(ht.y - EAR_REST_Y_CM) < 0.1,
   `EAR_REST_Y_CM (${EAR_REST_Y_CM}) doit valoir la hauteur du haut du contour à l'oreille (lm127 : ${ht.y.toFixed(2)})`);
ok(EAR_REST_Y_CM > tr.y && EAR_REST_Y_CM - tr.y < 2.5,
   `le point d'appui doit être au-dessus du tragus, de moins de 2,5 cm (${(EAR_REST_Y_CM - tr.y).toFixed(2)})`);

const derivation = { tragus_y_cm: +tr.y.toFixed(2), tragus_z_cm: +tr.z.toFixed(2),
                     appui_y_cm: +ht.y.toFixed(2), EAR_REST_Y_CM, EAR_LOCAL_Z_CM };

/* ── 2. La géométrie posée, dans la vraie page ───────────────────────── */
const video = process.argv[2];
if (!video) {
  console.log(JSON.stringify({ derivation, descente: DESCENTE_ON ? 'allumée' : 'éteinte', navigateur: 'non lancé (donnez une vidéo en argument)',
    resultat: ec.length ? 'ÉCHEC' : 'OK', echecs: ec }, null, 1));
  process.exit(ec.length ? 1 : 0);
}

const http = require('http');
const { chromium } = require('playwright-core');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript',
  '.wasm':'application/wasm', '.glb':'model/gltf-binary', '.task':'application/octet-stream',
  '.png':'image/png', '.json':'application/json', '.svg':'image/svg+xml', '.jpg':'image/jpeg',
  '.webp':'image/webp', '.woff2':'font/woff2', '.css':'text/css', '.mp3':'audio/mpeg', '.tflite':'application/octet-stream' };
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p === '/' ? 'index.html' : p), (e, d) => {
    if (e) { s.writeHead(404); s.end(); return; }
    s.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
const pause = ms => new Promise(r => setTimeout(r, ms));

const SONDE = `window.__branche=()=>{ if(!_modeleCourant) return null;
  const inv=new THREE.Matrix4(); _modeleCourant.updateMatrixWorld(true);
  if(_modeleCourant.parent) inv.copy(_modeleCourant.parent.matrixWorld).invert();
  const v=new THREE.Vector3(); let yb=Infinity, yh=-Infinity, n=0, xMax=0;
  _modeleCourant.traverse(o=>{ if(!o.isMesh||!o.geometry) return;
    const pa=o.geometry.attributes.position; if(!pa) return;
    const M=new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld);
    for(let i=0;i<pa.count;i++){ v.fromBufferAttribute(pa,i).applyMatrix4(M);
      if(Math.abs(v.z-(${EAR_LOCAL_Z_CM}))>0.5) continue;
      yb=Math.min(yb,v.y); yh=Math.max(yh,v.y); xMax=Math.max(xMax,Math.abs(v.x)); n++; } });
  return n? {y:(yb+yh)/2, demiLargeur:xMax, n} : null; };`;

(async () => {
  await new Promise(r => srv.listen(8196, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
           '--use-file-for-fake-video-capture=' + video, '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ permissions: ['camera'], viewport: { width: 1080, height: 1920 } });
  const pg = await ctx.newPage(); const err = [];
  pg.on('pageerror', e => err.push(e.message));
  await pg.route('**/index.html', async r => { const rep = await r.fetch(); const t = await rep.text();
    const i = t.lastIndexOf('</script>');
    await r.fulfill({ body: t.slice(0, i) + SONDE + t.slice(i), headers: { 'content-type': 'text/html; charset=utf-8' } }); });
  await pg.goto('http://127.0.0.1:8196/index.html'); await pg.waitForSelector('#startBtn');
  await pg.evaluate(() => document.getElementById('startBtn').click());
  await pause(13000);
  const montures = await pg.evaluate(() => [...document.querySelectorAll('.g-tile')].map(t => t.querySelector('.g-name').textContent));
  const vues = {};
  for (let i = 0; i < montures.length; i++) {
    await pg.evaluate(k => document.querySelectorAll('.g-tile')[k].click(), i);
    await pause(5000);
    vues[montures[i]] = await pg.evaluate(() => window.__branche());
  }
  await b.close(); srv.close();
  if (err.length) ec.push('erreurs de page : ' + err.slice(0, 2).join(' | '));
  if (!Object.keys(vues).length) ec.push('aucune monture trouvée dans le catalogue');

  for (const [nom, m] of Object.entries(vues)) {
    if (!m) { ec.push(`${nom} : aucune branche trouvée au plan des oreilles`); continue; }
    // Avec la descente allumée, la branche doit tomber sur l'appui à ±6 mm. Éteinte, elle est
    // livrée telle que l'artiste l'a dessinée : on vérifie seulement qu'elle reste dans une plage
    // plausible — ni dans la joue, ni au-dessus du crâne — pour attraper un modèle mal calibré.
    if (DESCENTE_ON && Math.abs(m.y - EAR_REST_Y_CM) > 0.6)
      ec.push(`${nom} : la branche passe à ${(m.y * 10).toFixed(0)} mm au plan des oreilles, l'appui est à ${(EAR_REST_Y_CM * 10).toFixed(0)} mm`);
    if (!DESCENTE_ON && !(m.y > -1.5 && m.y < 3))
      ec.push(`${nom} : la branche passe à ${(m.y * 10).toFixed(0)} mm au plan des oreilles, hors du plausible`);
    if (!(m.demiLargeur > 5.5 && m.demiLargeur < 9))
      ec.push(`${nom} : demi-largeur de ${(m.demiLargeur * 10).toFixed(0)} mm au plan des oreilles, hors du plausible`);
  }
  const arrondi = o => o ? { y_mm: +(o.y * 10).toFixed(1), demi_largeur_mm: +(o.demiLargeur * 10).toFixed(1) } : null;
  console.log(JSON.stringify({ derivation, descente: DESCENTE_ON ? 'allumée' : 'éteinte', montures: Object.fromEntries(Object.entries(vues).map(([k, v]) => [k, arrondi(v)])),
    resultat: ec.length ? 'ÉCHEC' : 'OK', echecs: ec }, null, 1));
  process.exit(ec.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
