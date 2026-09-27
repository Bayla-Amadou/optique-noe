/**
 * N.O.A — Dossier client, et sa transmission au serveur
 *
 * Décision d'architecture : les dossiers vivent sur le serveur Hetzner, pas
 * sur la borne. Mais la borne doit continuer de fonctionner quand le réseau
 * tombe — c'est une boutique à Dakar, pas un centre de données.
 *
 * D'où une file d'attente. Le dossier est d'abord écrit LOCALEMENT, sur le
 * disque, avant même qu'on tente de l'envoyer. Ensuite seulement on essaie
 * le serveur, et on recommence tant que ça échoue. Une commande ne peut
 * donc pas se perdre parce que le Wi-Fi a hoqueté pendant qu'un client
 * payait.
 *
 * L'ordre compte : écrire d'abord, transmettre ensuite. L'inverse — tenter
 * l'envoi et n'écrire qu'en cas d'échec — perd le dossier si la borne
 * s'éteint pendant la requête.
 *
 * ── CE QUI EST EFFACÉ DE LA BORNE, ET POURQUOI ──────────────────────
 *
 * Une fois le dossier accepté par le serveur, les PHOTOS sont effacées de
 * la borne : l'ordonnance et le portrait du client avec sa monture. La
 * ligne reste, sans les images, pour que le tableau de bord local continue
 * d'afficher les commandes du jour.
 *
 * Ce n'est pas de l'économie de disque. Une borne est une machine posée en
 * boutique, physiquement accessible, qui peut être volée ou revendue. Y
 * laisser s'accumuler des années d'ordonnances et de portraits de clients
 * serait une réserve de données de santé sans surveillance. Ce qui n'est
 * plus sur la borne ne peut pas fuir depuis la borne.
 *
 * ── LE SERVEUR N'EST PAS CONFIGURÉ ? ────────────────────────────────
 *
 * Alors rien n'est transmis et tout reste en file d'attente. La borne ne
 * refuse pas de travailler : elle accumule, et enverra quand l'adresse
 * sera renseignée. Voir serveur.config.exemple.json.
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');

// La configuration est relue tant qu'elle manque. Le fichier se dépose à la
// main APRÈS l'installation (voir DEPLOIEMENT.md) : la lire une seule fois
// au démarrage obligerait à redémarrer la borne pour qu'elle s'en aperçoive,
// et personne ne se souviendra de ce détail six mois plus tard. Une fois
// trouvée, elle n'est plus relue — inutile de toucher au disque en boucle.
let _cfg = null, _cfgVu = 0;
const CFG_RELIRE_MS = 30000;

/**
 * serveur.config.json, à la racine, NON VERSIONNÉ : il contient un secret.
 *
 *   {
 *     "url":      "https://noa.example.sn",
 *     "cle":      "clé partagée entre la borne et le serveur",
 *     "boutique": "dakar-plateau"
 *   }
 */
function config(){
  if (_cfg) return _cfg;
  if (Date.now() - _cfgVu < CFG_RELIRE_MS) return null;
  _cfgVu = Date.now();
  try {
    const f = path.join(__dirname, 'serveur.config.json');
    if (fs.existsSync(f)){
      const c = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (c && c.url && c.cle) _cfg = c;
      else console.error('[Dossier] configuration incomplète : url et cle sont requis');
    }
  } catch (e) {
    console.error('[Dossier] configuration illisible :', e.message);
  }
  if (!_cfg) console.warn('[Dossier] serveur non configuré — les dossiers restent en file d\'attente');
  return _cfg;
}

function requete(url, options, corps){
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (_) { return resolve({ ok:false, raison:'url_invalide' }); }
    const mod = u.protocol === 'https:' ? https : http;
    const donnees = corps ? Buffer.from(JSON.stringify(corps)) : null;
    const req = mod.request(u, {
      timeout: 30000,          // un dossier porte des photos : plus long qu'un paiement
      ...options,
      headers: { ...(options.headers || {}),
                 ...(donnees ? { 'Content-Length': donnees.length } : {}) },
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; if (data.length > 1e6) req.destroy(); });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300){
          return resolve({ ok:false, raison:'http_' + res.statusCode, corps:data.slice(0,200) });
        }
        try { resolve({ ok:true, corps: data ? JSON.parse(data) : {} }); }
        catch (_) { resolve({ ok:true, corps:{} }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok:false, raison:'delai_depasse' }); });
    req.on('error', (e) => resolve({ ok:false, raison:'reseau', detail:e.message }));
    if (donnees) req.write(donnees);
    req.end();
  });
}

