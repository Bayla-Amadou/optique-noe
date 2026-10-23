/**
 * Banc du SMS de confirmation : numéros, texte, fournisseurs (contre un FAUX serveur, pas le service réel),
 * et serveur complet : un SMS par commande, rien sans référence de paiement, plafonds, numéro invalide.
 * Lancer : node banc-sms.js
 */
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const S = require('./sms.js');
const ec = [], ok = (c, m) => { if (!c) ec.push(m); };

// 1. Numéros
const n = S.normaliser;
ok(n('77 123 45 67') === '+221771234567', 'numéro local avec espaces');
ok(n('+221 77 123 45 67') === '+221771234567' && n('00221771234567') === '+221771234567' && n('221771234567') === '+221771234567', 'formes +221 / 00221 / 221');
ok(n('771234567') === '+221771234567' && n('(77) 123-45-67') === '+221771234567', 'ponctuation ignorée');
ok(n('331234567') === null, 'un fixe (33…) ne reçoit pas de SMS');
ok(n('12345') === null && n('') === null && n(null) === null && n('abc') === null, 'numéros invalides refusés');
ok(n('+33612345678') === '+33612345678', 'un numéro étranger avec « + » est accepté');
ok(n('+221 12 345 67 89') === null, 'un +221 qui n\'est pas un mobile est refusé');

