/**
 * Banc du serveur de dossiers. Ce qu'on vérifie, dans l'ordre d'importance :
 *   1. la clé de borne est exigée, et une clé fausse est refusée ;
 *   2. un dossier renvoyé deux fois ne se duplique pas ;
 *   3. le cycle de vie avance et s'enregistre ;
 *   4. LA PURGE : les photos partent après la livraison, et SEULEMENT après.
 *      C'est la promesse faite au client, c'est donc ce qu'il faut prouver.
 */
const fs=require('fs'), os=require('os'), path=require('path'), http=require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noa-srv-'));
process.env.NOA_CLE_BORNE   = 'cle-borne-test';
process.env.NOA_MDP_ATELIER = 'mdp-atelier-test';
process.env.NOA_DONNEES     = tmp;
process.env.NOA_PURGE_JOURS = '30';
process.env.NOA_PORT        = '8901';

const { app, db, purger, photosDe } = require('./serveur.js');
const srv = http.createServer(app);
const PORT = 8902;
const base = 'http://127.0.0.1:' + PORT;

const req = (chemin, opts={}) => fetch(base+chemin, {
  ...opts, headers:{ 'Content-Type':'application/json', ...(opts.headers||{}) },
  body: opts.body ? JSON.stringify(opts.body) : undefined });

