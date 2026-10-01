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
process.env.NOA_ORIGINES    = 'https://bayla-amadou.github.io';

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


  // ── 5. LA FLOTTE ─────────────────────────────────────────────────
  const sig = (b, h) => req('/bornes/signe', { method:'POST', headers:h === undefined ? cle : h, body:b });
  const sansCleSigne = await sig({ borne:'dakar-1', build:'BG' }, {});
  if (sansCleSigne.status !== 401) ec.push('un signe de vie passe sans clé');
  const s1 = await (await sig({ borne:'dakar-1', boutique:'plateau', build:'BG', uptime_s:5000, camera:'ok', cameras:1, images:900, file_attente:0, memoire_mo:480, session:true, collecte:true })).json();
  await sig({ borne:'dakar-2', boutique:'plateau', build:'BH', camera:'perdue', cameras:1, file_attente:35, memoire_mo:2200 });
  await sig({ borne:'dakar-3', boutique:'almadies', build:'BH', camera:'absente', cameras:0 });
  await sig({ borne:'dakar-4', build:'BH', maj:'prete', maj_version:'1.0.2', cameras:1 });
  await sig({ borne:'dakar-5', build:'BH', maj:'rm -rf', maj_version:'<script>', cameras:1 });
  const mauvaisNom = await sig({ borne:'../etc/passwd', build:'BG' });
  res.flotte_base = { signe_ok:s1.ok, nom_piege:mauvaisNom.status };
  if (mauvaisNom.status !== 400) ec.push('un nom de borne piégé est accepté');
  const flMaj = await (await req('/api/flotte', { headers:sess })).json();
  const d4 = flMaj.bornes.find(b => b.nom === 'dakar-4'), d5 = flMaj.bornes.find(b => b.nom === 'dakar-5');
  res.maj = { prete:d4.etat.maj, version:d4.etat.maj_version, alerte:d4.alertes.some(a => /1\.0\.2 prête/.test(a.texte)), piege:[d5.etat.maj, d5.etat.maj_version] };
  if (d4.etat.maj !== 'prete' || !d4.alertes.some(a => /1\.0\.2 prête/.test(a.texte))) ec.push('la mise à jour prête n\'est pas signalée');
  if (d5.etat.maj !== null || d5.etat.maj_version !== null) ec.push('un état de mise à jour piégé est accepté');

  // Statuts selon le silence
  db.prepare(`UPDATE bornes SET derniere_vue=datetime('now','-5 minutes') WHERE nom='dakar-2'`).run();
  db.prepare(`UPDATE bornes SET derniere_vue=datetime('now','-30 minutes') WHERE nom='dakar-3'`).run();
  const fl = await (await req('/api/flotte', { headers:sess })).json();
  const par = Object.fromEntries(fl.bornes.map(b => [b.nom, b]));
  res.flotte = { dakar1:par['dakar-1'].statut, dakar2:par['dakar-2'].statut, dakar3:par['dakar-3'].statut, build_recent:fl.build_recent,
                 alertes_d2:par['dakar-2'].alertes.map(a => a.texte), alertes_d3:par['dakar-3'].alertes.map(a => a.texte) };
  if (par['dakar-1'].statut !== 'en_ligne') ec.push('une borne qui vient de signaler n\'est pas en ligne');
  if (par['dakar-2'].statut !== 'retard') ec.push('5 minutes de silence ne donnent pas « retard »');
  if (par['dakar-3'].statut !== 'hors_ligne') ec.push('30 minutes de silence ne donnent pas « hors ligne »');
  if (!par['dakar-2'].alertes.some(a => /Caméra perdue/.test(a.texte))) ec.push('la caméra perdue n\'est pas signalée');
  if (!par['dakar-2'].alertes.some(a => /en attente d'envoi/.test(a.texte))) ec.push('la file d\'attente trop longue n\'est pas signalée');
  if (!par['dakar-1'].alertes.some(a => /Version BG/.test(a.texte))) ec.push('la borne en retard de version n\'est pas signalée');
  const flSansSession = await req('/api/flotte');
  if (flSansSession.status !== 401) ec.push('la flotte est lisible sans session');

  // Commandes : liste fermée, une seule livraison, accusé
  const cmdMauvaise = await req('/api/commande', { method:'POST', headers:sess, body:{ borne:'dakar-1', action:'rm -rf /' } });
  const cmdInconnue = await req('/api/commande', { method:'POST', headers:sess, body:{ borne:'borne-fantome', action:'redemarrer' } });
  const cmdSansSession = await req('/api/commande', { method:'POST', body:{ borne:'dakar-1', action:'redemarrer' } });
  const cmd = await (await req('/api/commande', { method:'POST', headers:sess, body:{ borne:'dakar-1', action:'recharger' } })).json();
  const recu1 = await (await sig({ borne:'dakar-1', build:'BG' })).json();
  const recu2 = await (await sig({ borne:'dakar-1', build:'BG' })).json();
  await req('/bornes/accuse', { method:'POST', headers:cle, body:{ id:cmd.id, ok:true, resultat:'rechargee' } });
  const lst = await (await req('/api/commandes', { headers:sess })).json();
  res.commandes = { action_piegee:cmdMauvaise.status, borne_inconnue:cmdInconnue.status, sans_session:cmdSansSession.status,
                    livree_une_fois:[recu1.commandes.length, recu2.commandes.length], accuse:lst.commandes[0].resultat };
  if (cmdMauvaise.status !== 400) ec.push('une commande hors liste est acceptée');
  if (cmdInconnue.status !== 404) ec.push('une commande vers une borne inconnue est acceptée');
  if (cmdSansSession.status !== 401) ec.push('une commande passe sans session');
  if (recu1.commandes.length !== 1 || recu1.commandes[0].action !== 'recharger') ec.push('la borne ne reçoit pas sa commande');
  if (recu2.commandes.length !== 0) ec.push('une commande est livrée deux fois');
  if (lst.commandes[0].resultat !== 'rechargee') ec.push('l\'accusé de réception n\'est pas enregistré');
  // Une commande périmée (borne éteinte plus d'une heure) disparaît
  db.prepare(`INSERT INTO commandes (borne, action, cree_le) VALUES ('dakar-1','redemarrer',datetime('now','-2 hours'))`).run();
  const periml = await (await sig({ borne:'dakar-1', build:'BG' })).json();
  if (periml.commandes.length !== 0) ec.push('une commande périmée est livrée à la borne');

  // Mesures : validation côté serveur, dédoublonnage
  const bonne = { id:'a1b2c3d4e5f6', borne:'dakar-1', jour:new Date().toISOString().slice(0,10), heure:17, duree_s:90, images:900, part_suit:0.7, effacements:3, k_tete:1.18, pd_mm:63, lumiere:0.3, issue:'arrete', forme:'ovale' };
  const piege = { id:'ffffffffffff', borne:'dakar-1', jour:bonne.jour, heure:10, duree_s:90, images:900, nom:'Amadou Diallo', forme:'Amadou Diallo' };
  const sansId = { duree_s:90, images:900 };
  const m1 = await (await req('/mesures', { method:'POST', headers:cle, body:{ lignes:[bonne, piege, sansId] } })).json();
  const m2 = await (await req('/mesures', { method:'POST', headers:cle, body:{ lignes:[bonne] } })).json();
  const stocke = db.prepare("SELECT donnees FROM mesures WHERE id='ffffffffffff'").get();
  res.mesures = { premiere_reception:m1.recues, renvoi:m2.recues, nom_conserve: stocke ? /Amadou/.test(stocke.donnees) : null };
  if (m1.recues !== 2) ec.push(`la réception de mesures attendait 2 lignes valides, a reçu ${m1.recues}`);
  if (m2.recues !== 0) ec.push('un renvoi de mesures se duplique');
  if (stocke && /Amadou/.test(stocke.donnees)) ec.push('un nom a traversé la validation des mesures');
  const sansCleMes = await req('/mesures', { method:'POST', body:{ lignes:[bonne] } });
  if (sansCleMes.status !== 401) ec.push('des mesures passent sans clé');
  const st = await (await req('/api/mesures/stats?jours=30', { headers:sess })).json();
  res.stats = { n:st.n, degrades:st.degrades, k_haut:st.k.hors_plage_haut, heure17:st.par_heure[17] };
  if (st.n !== 2 || st.degrades !== 1 || st.k.hors_plage_haut !== 1 || st.par_heure[17].degrades !== 1) ec.push('les statistiques ne comptent pas juste');

  // CORS : seulement l'origine autorisée
  const corsOk = await fetch(base + '/api/flotte', { method:'OPTIONS', headers:{ Origin:'https://bayla-amadou.github.io', 'Access-Control-Request-Method':'GET' } });
  const corsMal = await fetch(base + '/api/flotte', { method:'OPTIONS', headers:{ Origin:'https://site-malveillant.example', 'Access-Control-Request-Method':'GET' } });
  res.cors = { autorise:corsOk.headers.get('access-control-allow-origin'), autre:corsMal.headers.get('access-control-allow-origin') };
  if (res.cors.autorise !== 'https://bayla-amadou.github.io') ec.push('l\'origine du tableau de bord n\'est pas autorisée');
  if (res.cors.autre) ec.push('une origine étrangère reçoit des en-têtes CORS');

  console.log(JSON.stringify({ ...res, resultat: ec.length?'ÉCHEC':'OK', echecs:ec }, null, 1));
  srv.close(); process.exit(ec.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e.stack); process.exit(1); });
