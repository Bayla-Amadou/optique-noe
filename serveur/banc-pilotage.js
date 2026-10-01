/**
 * Banc du pilotage : dossiers des patients, ventes, réglages des bornes, audit.
 * Les réglages sont ce qui part vers les bornes : on vérifie surtout qu'un
 * réglage absurde ou piégé ne peut PAS passer, et que les chiffres affichés
 * aux dirigeants sont justes.
 *   node banc-pilotage.js
 */
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noa-pil-'));
Object.assign(process.env, { NOA_CLE_BORNE:'cle-b', NOA_MDP_ATELIER:'mdp-a', NOA_DONNEES:tmp, NOA_PORT:'8951' });
const { app, db } = require('./serveur.js');
const { validerReglages, fusion } = require('./pilotage.js');
const srv = http.createServer(app), PORT = 8952, base = 'http://127.0.0.1:' + PORT;
const ec = []; const ok = (c, m) => { if (!c) ec.push(m); };
const R = (p, o = {}) => fetch(base + p, { ...o, headers:{ 'Content-Type':'application/json', ...(o.headers || {}) }, body:o.body ? JSON.stringify(o.body) : undefined });
const J = async (p, o) => (await R(p, o)).json();
const img = t => Buffer.from(t).toString('base64');

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const cle = { 'X-NOA-Cle':'cle-b' };
  const { jeton } = await J('/api/connexion', { method:'POST', body:{ motdepasse:'mdp-a' } });
  const S = { 'X-NOA-Session':jeton };
  const res = {};

  // ── 1. Le validateur de réglages ─────────────────────────────────
  const v = validerReglages({
    maintenance:{ actif:true, message:'<script>alert(1)</script>Revenons vite' + 'x'.repeat(300) },
    prix:{ base:25000, express:5000, spray:-5, inconnu:1 }, inactivite_s:5, paiements:{ wave:false },
    horaires:{ actif:true, debut:'08:00', fin:'25:99', jours:[1, 2, 9, 'a'] },
    catalogue:{ masquees:['cube', '../../etc', 'frame01', 42] },
    suivi:{ k_min:0.5, k_max:1.2, fondu_debut_cm:-6, fondu_fin_cm:-5, maintien_ms:99999 },
    redemarrage:'4h', mise_a_jour:{ autorisee:false }, commande:'rm -rf /', collecte:true,
  });
  res.validateur = v;
  ok(!/[<>]/.test(v.maintenance.message) && v.maintenance.message.length <= 160, 'le message de maintenance n\'est pas nettoyé');
  ok(v.prix.base === 25000 && v.prix.express === 5000 && v.prix.spray === undefined && v.prix.inconnu === undefined, 'les prix hors bornes ne sont pas écartés');
  ok(v.inactivite_s === undefined, 'une inactivité de 5 s est acceptée');
  ok(v.paiements.wave === false && v.paiements.orange === true, 'les paiements ne sont pas lus');
  ok(v.horaires === undefined, 'des horaires invalides (fin 25:99) sont acceptés');
  ok(JSON.stringify(v.catalogue.masquees) === '["cube","frame01"]', 'le catalogue accepte un identifiant piégé');
  ok(v.suivi.k_min === undefined && v.suivi.k_max === 1.2 && v.suivi.maintien_ms === undefined && v.suivi.fondu_fin_cm === undefined, 'les réglages du suivi hors bornes passent : ' + JSON.stringify(v.suivi));
  ok(v.redemarrage === undefined, 'une heure de redémarrage mal formée est acceptée');
  ok(v.commande === undefined && v.collecte === undefined, 'un champ inconnu traverse la validation');
  const f = fusion({ prix:{ base:25000, express:5000 }, accueil:{ message:'a' } }, { prix:{ express:3000 } });
  ok(f.prix.base === 25000 && f.prix.express === 3000 && f.accueil.message === 'a', 'la fusion borne/global est fausse');

  // ── 2. Réglages par l'API, jusqu'à la borne ──────────────────────
  const sansSession = await R('/api/reglages', { method:'POST', body:{ portee:'global', donnees:{} } });
  ok(sansSession.status === 401, 'les réglages s\'écrivent sans session');
  const portee = await R('/api/reglages', { method:'POST', headers:S, body:{ portee:'../x', donnees:{} } });
  ok(portee.status === 400, 'une portée piégée est acceptée');
  const g1 = await J('/api/reglages', { method:'POST', headers:S, body:{ portee:'global', donnees:{ prix:{ base:25000, express:5000 }, accueil:{ message:'Bienvenue' } } } });
  const g1bis = await J('/api/reglages', { method:'POST', headers:S, body:{ portee:'global', donnees:{ prix:{ base:25000, express:5000 }, accueil:{ message:'Bienvenue' } } } });
  ok(g1bis.version === g1.version, 'écrire deux fois la même chose change la version');
  const g2 = await J('/api/reglages', { method:'POST', headers:S, body:{ portee:'borne:dakar-1', donnees:{ prix:{ express:3000 }, maintenance:{ actif:true, message:'Je reviens' } } } });
  ok(g2.version === g1.version + 1, 'la version n\'avance pas à chaque changement');
  const sig = await J('/bornes/signe', { method:'POST', headers:cle, body:{ borne:'dakar-1', build:'BI', reglages_version:g1.version } });
  const sig2 = await J('/bornes/signe', { method:'POST', headers:cle, body:{ borne:'dakar-2', build:'BI', reglages_version:g2.version } });
  res.reglages_recus = { dakar1:sig.reglages, dakar2:sig2.reglages.donnees.prix };
  ok(sig.reglages.donnees.prix.base === 25000 && sig.reglages.donnees.prix.express === 3000 && sig.reglages.donnees.maintenance.actif === true, 'la borne ne reçoit pas global + sa surcharge');
  ok(sig2.reglages.donnees.prix.express === 5000 && !sig2.reglages.donnees.maintenance, 'une autre borne reçoit les réglages d\'une borne voisine');
  const fl = await J('/api/flotte', { headers:S }), d1 = fl.bornes.find(b => b.nom === 'dakar-1'), d2 = fl.bornes.find(b => b.nom === 'dakar-2');
  ok(d1.reglages_a_jour === false && d1.alertes.some(a => /Réglages en attente/.test(a.texte)), 'la borne en retard de réglages n\'est pas signalée');
  ok(d2.reglages_a_jour === true, 'la borne à jour est vue en retard');
  const rg = await J('/api/reglages', { headers:S });
  ok(rg.global.accueil.message === 'Bienvenue' && rg.bornes['dakar-1'].maintenance.actif === true, 'GET /api/reglages ne rend pas ce qui est stocké');

  const cat = await J('/bornes/signe', { method:'POST', headers:cle, body:{ borne:'dakar-3', build:'BI', catalogue:[{ id:'cube', name:'Cube <b>' }, { id:'../x', name:'piégé' }, { id:'frame01', name:'Frame 01' }, 'texte'] } });
  const flc = await J('/api/flotte', { headers:S }); const c3 = flc.bornes.find(b => b.nom === 'dakar-3');
  ok(JSON.stringify(c3.etat.catalogue) === '[{"id":"cube","name":"Cube b"},{"id":"frame01","name":"Frame 01"}]', 'le catalogue d\'une borne n\'est pas nettoyé : ' + JSON.stringify(c3.etat.catalogue));

  // ── 3. Dossiers ──────────────────────────────────────────────────
  const dossier = (id, o) => ({ id, nom:'Client ' + id, tel:'77000' + id.slice(-4), monture:'Cube', extras:[], paiement:'Wave', montant:25000, pd_mm:62, faceWidth_cm:14, faceShape:'ovale', boutique:'Plateau', borne:'dakar-1', date:new Date().toISOString(), photos:{ ordonnance:img('ORD-' + id), essai:img('ESSAI-' + id) }, ...o });
  const lot = [
    dossier('D0001', { nom:'Amadou Diallo', tel:'771234567', extras:['Option Express 48h'], montant:30000 }),
    dossier('D0002', { nom:'Fatou Ndiaye', tel:'781112233', paiement:'Orange', monture:'Frame 01', boutique:'Almadies', borne:'almadies-1' }),
    dossier('D0003', { nom:'=HYPERLINK("http://x")', tel:'700000003', extras:['Spray nettoyant', 'Option Express 48h'], montant:31000 }),
    dossier('D0004', { nom:'Moussa Sow', tel:'761231234', paiement:'Orange', monture:'Frame 01' }),
    dossier('D0005', { nom:'Awa Fall', tel:'779998877' }),
  ];
  for (const d of lot) await R('/dossiers', { method:'POST', headers:cle, body:d });
  db.prepare("UPDATE dossiers SET recu_le=datetime('now','-40 days') WHERE id='D0005'").run();       // période précédente
  db.prepare("UPDATE dossiers SET recu_le=datetime('now','-10 days'), etat='en_fabrication' WHERE id='D0004'").run();   // en retard
  for (const [id, e, h] of [['D0001', 'livre', 48], ['D0002', 'livre', 24]]) {
    await R('/api/dossiers/' + id + '/etat', { method:'POST', headers:S, body:{ etat:e } });
    db.prepare("UPDATE dossiers SET recu_le=datetime('now', ?), livre_le=datetime('now') WHERE id=?").run(`-${h} hours`, id);
  }
  const liste = await J('/api/dossiers', { headers:S });
  res.liste = { total:liste.total, photos_dans_la_liste:JSON.stringify(liste).includes('ORD-') };
  ok(liste.total === 5 && !res.liste.photos_dans_la_liste, 'la liste est fausse ou embarque des images');
  const q = async s => (await J('/api/dossiers?' + s, { headers:S }));
  ok((await q('q=amadou')).total === 1, 'recherche par nom');
  ok((await q('q=781112')).total === 1, 'recherche par téléphone');
  ok((await q('q=frame')).total === 2, 'recherche par monture');
  ok((await q('etat=livre')).total === 2, 'filtre par état');
  ok((await q('boutique=Almadies')).total === 1, 'filtre par boutique');
  ok((await q('limite=2')).dossiers.length === 2 && (await q('limite=2&decalage=4')).dossiers.length === 1, 'pagination');
  ok((await q('q=' + encodeURIComponent("%' OR 1=1 --"))).total === 0, 'une recherche piégée renvoie des dossiers');
  const det = await J('/api/dossiers/D0001', { headers:S });
  res.detail = { photos:det.dossier.photos, journal:det.journal.map(j => j.action) };
  ok(det.dossier.tel === '771234567' && det.dossier.photos.length === 2 && det.journal.length >= 2, 'le détail d\'un dossier est incomplet');
  ok((await R('/api/dossiers/INCONNU', { headers:S })).status === 404, 'dossier inconnu');
  const nb = await R('/api/dossiers/D0001/note', { method:'POST', headers:S, body:{ texte:'Client rappelé, vient jeudi <b>' } });
  const nv = await R('/api/dossiers/D0001/note', { method:'POST', headers:S, body:{ texte:'   ' } });
  ok(nb.status === 200 && nv.status === 400, 'les notes : vide refusée, valide acceptée');
  const det2 = await J('/api/dossiers/D0001', { headers:S });
  ok(det2.notes.length === 1 && !/[<>]/.test(det2.notes[0].texte), 'la note n\'est pas nettoyée');
  for (const chemin of ['/api/dossiers', '/api/dossiers/D0001', '/api/dossiers.csv', '/api/photo/D0001/ordonnance', '/api/ventes/stats', '/api/audit', '/api/reglages']) {
    ok((await R(chemin)).status === 401, chemin + ' est lisible sans session');
  }
  const photo = await fetch(base + '/api/photo/D0001/ordonnance', { headers:S });
  ok(photo.status === 200 && (await photo.text()) === 'ORD-D0001', 'la photo d\'ordonnance n\'est pas servie intacte');
  const rcsv = await R('/api/dossiers.csv?q=D000', { headers:S });
  const octets = Buffer.from(await rcsv.arrayBuffer()), csv = octets.toString('utf8').replace(/^\ufeff/, '');
  res.csv = csv.split('\n').slice(0, 2);
  ok(octets[0] === 0xEF && octets[1] === 0xBB && octets[2] === 0xBF, 'le CSV n\'a pas de BOM (Excel casserait les accents)');
  ok(csv.includes('"\'=HYPERLINK'), 'le CSV laisse passer une formule de tableur');
  ok(!/^=/m.test(csv.split('\n').slice(1).join('\n')), 'une ligne de CSV commence par =');

  // ── 4. Ventes ────────────────────────────────────────────────────
  const jour = new Date().toISOString().slice(0, 10);
  db.prepare("INSERT INTO mesures (id, borne, jour, heure, donnees) VALUES (?,?,?,?,?)");
  for (let i = 0; i < 10; i++) db.prepare('INSERT INTO mesures (id, borne, jour, heure, donnees) VALUES (?,?,?,?,?)').run('m' + i, 'dakar-1', jour, 10, JSON.stringify({ duree_s:60, images:500, issue:i < 4 ? 'choisi' : 'arrete' }));
  const st = await J('/api/ventes/stats?jours=30', { headers:S });
  res.ventes = { commandes:st.commandes, ca:st.ca, panier:st.panier_moyen, precedent:st.precedent, delai_h:st.delai_livraison_h, conversion:st.conversion, paiements:st.par_paiement.map(p => p.nom + ':' + p.n), retard:st.en_retard.map(r => r.id), jours:st.par_jour.length };
  ok(st.commandes === 4 && st.ca === 25000 * 3 + 31000 + 5000 - 5000 + 0 || st.ca === 111000, `CA attendu 111000 sur 4 commandes, obtenu ${st.ca} sur ${st.commandes}`);
  ok(st.panier_moyen === Math.round(st.ca / 4), 'panier moyen');
  ok(st.precedent.commandes === 1, 'la période précédente doit compter D0005 (il y a 40 jours)');
  ok(st.par_jour.length === 30 && st.par_jour.reduce((s, d) => s + d.n, 0) === 4, 'la courbe par jour doit avoir 30 points et 4 commandes');
  ok(st.avec_express === 2 && st.avec_spray === 1, 'extras : express 2, spray 1');
  ok(st.par_paiement.find(p => p.nom === 'Wave').n === 2 && st.par_paiement.find(p => p.nom === 'Orange').n === 2, 'répartition Wave/Orange');
  ok(st.delai_livraison_h === 36, `délai moyen de livraison attendu 36 h (48 et 24), obtenu ${st.delai_livraison_h}`);
  ok(st.essayages === 10 && Math.abs(st.conversion - 0.4) < 1e-9, `conversion attendue 4/10, obtenue ${st.conversion}`);
  ok(st.en_retard.map(r => r.id).sort().join() === 'D0004,D0005', 'en retard attendu : D0004 (10 jours) et D0005 (40 jours), tous deux non livrés ; obtenu ' + st.en_retard.map(r => r.id));
  const stB = await J('/api/ventes/stats?jours=30&boutique=Almadies', { headers:S });
  ok(stB.commandes === 1, 'filtre boutique des ventes');
  ok((await J('/api/ventes/stats?jours=30&boutique=' + encodeURIComponent("' OR 1=1 --"), { headers:S })).commandes === 0, 'une boutique piégée renvoie des ventes');

  // ── 5. Audit ─────────────────────────────────────────────────────
  await R('/api/commande', { method:'POST', headers:S, body:{ borne:'dakar-1', action:'verifier_maj' } });
  const au = await J('/api/audit', { headers:S });
  const actions = au.lignes.map(l => l.action);
  res.audit = [...new Set(actions)];
  for (const a of ['reglages', 'etat', 'note', 'export_csv', 'commande']) ok(actions.includes(a), `l'action « ${a} » n'est pas dans le journal d'audit`);
  const cmdOk = await R('/api/commande', { method:'POST', headers:S, body:{ borne:'dakar-1', action:'verifier_maj' } });
  ok(cmdOk.status === 200, 'verifier_maj n\'est pas un ordre accepté');

  console.log(JSON.stringify({ ...res, resultat: ec.length ? 'ÉCHEC' : 'OK', echecs: ec }, null, 1));
  srv.close(); process.exit(ec.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e.stack); process.exit(1); });