const img = (txt) => Buffer.from(txt).toString('base64');

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const res = {}, ec = [];

  // ── 1. La clé ────────────────────────────────────────────────────
  const sansCle = await req('/dossiers', { method:'POST', body:{ id:'X', nom:'A', tel:'1' } });
  const mauvaise = await req('/dossiers', { method:'POST',
    headers:{ 'X-NOA-Cle':'pas-la-bonne' }, body:{ id:'X', nom:'A', tel:'1' } });
  res.cle = { sans_cle: sansCle.status, mauvaise_cle: mauvaise.status };
  if (sansCle.status !== 401) ec.push('un dossier passe sans clé');
  if (mauvaise.status !== 401) ec.push('une clé fausse est acceptée');

  // ── 2. Dépôt, puis renvoi du même dossier ────────────────────────
  const dossier = { id:'C1001', nom:'Amadou Diallo', tel:'770000001',
    monture:'Cube', extras:['Express'], paiement:'Wave', montant:45000,
    pd_mm:63.5, faceWidth_cm:14.2, faceShape:'ovale',
    date:new Date().toISOString(), boutique:'dakar-plateau',
    photos:{ ordonnance: img('ORDONNANCE-C1001'), essai: img('PORTRAIT-C1001') } };
  const cle = { 'X-NOA-Cle':'cle-borne-test' };
  const d1 = await (await req('/dossiers', { method:'POST', headers:cle, body:dossier })).json();
  const d2 = await (await req('/dossiers', { method:'POST', headers:cle, body:dossier })).json();
  const n = db.prepare("SELECT COUNT(*) n FROM dossiers WHERE id='C1001'").get().n;
  res.depot = { accepte:d1.ok, renvoi_accepte:d2.ok, lignes:n,
                photos: photosDe('C1001').map(p=>p.nom).sort().join(','),
                ordonnance_intacte: fs.readFileSync(
                  photosDe('C1001').find(p=>p.nom==='ordonnance').chemin, 'utf8') === 'ORDONNANCE-C1001' };
  if (n !== 1) ec.push(`un renvoi duplique le dossier (${n} lignes)`);
  if (res.depot.photos !== 'essai,ordonnance') ec.push('les photos ne sont pas enregistrées');
  if (!res.depot.ordonnance_intacte) ec.push('la photo est arrivée abîmée');

  // ── 3. L'atelier ─────────────────────────────────────────────────
  const refuse = await req('/api/connexion', { method:'POST', body:{ motdepasse:'faux' } });
  const co = await (await req('/api/connexion', { method:'POST',
    body:{ motdepasse:'mdp-atelier-test' } })).json();
  const sess = { 'X-NOA-Session': co.jeton };
  const sansSession = await req('/api/dossiers');
  const liste = await (await req('/api/dossiers', { headers:sess })).json();
  res.atelier = { mdp_faux:refuse.status, connecte:!!co.jeton,
                  sans_session:sansSession.status, dossiers:liste.dossiers.length,
                  photos_dans_la_liste: JSON.stringify(liste).includes('ORDONNANCE') };
  if (refuse.status !== 401) ec.push('un mot de passe faux ouvre l\'atelier');
  if (sansSession.status !== 401) ec.push('la liste est lisible sans session');
  if (res.atelier.photos_dans_la_liste) ec.push('les images voyagent dans la liste');

  for (const e of ['en_fabrication','pret','livre'])
    await req('/api/dossiers/C1001/etat', { method:'POST', headers:sess, body:{ etat:e } });
  const apres = db.prepare("SELECT etat, livre_le FROM dossiers WHERE id='C1001'").get();
  res.cycle = { etat:apres.etat, date_livraison: !!apres.livre_le,
                journal: db.prepare("SELECT COUNT(*) n FROM journal WHERE id='C1001'").get().n };
  if (apres.etat !== 'livre') ec.push('le cycle de vie n\'avance pas');
  if (!apres.livre_le) ec.push('la date de livraison n\'est pas posée');

  // ── 4. LA PURGE ──────────────────────────────────────────────────
  // Livré à l'instant : rien ne doit partir.
  const n0 = purger();
  res.purge_trop_tot = { efface:n0, photos_encore_la: photosDe('C1001').length };
  if (n0 !== 0) ec.push('les photos sont effacées avant le délai');
  if (photosDe('C1001').length !== 2) ec.push('des photos ont disparu trop tôt');

  // Un dossier livré il y a 31 jours : celui-là doit partir.
  db.prepare("UPDATE dossiers SET livre_le=datetime('now','-31 days') WHERE id='C1001'").run();
  const n1 = purger();
  const ligne = db.prepare("SELECT * FROM dossiers WHERE id='C1001'").get();
  res.purge = { efface:n1, photos_restantes: photosDe('C1001').length,
                dossier_conserve: !!ligne, nom_conserve: ligne && ligne.nom,
                pd_conserve: ligne && ligne.pd_mm, date_purge: !!ligne.purge_le };
  if (n1 !== 1) ec.push('la purge ne se déclenche pas après le délai');
  if (photosDe('C1001').length !== 0) ec.push('des photos survivent à la purge');
  if (!ligne) ec.push('la purge a supprimé le dossier entier, pas seulement les photos');
  if (ligne && ligne.pd_mm !== 63.5) ec.push('les mesures ont été perdues avec les photos');

  // Un dossier non livré ne part jamais, quel que soit son âge.
  await req('/dossiers', { method:'POST', headers:cle, body:{
    ...dossier, id:'C1002', photos:{ ordonnance: img('VIEUX') } } });
  db.prepare("UPDATE dossiers SET recu_le=datetime('now','-400 days') WHERE id='C1002'").run();
  purger();
  res.non_livre = { photos: photosDe('C1002').length };
  if (photosDe('C1002').length !== 1)
    ec.push('un dossier non livré a été purgé : des verres en attente perdraient leur ordonnance');

  // Et la borne qui renvoie un dossier déjà purgé ne le ressuscite pas.
  await req('/dossiers', { method:'POST', headers:cle, body:dossier });
  res.renvoi_apres_purge = { photos: photosDe('C1001').length };
  if (photosDe('C1001').length !== 0)
    ec.push('un renvoi de la borne fait revenir des photos effacées');

  console.log(JSON.stringify({ ...res, resultat: ec.length?'ÉCHEC':'OK', echecs:ec }, null, 1));
  srv.close(); process.exit(ec.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e.stack); process.exit(1); });