// 2. Texte : alphabet GSM, une seule partie
const t = S.texte({ id: 'NOA-123456', montant: 25000, monture: 'N.O.A 53-16' });
ok(t.includes('NOA-123456') && t.includes('25 000 FCFA') && t.includes('53-16'), 'le texte porte la référence, le montant et la monture');
const GSM = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà".split(''));
ok([...t].every(c => GSM.has(c)), 'texte en alphabet GSM (sinon le SMS tombe à 70 signes) : ' + [...t].filter(c => !GSM.has(c)).join(''));
ok(t.length <= 160, 'un seul SMS (' + t.length + ' signes)');
ok(!/[<>"]/.test(S.texte({ id: 'N"<x>', monture: '<b>x</b>' })), 'texte assaini');

// 3. Fournisseurs, requêtes contre un faux client HTTP
(async () => {
  const appels = [];
  const faux = rep => async (url, o, corps) => { appels.push({ url, o, corps }); return rep(url); };
  const tw = S.creer({ NOA_SMS_FOURNISSEUR: 'twilio', NOA_SMS_TWILIO_SID: 'ACx', NOA_SMS_TWILIO_TOKEN: 'tok', NOA_SMS_TWILIO_DE: '+15005550006' }, faux(() => ({ ok: true, statut: 201 })));
  const r1 = await tw.envoyer('+221771234567', 'bonjour');
  ok(r1.ok && appels[0].url.endsWith('/2010-04-01/Accounts/ACx/Messages.json') && /To=%2B221771234567/.test(appels[0].corps) && /Body=bonjour/.test(appels[0].corps), 'Twilio : adresse et corps');
  ok(appels[0].o.headers.Authorization === 'Basic ' + Buffer.from('ACx:tok').toString('base64'), 'Twilio : authentification');
  appels.length = 0;
  const or = S.creer({ NOA_SMS_FOURNISSEUR: 'orange', NOA_SMS_ORANGE_CLIENT_ID: 'id', NOA_SMS_ORANGE_CLIENT_SECRET: 'sec', NOA_SMS_ORANGE_EXPEDITEUR: '+221770000000' },
    faux(u => u.includes('/oauth/') ? { ok: true, statut: 200, corps: { access_token: 'JET', expires_in: 3600 } } : { ok: true, statut: 201 }));
  const r2 = await or.envoyer('+221771234567', 'bonjour'); await or.envoyer('+221771234567', 'encore');
  ok(r2.ok && appels.filter(a => a.url.includes('/oauth/')).length === 1, 'Orange : un seul jeton pour deux envois');
  const envoi = appels.find(a => a.url.includes('/smsmessaging/'));
  ok(envoi && envoi.o.headers.Authorization === 'Bearer JET' && JSON.parse(envoi.corps).outboundSMSMessageRequest.address === 'tel:+221771234567', 'Orange : requête d\'envoi');
  ok(!(await S.creer({ NOA_SMS_FOURNISSEUR: 'aucun' }).envoyer('+221771234567', 'x')).ok, 'sans fournisseur : rien n\'est envoyé');
  ok((await S.creer({ NOA_SMS_FOURNISSEUR: 'twilio' }, faux(() => ({ ok: true }))).envoyer('+221771234567', 'x')).raison === 'configuration_incomplete', 'configuration incomplète signalée');
  ok(!(await S.creer({ NOA_SMS_FOURNISSEUR: 'twilio', NOA_SMS_TWILIO_SID: 'a', NOA_SMS_TWILIO_TOKEN: 'b', NOA_SMS_TWILIO_DE: 'c' }, faux(() => ({ ok: false, statut: 400, brut: 'x' }))).envoyer('+221771234567', 'x')).ok, 'refus du fournisseur : échec');

  // 4. Serveur complet avec un faux Twilio local
  const recus = [];
  const fauxTwilio = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => { recus.push(b); s.writeHead(201, { 'Content-Type': 'application/json' }); s.end('{}'); }); });
  await new Promise(r => fauxTwilio.listen(8951, r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noa-sms-'));
  Object.assign(process.env, { NOA_CLE_BORNE: 'cle-borne-test', NOA_ADMIN_UTILISATEUR: 'admin', NOA_ADMIN_MDP: 'un-mot-de-passe-long', NOA_DONNEES: tmp, NOA_PORT: '8952',
    NOA_SMS_FOURNISSEUR: 'twilio', NOA_SMS_TWILIO_SID: 'ACtest', NOA_SMS_TWILIO_TOKEN: 'tok', NOA_SMS_TWILIO_DE: '+15005550006', NOA_SMS_TWILIO_URL: 'http://127.0.0.1:8951',
    NOA_SMS_MAX_HEURE: '3', NOA_SMS_MAX_NUMERO_JOUR: '2' });
  const { app, db } = require('./serveur.js'); const srv = http.createServer(app);
  await new Promise(r => srv.listen(8953, r));
  const base = 'http://127.0.0.1:8953', K = { 'X-NOA-Cle': 'cle-borne-test', 'Content-Type': 'application/json' };
  const post = (d) => fetch(base + '/dossiers', { method: 'POST', headers: K, body: JSON.stringify(d) });
  const etat = async id => (await (await fetch(base + '/dossiers/' + id + '/sms', { headers: K })).json()).etat;
  const attendre = async (id, v) => { for (let i = 0; i < 40; i++) { if ((await etat(id)) === v) return true; await new Promise(r => setTimeout(r, 50)); } return false; };

  await post({ id: 'NOA-1', nom: 'A', tel: '77 123 45 67', boutique: 'b1', montant: 25000, monture: 'Cube', paiementRef: 'WAVE-REF-1' });
  ok(await attendre('NOA-1', 'envoye'), 'dossier payé : SMS envoyé');
  ok(recus.length === 1 && /To=%2B221771234567/.test(recus[0]) && /NOA-1/.test(decodeURIComponent(recus[0])), 'le faux fournisseur reçoit le bon numéro et la référence');
  await post({ id: 'NOA-1', nom: 'A', tel: '77 123 45 67', boutique: 'b1', montant: 25000, paiementRef: 'WAVE-REF-1' });
  await new Promise(r => setTimeout(r, 300));
  ok(recus.length === 1, 'dossier renvoyé par la borne : pas de second SMS');
  await post({ id: 'NOA-2', nom: 'B', tel: '77 765 43 21', boutique: 'b1', montant: 1000 });
  await new Promise(r => setTimeout(r, 300));
  ok(recus.length === 1 && (await etat('NOA-2')) !== 'envoye', 'sans référence de paiement : aucun SMS');
  await post({ id: 'NOA-3', nom: 'C', tel: '12345', boutique: 'b1', montant: 1000, paiementRef: 'WAVE-REF-3' });
  ok(await attendre('NOA-3', 'invalide'), 'numéro illisible : état « invalide », pas d\'envoi');
  await post({ id: 'NOA-4', nom: 'D', tel: '77 123 45 67', boutique: 'b2', montant: 1000, paiementRef: 'WAVE-REF-4' });
  ok(await attendre('NOA-4', 'envoye'), 'deuxième commande du même numéro dans la journée : permise');
  await post({ id: 'NOA-5', nom: 'E', tel: '77 123 45 67', boutique: 'b3', montant: 1000, paiementRef: 'WAVE-REF-5' });
  ok(await attendre('NOA-5', 'limite'), 'plafond par numéro et par jour : « limite »');
  ok((await fetch(base + '/dossiers/NOA-1/sms')).status === 401, 'sans clé de borne : 401');
  ok((await etat('inexistant')) === 'inconnu', 'dossier inconnu : « inconnu »');
  ok(db.prepare("SELECT COUNT(*) n FROM journal WHERE action='sms_envoye'").get().n === 2, 'le journal garde la trace des envois');

  srv.close(); fauxTwilio.close();
  if (ec.length) { console.error('ÉCHEC\n - ' + ec.join('\n - ')); process.exit(1); }
  console.log('SMS OK : numéros, texte GSM, Twilio / Orange (faux serveur), un SMS par commande, rien sans paiement, plafonds');
  process.exit(0);
})();
