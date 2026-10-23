/**
 * N.O.A — SMS de confirmation de commande, envoyé PAR LE SERVEUR.
 *
 * Les identifiants du fournisseur de SMS ne quittent jamais le serveur : une borne en boutique est un
 * ordinateur accessible à tous, elle ne doit pas pouvoir envoyer de SMS à n'importe quel numéro. La borne ne fait que
 * transmettre le dossier (avec la référence du paiement) ; c'est le serveur qui décide, une seule fois par commande.
 *
 * Fournisseur choisi par NOA_SMS_FOURNISSEUR :
 *   aucun   (défaut)  rien n'est envoyé ; l'état du dossier est « desactive »
 *   orange            API SMS d'Orange (OAuth2 client credentials) — NOA_SMS_ORANGE_CLIENT_ID / _CLIENT_SECRET / _EXPEDITEUR
 *   twilio            NOA_SMS_TWILIO_SID / _TOKEN / _DE
 *   journal           écrit le SMS dans le journal du serveur sans l'envoyer (essais)
 * Les deux fournisseurs réels ont été écrits d'après leur documentation publique et testés contre un faux serveur
 * (banc-sms.js), PAS contre le service réel : un premier envoi vers un numéro de test s'impose avant la mise en service.
 *
 * Garde-fous : numéro validé et mis en forme E.164, un SMS par commande (idempotent), plafond par boutique et par heure,
 * plafond par numéro et par jour.
 */
'use strict';
const https = require('https'), http = require('http');

/** +221771234567 à partir de « 77 123 45 67 », « 00221 77… », « +221-77… ». Autre indicatif : accepté s'il commence par +. */
function normaliser(tel) {
  if (tel == null) return null;
  let t = String(tel).trim().replace(/[\s.\-()]/g, '');
  if (t.startsWith('00')) t = '+' + t.slice(2);
  if (/^\+\d{8,15}$/.test(t)) {
    if (t.startsWith('+221')) return /^\+221(70|75|76|77|78)\d{7}$/.test(t) ? t : null;   // mobiles du Sénégal
    return t;
  }
  if (/^(70|75|76|77|78)\d{7}$/.test(t)) return '+221' + t;
  if (/^221(70|75|76|77|78)\d{7}$/.test(t)) return '+' + t;
  return null;
}

const fcfa = n => String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** Texte en alphabet GSM (é è à ù ç seulement) : un seul SMS de 160 signes, pas un SMS « unicode » de 70. */
function texte(d) {
  const ref = String(d.id || '').replace(/[^A-Za-z0-9-]/g, '');
  const mont = d.montant != null ? ` de ${fcfa(d.montant)} FCFA` : '';
  const monture = d.monture ? ` (${String(d.monture).replace(/[^A-Za-z0-9 .\-]/g, '').slice(0, 24)})` : '';
  return `N.O.A : paiement${mont} recu. Commande ${ref}${monture}. Merci ! Nous vous prevenons des que vos lunettes sont disponibles.`;
}

function requeteHttp(url, options, corps) {
  return new Promise(resolve => {
    let u; try { u = new URL(url); } catch (_) { return resolve({ ok: false, raison: 'url_invalide' }); }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, { timeout: 10000, ...options }, res => {
      let data = ''; res.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
      res.on('end', () => {
        let json = null; try { json = data ? JSON.parse(data) : null; } catch (_) {}
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statut: res.statusCode, corps: json, brut: data.slice(0, 300) });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, raison: 'delai_depasse' }); });
    req.on('error', e => resolve({ ok: false, raison: 'reseau', detail: e.message }));
    if (corps) req.write(corps);
    req.end();
  });
}

/** @param env  process.env (ou un objet de test) ; @param http  requeteHttp, remplaçable en test */
function creer(env, requete) {
  const rq = requete || requeteHttp;
  const fournisseur = String(env.NOA_SMS_FOURNISSEUR || 'aucun').toLowerCase();
  let jeton = null, jetonJusqua = 0;

  async function orange(vers, msg) {
    const id = env.NOA_SMS_ORANGE_CLIENT_ID, secret = env.NOA_SMS_ORANGE_CLIENT_SECRET, exp = env.NOA_SMS_ORANGE_EXPEDITEUR;
    if (!id || !secret || !exp) return { ok: false, raison: 'configuration_incomplete' };
    const base = env.NOA_SMS_ORANGE_URL || 'https://api.orange.com';
    if (!jeton || Date.now() > jetonJusqua) {
      const corps = 'grant_type=client_credentials';
      const t = await rq(base + '/oauth/v3/token', { method: 'POST', headers: {
        Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corps) } }, corps);
      if (!t.ok || !t.corps || !t.corps.access_token) return { ok: false, raison: 'jeton_refuse', detail: t.statut || t.raison };
      jeton = t.corps.access_token; jetonJusqua = Date.now() + Math.max(60, (+t.corps.expires_in || 3600) - 120) * 1000;
    }
    const exped = 'tel:' + (exp.startsWith('+') ? exp : '+' + exp);
    const corps = JSON.stringify({ outboundSMSMessageRequest: { address: 'tel:' + vers, senderAddress: exped, outboundSMSTextMessage: { message: msg } } });
    const r = await rq(base + '/smsmessaging/v1/outbound/' + encodeURIComponent(exped) + '/requests', { method: 'POST', headers: {
      Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corps) } }, corps);
    if (r.statut === 401) jeton = null;
    return r.ok ? { ok: true } : { ok: false, raison: 'refuse_' + (r.statut || r.raison), detail: r.brut };
  }

  async function twilio(vers, msg) {
    const sid = env.NOA_SMS_TWILIO_SID, tok = env.NOA_SMS_TWILIO_TOKEN, de = env.NOA_SMS_TWILIO_DE;
    if (!sid || !tok || !de) return { ok: false, raison: 'configuration_incomplete' };
    const base = env.NOA_SMS_TWILIO_URL || 'https://api.twilio.com';
    const corps = new URLSearchParams({ To: vers, From: de, Body: msg }).toString();
    const r = await rq(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, { method: 'POST', headers: {
      Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corps) } }, corps);
    return r.ok ? { ok: true } : { ok: false, raison: 'refuse_' + (r.statut || r.raison), detail: r.brut };
  }

  return {
    fournisseur,
    actif: () => fournisseur !== 'aucun',
    async envoyer(vers, msg) {
      if (fournisseur === 'aucun') return { ok: false, raison: 'desactive' };
      if (fournisseur === 'journal') { console.log(`[SMS · journal] ${vers} : ${msg}`); return { ok: true }; }
      try {
        if (fournisseur === 'orange') return await orange(vers, msg);
        if (fournisseur === 'twilio') return await twilio(vers, msg);
      } catch (e) { return { ok: false, raison: 'erreur', detail: e.message }; }
      return { ok: false, raison: 'fournisseur_inconnu' };
    },
  };
}

module.exports = { creer, normaliser, texte, fcfa };
