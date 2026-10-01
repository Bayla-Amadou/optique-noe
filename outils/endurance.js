/**
 * Banc d'endurance : des sessions client en boucle, avec changements de
 * monture, et la mémoire mesurée à chaque tour. Une fuite se voit comme une
 * courbe qui monte sans jamais redescendre.
 *
 * Ce qui est compté, et pourquoi :
 *   • objets WebGL vivants (tampons, textures, programmes, cibles de rendu) :
 *     c'est la mémoire de la carte graphique. On l'obtient en enveloppant
 *     les fonctions create et delete de WebGL, donc sans rien supposer de Three.js ;
 *   • tas JavaScript utilisé ;
 *   • nombre de noeuds DOM.
 *
 * Lancer :
 *   FILM_Y4M=film.y4m SESSIONS=20 CHANGEMENTS=8 node outils/endurance.js
 * Sur un serveur, pour plusieurs heures : SESSIONS=2000 (voir DEPLOIEMENT.md).
 * Sortie : une ligne par session, et un verdict (pente de croissance).
 *
 * Limite : sans carte graphique, le rendu est logiciel. Ce banc trouve les
 * fuites de l'application, pas celles d'un pilote graphique ou de la caméra.
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.join(__dirname, '..');
const SESSIONS = +process.env.SESSIONS || 6, CHANGEMENTS = +process.env.CHANGEMENTS || 6;
const FILM = process.env.FILM_Y4M || path.join(ROOT, 'visage.y4m');
const SORTIE = process.env.SORTIE || '';
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm',
  '.glb':'model/gltf-binary','.task':'application/octet-stream','.png':'image/png','.json':'application/json',
  '.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.css':'text/css'};
const srv = http.createServer((q, s) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p === '/' ? 'index.html' : p), (e, d) => {
    if (e) { s.writeHead(404); s.end(); return; }
    s.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); s.end(d);
  });
});
const pause = ms => new Promise(r => setTimeout(r, ms));

// Compteurs WebGL, installés avant toute page.
const COMPTEURS = `(()=>{
  const vivants = { buffer:0, texture:0, program:0, framebuffer:0, renderbuffer:0, vao:0 };
  window.__gl = vivants;
  for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
    const P = C.prototype;
    const lier = (cree, supprime, cle) => {
      const c = P[cree], d = P[supprime]; if (!c || !d) return;
      P[cree] = function(...a){ const o = c.apply(this,a); if(o) { vivants[cle]++; } return o; };
      P[supprime] = function(o){ if(o) vivants[cle]--; return d.call(this,o); };
    };
    lier('createBuffer','deleteBuffer','buffer'); lier('createTexture','deleteTexture','texture');
    lier('createProgram','deleteProgram','program'); lier('createFramebuffer','deleteFramebuffer','framebuffer');
    lier('createRenderbuffer','deleteRenderbuffer','renderbuffer'); lier('createVertexArray','deleteVertexArray','vao');
  }
})();`;
const HOOK = `window.__e={
  ajouter:(n)=>{ for(let i=1;i<=n;i++) GLASSES.push({...GLASSES[0], id:'cube'+i, name:'Cube'+i}); return GLASSES.length; },
  choisir:(i)=>selectGlass(i),
  pret:()=>!!glassGroup && !glassLoading,
  etat:()=>_etatSuivi,
};`;

(async () => {
  await new Promise(r => srv.listen(8201, r));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
           '--use-file-for-fake-video-capture=' + FILM, '--enable-unsafe-swiftshader',
           '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const ctx = await b.newContext({ permissions: ['camera'], viewport: { width: 1080, height: 1920 } });
  await ctx.addInitScript(COMPTEURS);
  const pg = await ctx.newPage(); const erreurs = [];
  pg.on('pageerror', e => erreurs.push(e.message));
  await pg.route('**/index.html*', async r => {
    const rep = await r.fetch(); let t = await rep.text(); const i = t.lastIndexOf('</script>');
    await r.fulfill({ body: t.slice(0, i) + HOOK + t.slice(i), headers: { 'content-type': 'text/html' } });
  });
  await pg.goto('http://127.0.0.1:8201/index.html');
  await pg.waitForSelector('#startBtn', { state: 'attached' });
  const nb = await pg.evaluate(() => window.__e.ajouter(3));
  const attendre = async (cond, ms = 60000) => { const t = Date.now();
    while (Date.now() - t < ms) { if (await pg.evaluate(cond)) return true; await pause(250); } return false; };
  const mesure = async () => pg.evaluate(async () => {
    if (window.gc) window.gc();
    await new Promise(r => setTimeout(r, 300));
    return { ...window.__gl, tas: Math.round(performance.memory.usedJSHeapSize / 1048576),
             dom: document.getElementsByTagName('*').length };
  });
  const lignes = [], depart = await mesure();
  console.log(`catalogue de test : ${nb} montures · ${SESSIONS} sessions × ${CHANGEMENTS} changements`);
  console.log('session | tampons textures programmes cibles vao | tas Mo | dom');
  for (let s = 1; s <= SESSIONS; s++) {
    await pg.evaluate(() => document.getElementById('startBtn').click());
    if (!await attendre(() => window.__e.pret())) { console.log('la session ne démarre pas'); break; }
    for (let k = 1; k <= CHANGEMENTS; k++) {
      await pg.evaluate(i => window.__e.choisir(i), k % nb);
      await attendre(() => window.__e.pret(), 30000);
    }
    await pause(500);
    await pg.evaluate(() => document.getElementById('stopBtn').click());
    await pause(800);
    const m = await mesure(); lignes.push(m);
    console.log(`${String(s).padStart(7)} | ${String(m.buffer).padStart(6)} ${String(m.texture).padStart(8)} ${String(m.program).padStart(10)} ` +
                `${String(m.framebuffer + m.renderbuffer).padStart(6)} ${String(m.vao).padStart(3)} | ${String(m.tas).padStart(6)} | ${m.dom}`);
  }
  if (SORTIE) fs.writeFileSync(SORTIE, 'session,buffer,texture,program,framebuffer,renderbuffer,vao,tas_mo,dom\n' +
    lignes.map((m, i) => [i + 1, m.buffer, m.texture, m.program, m.framebuffer, m.renderbuffer, m.vao, m.tas, m.dom].join(',')).join('\n'));

  // Verdict : on compare la seconde moitié à la première. Une application
  // saine se stabilise ; une fuite fait monter la seconde moitié.
  const moy = (a, f) => a.reduce((x, m) => x + f(m), 0) / (a.length || 1);
  const h = Math.floor(lignes.length / 2), A = lignes.slice(0, h), B = lignes.slice(h);
  const gpu = m => m.buffer + m.texture + m.program + m.framebuffer + m.renderbuffer + m.vao;
  const echecs = [];
  if (lignes.length >= 4) {
    const dg = moy(B, gpu) - moy(A, gpu), dt = moy(B, m => m.tas) - moy(A, m => m.tas);
    console.log(`\nobjets WebGL : ${moy(A, gpu).toFixed(0)} → ${moy(B, gpu).toFixed(0)} (${dg >= 0 ? '+' : ''}${dg.toFixed(0)})`);
    console.log(`tas JS       : ${moy(A, m => m.tas).toFixed(1)} → ${moy(B, m => m.tas).toFixed(1)} Mo (${dt >= 0 ? '+' : ''}${dt.toFixed(1)})`);
    if (dg > 5) echecs.push(`les objets WebGL continuent de monter (+${dg.toFixed(0)}) : fuite de mémoire graphique`);
    if (dt > 15) echecs.push(`le tas JavaScript continue de monter (+${dt.toFixed(1)} Mo)`);
  }
  if (erreurs.length) echecs.push('erreurs de page : ' + erreurs.slice(0, 2).join(' | '));
  console.log(echecs.length ? '\nÉCHEC\n - ' + echecs.join('\n - ') : '\nOK : la mémoire se stabilise');
  await b.close(); srv.close(); process.exit(echecs.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
