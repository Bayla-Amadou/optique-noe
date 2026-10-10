/**
 * Banc des comptes du tableau de bord : connexion nom + mot de passe, deux rôles, portée par boutique,
 * verrouillage après échecs, identité dans le journal, refus de démarrer sans compte.
 * Lancer : node banc-comptes.js
 */
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { spawnSync } = require('child_process');
const C = require('./comptes.js');
const ec = [], ok = (c, m) => { if (!c) ec.push(m); };

// 1. Empreintes et lecture de l'environnement
const e1 = C.empreinte('mot-de-passe-long-1'), e2 = C.empreinte('mot-de-passe-long-2');
ok(C.verifier('mot-de-passe-long-1', e1) && !C.verifier('mot-de-passe-long-2', e1), 'empreinte : bon mot de passe accepté, autre refusé');
ok(C.empreinte('x'.repeat(12)) !== C.empreinte('x'.repeat(12)), 'deux empreintes du même mot de passe doivent différer (sel)');
const env = { NOA_COMPTES: `bayla:admin:${e1}; fred:opticien:${e2}:dakar-plateau; ;`, NOA_ADMIN_UTILISATEUR: '', NOA_ADMIN_MDP: '' };
const lu = C.lireComptes(env);
ok(lu.comptes.size === 2 && !lu.erreurs.length && lu.comptes.get('fred').boutique === 'dakar-plateau', 'lecture de NOA_COMPTES');
ok(C.lireComptes({ NOA_COMPTES: 'a:admin:pasunehash' }).erreurs.length === 1, 'une empreinte illisible est signalée');
ok(C.lireComptes({ NOA_COMPTES: `bob:patron:${e1}` }).erreurs.length === 1, 'un rôle inconnu est signalé');
ok(C.lireComptes({ NOA_COMPTES: `bob:admin:${e1};bob:admin:${e2}` }).erreurs.length === 1, 'un doublon est signalé');
ok(C.lireComptes({ NOA_ADMIN_UTILISATEUR: 'moi', NOA_ADMIN_MDP: 'court' }).erreurs.length === 1, 'un mot de passe de moins de 12 caractères est refusé');
ok(C.lireComptes({ NOA_ADMIN_UTILISATEUR: 'moi', NOA_ADMIN_MDP: 'un-mot-de-passe-long' }).comptes.get('moi').role === 'admin', 'raccourci NOA_ADMIN_*');
ok(C.lireComptes({ NOA_MDP_ATELIER: 'ancien-mot-de-passe' }).comptes.has('atelier'), 'ancien dispositif conservé seul');
ok(!C.lireComptes({ NOA_COMPTES: `bayla:admin:${e1}`, NOA_MDP_ATELIER: 'ancien' }).comptes.has('atelier'), "l'ancien mot de passe est ignoré dès qu'il y a de vrais comptes");

// 2. Moteur : verrouillage
let t = 1000; const m = C.creer(lu.comptes, { maintenant: () => t, essais: 3, verrouMs: 60000 });
ok(m.connecter('bayla', 'faux', '1.1.1.1').raison === 'refuse', 'mauvais mot de passe refusé');
ok(m.connecter('inconnu', 'mot-de-passe-long-1', '1.1.1.1').raison === 'refuse', 'utilisateur inconnu refusé');
m.connecter('bayla', 'faux', '4.4.4.4'); m.connecter('bayla', 'faux', '5.5.5.5');
ok(m.connecter('bayla', 'mot-de-passe-long-1', '2.2.2.2').raison === 'verrouille', "après 3 échecs le compte est verrouillé, même avec le bon mot de passe");
t += 61000;
ok(m.connecter('bayla', 'mot-de-passe-long-1', '2.2.2.2').ok, 'le verrou se lève après la durée');
const sess = m.connecter('fred', 'mot-de-passe-long-2', '3.3.3.3');
ok(sess.ok && m.session(sess.jeton).role === 'opticien', 'session ouverte avec son rôle');
m.fermer(sess.jeton); ok(!m.session(sess.jeton), 'session fermée');

