// Le tableau de bord contre le VRAI serveur, de bout en bout : dossiers déposés comme une borne les
// dépose, connexion, puis chaque vue ouverte et contrôlée.
//
// C'est le seul banc qui exerce la LIAISON. Les autres vérifient chacun son morceau ; celui-ci
// vérifie qu'ils se parlent — une route renommée côté serveur, un champ disparu, et la page se vide
// sans que rien d'autre ne le signale.
//
//   NODE_PATH=... node outils/tableau-de-bord-banc.js [dossier-captures]
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { chromium } = require('playwright-core');
const RACINE = path.join(__dirname, '..');
const sortie = process.argv[2] || null;
const pause = ms => new Promise(r => setTimeout(r, ms));
const ec = [], ok = (c, m) => { if (!c) ec.push(m); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noa-tb-'));
Object.assign(process.env, {
  NOA_CLE_BORNE: 'cle-test', NOA_ADMIN_UTILISATEUR: 'bayla', NOA_ADMIN_MDP: 'un-mot-de-passe-long',
  NOA_OPTICIEN_UTILISATEUR: 'fred', NOA_OPTICIEN_MDP: 'un-autre-mot-de-passe',
  NOA_DONNEES: tmp, NOA_PORT: '8970', NOA_SMS_FOURNISSEUR: 'journal',
});
const { app } = require(path.join(RACINE, 'serveur', 'serveur.js'));
const srv = http.createServer(app);

const CLIENTS = [
  { id: 'NOA-100', nom: 'Awa Diop',     tel: '771234560', monture: 'Cube',        montant: 30000, paiement: 'Wave',         extras: ['Vision de loin', 'Verres blancs anti-reflet', 'Express 48h'] },
  { id: 'NOA-101', nom: 'Moussa Fall',  tel: '771234561', monture: 'N.O.A 53-16', montant: 25000, paiement: 'Orange Money', extras: ['Progressif', 'Verres photochromiques anti-reflet'] },
  { id: 'NOA-102', nom: 'Fatou Sall',   tel: '771234562', monture: 'Cube',        montant: 25000, paiement: 'Wave',         extras: ['Vision de près', 'Verres blancs anti-reflet'] },
];
// Les vues du pilotage, et un mot qui doit y figurer si elle s'est vraiment affichée.
const VUES = [
  ['admin/apercu',   /Chiffre d'affaires/i],
  ['admin/ventes',   /Chiffre d'affaires/i],
  ['admin/bornes',   /borne/i],
  ['admin/qualite',  /essayages?/i],
  ['admin/reglages', /Réglages/i],
  ['admin/journal',  /QUAND|Connexion/i],
  ['opticien/dossiers', /PATIENT|Rechercher/i],
  ['opticien/commandes', /./],
];

(async () => {
  await new Promise(r => srv.listen(8971, r));
  const base = 'http://127.0.0.1:8971';
  const K = { 'X-NOA-Cle': 'cle-test', 'Content-Type': 'application/json' };

  // 1. Une borne dépose ses dossiers, exactement comme le fait dossier.js.
  for (let i = 0; i < CLIENTS.length; i++) {
    const c = CLIENTS[i];
    const r = await fetch(base + '/dossiers', { method: 'POST', headers: K, body: JSON.stringify({
      ...c, boutique: 'dakar-plateau', borne: 'dakar-plateau-1', pd_mm: 62 + i,
      faceWidth_cm: 14 + i * 0.2, faceShape: ['ovale', 'carré', 'rond'][i % 3],
      date: new Date(Date.now() - i * 86400000).toISOString(),
      consentement: '2026-10-27', consentementLe: new Date().toISOString(), paiementRef: 'REF-' + i }) });
    ok(r.status === 200, `dépôt du dossier ${c.id} : ${r.status}`);
  }
  await pause(500);

  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
  const pg = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  const err = [], api = [];
  pg.on('pageerror', e => err.push(e.message));
  pg.on('response', r => { const u = r.url(); if (u.includes('/api/') && r.status() >= 400) api.push(r.status() + ' ' + u.replace(base, '')); });

  // 2. La page servie par le serveur doit demander le mot de passe, PAS ouvrir la démonstration.
  await pg.goto(base + '/tableau-de-bord/');
  const vuConnexion = await pg.waitForSelector('#ecranConnexion:not([hidden])', { timeout: 20000 }).then(() => true).catch(() => false);
  ok(vuConnexion, 'servie par le serveur, la page doit demander les identifiants et non ouvrir la démonstration');
  if (sortie) await pg.screenshot({ path: path.join(sortie, 'tb-connexion.png') });

  await pg.click('#choixEspace [data-e="admin"]');
  await pg.fill('#champUtilisateur', 'bayla');
  await pg.fill('#champMdp', 'un-mot-de-passe-long');
  await pg.click('#btnSeConnecter');
  const entre = await pg.waitForFunction(() => document.getElementById('ecranConnexion').hidden, null, { timeout: 20000 }).then(() => true).catch(() => false);
  ok(entre, 'la connexion administrateur doit aboutir : ' + (await pg.evaluate(() => (document.getElementById('erreurConnexion') || {}).textContent || '')));
  if (!entre) { console.log(JSON.stringify({ resultat: 'ÉCHEC', echecs: ec }, null, 1)); await b.close(); srv.close(); process.exit(1); }
  await pause(2000);

  // 3. Les données affichées sont celles du serveur, pas celles de la démonstration.
  const demo = await pg.evaluate(() => !document.getElementById('bandeauDemo').hidden);
  ok(!demo, 'le bandeau « mode démonstration » ne doit pas être affiché une fois connecté');

  // 4. Chaque vue s'ouvre et montre quelque chose.
  const vues = {};
  for (const [route, attendu] of VUES) {
    await pg.evaluate(h => { location.hash = '#/' + h; }, route);
    await pause(1800);
    const txt = await pg.evaluate(() => { const c = document.getElementById('contenu'); return c ? c.innerText.replace(/\s+/g, ' ').trim() : ''; });
    vues[route] = txt.slice(0, 90);
    ok(txt.length > 40, `la vue ${route} est vide`);
    ok(attendu.test(txt), `la vue ${route} ne montre pas ce qu'on attend : « ${txt.slice(0, 70)} »`);
    if (sortie) await pg.screenshot({ path: path.join(sortie, 'tb-' + route.replace('/', '-') + '.png'), fullPage: true });
  }

  // 5. Le dossier déposé par la borne se retrouve bien dans la liste de l'opticien.
  await pg.evaluate(() => { location.hash = '#/opticien/dossiers'; });
  await pause(1800);
  const liste = (await pg.evaluate(() => document.getElementById('contenu').innerText)).replace(/\s+/g, ' ');
  for (const c of CLIENTS) {
    ok(liste.includes(c.nom), `${c.nom} devrait apparaître dans les dossiers`);
    ok(liste.includes(c.id), `la référence ${c.id} devrait apparaître`);
  }
  ok(/30 000/.test(liste), 'le montant de la commande avec option devrait apparaître');

  ok(!err.length, 'erreurs de page : ' + err.slice(0, 3).join(' | '));
  ok(!api.length, 'appels à l\'API en échec : ' + [...new Set(api)].join(' | '));

  await b.close(); srv.close();
  console.log(JSON.stringify({ dossiers_deposes: CLIENTS.length, vues, resultat: ec.length ? 'ÉCHEC' : 'OK', echecs: ec }, null, 1));
  process.exit(ec.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