// ── La file d'attente ───────────────────────────────────────────────
function table(){
  const { getDb } = require('./database');
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS outbox (
      id         TEXT PRIMARY KEY,
      charge     TEXT NOT NULL,      -- le dossier, en JSON, photos exclues
      fichiers   TEXT,               -- chemins des photos, en JSON
      etat       TEXT NOT NULL,      -- en_attente | transmis | refuse
      essais     INTEGER DEFAULT 0,
      dernier    TEXT,               -- dernière raison d'échec
      cree_le    TEXT DEFAULT (datetime('now')),
      transmis_le TEXT
    );
  `);
  return d;
}

/**
 * Met un dossier en file. Retourne immédiatement : la transmission se fait
 * en arrière-plan, le client n'attend pas le réseau pour voir sa commande
 * confirmée — elle l'est déjà, par le paiement.
 */
function enfiler(dossier, fichiers){
  const d = table();
  const id = dossier.id || ('d' + Date.now().toString(36));
  d.prepare(`INSERT OR REPLACE INTO outbox (id, charge, fichiers, etat)
             VALUES (?, ?, ?, 'en_attente')`)
   .run(id, JSON.stringify({ ...dossier, id }), JSON.stringify(fichiers || {}));
  setTimeout(vider, 500);
  return { ok:true, id };
}

function enBase64(p){
  try {
    if (!p || !fs.existsSync(p)) return null;
    return fs.readFileSync(p).toString('base64');
  } catch (_) { return null; }
}

let _enCours = false;

/** Tente d'envoyer tout ce qui attend. Sans effet si le serveur manque. */
async function vider(){
  if (_enCours) return;
  const c = config();
  if (!c) return;
  _enCours = true;
  try {
    const d = table();
    // Les plus anciens d'abord : un dossier qui attend depuis hier passe
    // avant celui de la minute, sinon une file qui s'allonge ne se vide
    // jamais par le bas.
    const lignes = d.prepare(`SELECT * FROM outbox WHERE etat='en_attente'
                              ORDER BY cree_le ASC LIMIT 20`).all();
    for (const l of lignes){
      const charge   = JSON.parse(l.charge);
      const fichiers = JSON.parse(l.fichiers || '{}');
      // Les photos ne sont lues qu'au moment de l'envoi : les garder en
      // base les dupliquerait sur le disque de la borne, ce qu'on cherche
      // précisément à éviter.
      const corps = { ...charge, boutique: c.boutique || null, photos: {} };
      for (const [nom, chemin] of Object.entries(fichiers)){
        const b64 = enBase64(chemin);
        if (b64) corps.photos[nom] = b64;
      }
      const r = await requete(c.url.replace(/\/$/, '') + '/dossiers', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'X-NOA-Cle': c.cle },
      }, corps);

      if (r.ok){
        d.prepare(`UPDATE outbox SET etat='transmis', transmis_le=datetime('now'),
                   dernier=NULL WHERE id=?`).run(l.id);
        // Le serveur a le dossier : la borne n'a plus de raison de garder
        // les photos du client.
        for (const chemin of Object.values(fichiers)){
          try { if (chemin && fs.existsSync(chemin)) fs.unlinkSync(chemin); } catch (_) {}
        }
        console.log(`[Dossier] ${l.id} transmis`);
      } else {
        // Un refus du serveur (4xx) ne se corrigera pas en réessayant :
        // on le marque, sinon la file se bloque sur un dossier invalide et
        // tous les suivants attendent derrière lui.
        const definitif = /^http_4/.test(r.raison || '');
        d.prepare(`UPDATE outbox SET etat=?, essais=essais+1, dernier=? WHERE id=?`)
         .run(definitif ? 'refuse' : 'en_attente', r.raison + (r.detail ? ' · '+r.detail : ''), l.id);
        if (definitif) console.error(`[Dossier] ${l.id} refusé par le serveur : ${r.raison}`);
        else break;   // réseau coupé : inutile d'insister sur les suivants
      }
    }
  } catch (e) {
    console.error('[Dossier] file :', e.message);
  } finally {
    _enCours = false;
  }
}

/** État de la file, pour le tableau de bord. */
function etat(){
  try {
    const d = table();
    const r = d.prepare(`SELECT etat, COUNT(*) n FROM outbox GROUP BY etat`).all();
    const par = {}; for (const x of r) par[x.etat] = x.n;
    return { ok:true, configure: !!config(),
             en_attente: par.en_attente || 0,
             transmis:   par.transmis   || 0,
             refuse:     par.refuse     || 0 };
  } catch (e) {
    return { ok:false, raison:e.message };
  }
}

/** Relance périodique : le réseau revient sans prévenir. */
let _minuteur = null;
function demarrer(intervalleMs = 60000){
  if (_minuteur) return;
  _minuteur = setInterval(vider, intervalleMs);
  setTimeout(vider, 5000);
}

module.exports = { enfiler, vider, etat, demarrer, estConfigure: () => !!config() };
