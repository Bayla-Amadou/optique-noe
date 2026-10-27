// Journal du parcours : temps passé à chaque étape, retours en arrière, scans ratés, étape atteinte.
// C'est ce qui répond à « où les clients bloquent-ils ? » sans caméra ni enregistrement d'écran.
// On vérifie aussi que RIEN n'est écrit hors du mode collecte, et que le schéma (mesures.js) accepte
// bien les champs — un champ non déclaré y est silencieusement jeté, ce qui ne se verrait nulle part.
//   NODE_PATH=... node outils/parcours-journal.js ordonnance-nette.y4m dossier-captures
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const M = require('../mesures.js');
const ROOT = path.join(__dirname, '..');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript',
  '.wasm':'application/wasm', '.glb':'model/gltf-binary', '.task':'application/octet-stream',
  '.png':'image/png', '.json':'application/json', '.svg':'image/svg+xml', '.jpg':'image/jpeg',
  '.webp':'image/webp', '.woff2':'font/woff2', '.css':'text/css', '.mp3':'audio/mpeg', '.tflite':'application/octet-stream' };
const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p === '/' ? 'index.html' : p), (e, d) => {
    if (e) { s.writeHead(404); s.end(); return; }
    s.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
const pause = ms => new Promise(r => setTimeout(r, ms));

async function parcourir(b, avecCollecte) {
  const ctx = await b.newContext({ permissions: ['camera'], viewport: { width: 1080, height: 1920 } });
  const pg = await ctx.newPage(); const erreurs = []; pg.on('pageerror', e => erreurs.push(e.message));
  await pg.addInitScript(() => {
    window.__ecrits = [];
    window.noa = { mesureEnregistrer: async d => { window.__ecrits.push(d); return { ok: true }; },
      saveOrder: async () => ({ ok: true, fichiers: {} }), dossierFile: async () => ({ ok: true }),
      dossierSms: async () => ({ ok: true, etat: 'desactive' }), paymentConfig: async () => ({ configure: false }),
      isDev: async () => false, dossierEtat: async () => ({ ok: true }), getOrders: async () => ({ ok: true, orders: [] }) };
  });
  const HOOK = `window.__t={fin:()=>resetToWelcome()};`;
  await pg.route('**/index.html*', async r => { const rep = await r.fetch(); const t = await rep.text();
    const i = t.lastIndexOf('</script>');
    await r.fulfill({ body: t.slice(0, i) + HOOK + t.slice(i), headers: { 'content-type': 'text/html; charset=utf-8' } }); });
  await pg.goto('http://127.0.0.1:8192/index.html' + (avecCollecte ? '?collecte' : ''));
  await pg.waitForSelector('#startBtn');
  await pg.evaluate(() => document.getElementById('startBtn').click());
  await pause(9000);
  await pg.click('#confirmBtn'); await pause(1500);                       // 1 → 2
  await pg.evaluate(() => document.getElementById('btnCapture').click());
  await pg.waitForFunction(() => !document.getElementById('btnOrdNext').disabled, null, { timeout: 40000 }).catch(() => {});
  await pause(500);
  await pg.click('#btnOrdNext'); await pause(1200);                       // 2 → 3
  await pg.click('#btnVerresBack'); await pause(600);                     // un retour en arrière
  await pg.click('#btnOrdNext'); await pause(1200);
  await pg.evaluate(() => { document.getElementById('clientNom').value = 'Awa Diop';
    document.getElementById('clientTel').value = '770000000';
    document.getElementById('clientConsent').checked = true;
    document.querySelector('#choixVision [data-v="progressif"]').click();
    document.querySelector('#choixTraitement [data-v="blanc"]').click();
    document.getElementById('btnVerresNext').click(); });
  await pause(1500);                                                      // 3 → 4
  await pg.evaluate(() => window.__t.fin());
  await pause(800);
  const ecrits = await pg.evaluate(() => window.__ecrits);
  await ctx.close();
  return { ecrits, erreurs };
}

(async () => {
  await new Promise(r => srv.listen(8192, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
           '--autoplay-policy=no-user-gesture-required',
           '--use-file-for-fake-video-capture=' + process.argv[2], '--enable-unsafe-swiftshader'] });
  const ec = [];
  const avec = await parcourir(b, true);
  const sans = await parcourir(b, false);
  await b.close(); srv.close();

  if (sans.ecrits.length) ec.push('hors mode collecte, la borne ne doit RIEN écrire : ' + JSON.stringify(sans.ecrits).slice(0, 200));
  const j = avec.ecrits.find(x => x && x.etape_max);
  if (!j) ec.push('aucun journal de parcours écrit : ' + JSON.stringify(avec.ecrits.map(x => Object.keys(x))).slice(0, 200));
  else {
    if (j.etape_max !== 'paiement') ec.push(`l'étape atteinte devrait être « paiement » : ${j.etape_max}`);
    if (!(j.p_essayage_s > 1)) ec.push(`le temps d'essayage n'est pas compté : ${j.p_essayage_s}`);
    if (!(j.p_ordonnance_s > 1)) ec.push(`le temps d'ordonnance n'est pas compté : ${j.p_ordonnance_s}`);
    if (!(j.p_verres_s > 0)) ec.push(`le temps des verres n'est pas compté : ${j.p_verres_s}`);
    if (j.p_retours !== 1) ec.push(`un seul retour en arrière a été fait : ${j.p_retours}`);
    // Le schéma doit accepter chaque champ : un champ non déclaré est jeté sans bruit.
    const garde = M.valider(j);
    for (const k of ['etape_max', 'p_essayage_s', 'p_ordonnance_s', 'p_verres_s', 'p_paiement_s', 'p_retours', 'p_scans_rates'])
      if (garde[k] === undefined) ec.push(`mesures.js ne déclare pas « ${k} » : le champ serait jeté`);
    if (JSON.stringify(garde).includes('Awa')) ec.push('une donnée personnelle a fui dans le journal');
  }
  if (avec.erreurs.length) ec.push('erreurs de page : ' + avec.erreurs.slice(0, 3).join(' | '));
  console.log(JSON.stringify({ journal: j || null, hors_collecte: sans.ecrits.length,
    resultat: ec.length ? 'ÉCHEC' : 'OK', echecs: ec }, null, 1));
  process.exit(ec.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
