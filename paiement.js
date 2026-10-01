/**
 * N.O.A — Paiement mobile money
 *
 * Règle absolue : une commande n'est confirmée que sur une notification
 * SERVEUR vérifiée. Aucun signal venant de la borne, du navigateur ou d'un
 * clavier ne peut valider un paiement. Ce module vit donc dans le processus
 * principal d'Electron, hors d'atteinte du code de la page.
 *
 * Architecture, et pourquoi elle est ainsi :
 *
 *   client ──paie──> Wave / Orange Money ──webhook──> serveur N.O.A
 *                                                          │
 *   borne ─────────────interroge le serveur────────────────┘
 *
 * La borne n'interroge JAMAIS Wave ou Orange directement. Deux raisons.
 * D'abord les clés marchandes n'ont rien à faire sur une machine posée en
 * boutique, accessible physiquement. Ensuite c'est l'opérateur qui notifie le
 * serveur, et le serveur seul sait rapprocher un versement d'une commande.
 * Une borne qui interrogerait l'opérateur elle-même pourrait être trompée par
 * un simple détournement du réseau local.
 *
 * Tant que le serveur n'est pas configuré, le paiement est déclaré
 * INDISPONIBLE et la borne le dit clairement. Elle ne propose alors aucune
 * confirmation : mieux vaut encaisser au comptoir que valider une commande
 * impayée.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

let _cfg = null, _cfgLu = false;

/**
 * Configuration attendue dans paiement.config.json, à la racine du projet.
 * Ce fichier n'est pas versionné : il contient un secret.
 *
 *   {
 *     "url":     "https://paiement.noa.sn",
 *     "cle":     "clé partagée entre la borne et le serveur",
 *     "boutique":"dakar-plateau"
 *   }
 */
function config(){
  if (_cfgLu) return _cfg;
  _cfgLu = true;
  try {
    const f = path.join(__dirname, 'paiement.config.json');
    if (fs.existsSync(f)){
      const c = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (c && c.url && c.cle) _cfg = c;
      else console.error('[Paiement] configuration incomplète : url et cle sont requis');
    }
  } catch (e) {
    console.error('[Paiement] configuration illisible :', e.message);
  }
  if (!_cfg) console.warn('[Paiement] non configuré — encaissement au comptoir uniquement');
  return _cfg;
}

// Requête JSON minimale, sans dépendance. Délai court : une borne ne doit
// jamais rester figée sur un serveur qui ne répond pas.
function requete(url, options, corps){
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (_) { return resolve({ ok:false, raison:'url_invalide' }); }
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, { timeout: 8000, ...options }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; if (data.length > 1e6) req.destroy(); });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300){
          return resolve({ ok:false, raison:'http_' + res.statusCode });
        }
        try { resolve({ ok:true, corps: JSON.parse(data) }); }
        catch (_) { resolve({ ok:false, raison:'reponse_illisible' }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok:false, raison:'delai_depasse' }); });
    req.on('error', (e) => resolve({ ok:false, raison:'reseau', detail:e.message }));
    if (corps) req.write(JSON.stringify(corps));
    req.end();
  });
}

/**
 * Ouvre une demande de paiement auprès du serveur de la boutique.
 * Retourne la référence à afficher au client et, si le serveur en fournit
 * une, l'adresse de paiement et son QR encodé en image.
 */
async function creer({ montant, operateur, commande }){
  const c = config();
  if (!c) return { ok:false, raison:'non_configure' };
  if (!(montant > 0)) return { ok:false, raison:'montant_invalide' };
  const r = await requete(c.url.replace(/\/$/, '') + '/paiements', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'X-NOA-Cle': c.cle },
  }, { montant, operateur, commande, boutique: c.boutique || null });
  if (!r.ok) return { ok:false, raison: r.raison, detail: r.detail };
  const d = r.corps || {};
  if (!d.reference) return { ok:false, raison:'reponse_sans_reference' };
  return { ok:true, reference:d.reference, url:d.url || null, qr:d.qr || null,
           numero:d.numero || null, code:d.code || null };
}

/**
 * Interroge le serveur sur l'état d'un paiement.
 *
 * Le seul état qui vaut confirmation est 'confirme', renvoyé par le serveur
 * après réception et vérification de la notification de l'opérateur. Tout le
 * reste — y compris une réponse inattendue — est traité comme non payé.
 */
async function statut(reference){
  const c = config();
  if (!c) return { ok:false, raison:'non_configure' };
  if (!reference || typeof reference !== 'string' || reference.length > 128){
    return { ok:false, raison:'reference_invalide' };
  }
  const r = await requete(
    c.url.replace(/\/$/, '') + '/paiements/' + encodeURIComponent(reference),
    { method:'GET', headers: { 'X-NOA-Cle': c.cle } });
  if (!r.ok) return { ok:false, raison: r.raison, detail: r.detail };
  const s = (r.corps && r.corps.statut) || 'inconnu';
  const connus = ['en_attente', 'confirme', 'echec', 'expire'];
  return { ok:true, statut: connus.includes(s) ? s : 'inconnu',
           montant: r.corps ? r.corps.montant : null };
}

function estConfigure(){ return !!config(); }

module.exports = { creer, statut, estConfigure };