// 3. Serveur réel
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noa-cpt-'));
Object.assign(process.env, { NOA_CLE_BORNE: 'cle-borne-test', NOA_COMPTES: env.NOA_COMPTES, NOA_DONNEES: tmp, NOA_PORT: '8941', NOA_ORIGINES: 'https://x.test' });
delete process.env.NOA_MDP_ATELIER;
const { app, db } = require('./serveur.js'); const srv = http.createServer(app);
(async () => {
  await new Promise(r => srv.listen(8942, r));
  const base = 'http://127.0.0.1:8942';
  const req = (p, o = {}) => fetch(base + p, { ...o, headers: { 'Content-Type': 'application/json', ...(o.headers || {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  const login = async (u, mdp) => { const r = await req('/api/connexion', { method: 'POST', body: { utilisateur: u, motdepasse: mdp } }); return { st: r.status, j: await r.json() }; };
  const H = j => ({ 'X-NOA-Session': j });
  const A = await login('bayla', 'mot-de-passe-long-1'), O = await login('fred', 'mot-de-passe-long-2');
  ok(A.st === 200 && A.j.role === 'admin' && A.j.jeton && A.j.utilisateur === 'bayla', 'connexion admin');
  ok(O.st === 200 && O.j.role === 'opticien' && O.j.boutique === 'dakar-plateau', 'connexion opticien avec sa boutique');
  ok((await login('bayla', 'mauvais')).st === 401, 'mauvais mot de passe : 401');
  ok((await req('/api/flotte')).status === 401, 'sans session : 401');
  // dossiers de deux boutiques
  for (const [id, bq] of [['D1', 'dakar-plateau'], ['D2', 'thies']]) {
    const r = await req('/dossiers', { method: 'POST', headers: { 'X-NOA-Cle': 'cle-borne-test' }, body: { id, nom: 'Client ' + id, tel: '770000000', boutique: bq, monture: 'cube' } });
    ok(r.status === 200, 'dépôt du dossier ' + id);
  }
  const liste = async j => (await (await req('/api/dossiers', { headers: H(j) })).json()).dossiers.map(d => d.id).sort().join();
  ok(await liste(A.j.jeton) === 'D1,D2', "l'admin voit les deux boutiques");
  ok(await liste(O.j.jeton) === 'D1', "l'opticien ne voit que sa boutique");
  ok((await req('/api/dossiers/D2', { headers: H(O.j.jeton) })).status === 404, "l'opticien ne peut pas ouvrir un dossier d'une autre boutique");
  ok((await req('/api/dossiers/D1', { headers: H(O.j.jeton) })).status === 200, "l'opticien ouvre un dossier de sa boutique");
  ok((await req('/api/dossiers/D2/note', { method: 'POST', headers: H(O.j.jeton), body: { texte: 'x' } })).status === 404, "pas de note sur un dossier d'une autre boutique");
  ok((await req('/api/dossiers/D2/etat', { method: 'POST', headers: H(O.j.jeton), body: { etat: 'en_fabrication' } })).status === 404, "pas de changement d'état hors boutique");
  ok((await req('/api/dossiers/D1/etat', { method: 'POST', headers: H(O.j.jeton), body: { etat: 'en_fabrication' } })).status === 200, "l'opticien change l'état dans sa boutique");
  const csv = await (await req('/api/dossiers.csv?boutique=thies', { headers: H(O.j.jeton) })).text();
  ok(csv.includes('D1') && !csv.includes('D2'), "le CSV d'un opticien reste dans sa boutique, même si l'URL demande une autre");
  for (const [p, o] of [['/api/flotte', {}], ['/api/reglages', {}], ['/api/ventes/stats', {}], ['/api/audit', {}], ['/api/mesures/stats', {}], ['/api/commandes', {}], ['/api/etat', {}]])
    ok((await req(p, { ...o, headers: H(O.j.jeton) })).status === 403, "l'opticien est refusé sur " + p);
  for (const p of ['/api/flotte', '/api/reglages', '/api/audit']) ok((await req(p, { headers: H(A.j.jeton) })).status === 200, "l'admin passe sur " + p);
  const moi = await (await req('/api/moi', { headers: H(O.j.jeton) })).json();
  ok(moi.utilisateur === 'fred' && moi.role === 'opticien', '/api/moi');
  const aud = await (await req('/api/audit', { headers: H(A.j.jeton) })).json();
  ok(aud.lignes.some(l => l.qui === 'fred' && l.action === 'etat') && !aud.lignes.some(l => l.qui === 'atelier'), "le journal porte le nom de la personne");
  await req('/api/deconnexion', { method: 'POST', headers: H(O.j.jeton) });
  ok((await req('/api/moi', { headers: H(O.j.jeton) })).status === 401, 'déconnexion : la session ne marche plus');
  // verrouillage réel
  for (let i = 0; i < 5; i++) await login('fred', 'faux' + i);
  ok((await login('fred', 'mot-de-passe-long-2')).st === 429, 'verrouillage après 5 échecs : 429');
  srv.close();
  // 4. refus de démarrer
  const sansCompte = spawnSync(process.execPath, ['-e', "require('./serveur.js')"], { cwd: __dirname, env: { PATH: process.env.PATH, NOA_CLE_BORNE: 'x', NOA_DONNEES: tmp, NOA_PORT: '8943' }, encoding: 'utf8' });
  ok(sansCompte.status === 1 && /Aucun compte/.test(sansCompte.stderr), 'sans aucun compte, le serveur refuse de démarrer');
  if (ec.length) { console.error('ÉCHEC\n - ' + ec.join('\n - ')); process.exit(1); }
  console.log('COMPTES OK : connexion, rôles, boutique, verrouillage, journal, refus de démarrer'); process.exit(0);
})();
