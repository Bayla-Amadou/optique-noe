/**
 * N.O.A — Serveur de dossiers
 *
 * Il reçoit les dossiers des bornes, les garde le temps de fabriquer les
 * verres et de livrer, puis EFFACE les photos. C'est la règle : les données
 * restent jusqu'à la livraison, pas au-delà.
 *
 * ── LE CYCLE DE VIE, ET POURQUOI IL EST ÉCRIT ICI ───────────────────
 *
 *   reçu ──> en fabrication ──> prêt ──> livré ──> (photos effacées)
 *
 * La durée de conservation n'est pas une note dans un document : c'est du
 * code qui tourne. Une règle qu'on applique à la main n'est appliquée que
 * les premiers mois, et personne ne s'aperçoit qu'elle a cessé de l'être.
 *
 * Les photos — l'ordonnance et le portrait du client — sont supprimées un
 * délai après la livraison. Le dossier lui-même reste : nom, monture,
 * montant, mesures. Il faut pouvoir répondre à un client qui revient, et
 * tenir une comptabilité. Mais son visage et son ordonnance n'ont plus
 * aucune raison d'être là.
 *
 * Le délai par défaut est de 30 jours après la livraison, et il est
 * discutable : il couvre un retour ou une reprise immédiate. La garantie
 * étant d'un an, on peut vouloir garder l'ordonnance plus longtemps pour
 * refaire un verre cassé. C'est une décision d'entreprise, pas technique —
 * elle se règle par NOA_PURGE_JOURS, et elle doit être prise sciemment.
 *
 * ── CE QUI N'EST PAS FAIT ICI ───────────────────────────────────────
 *
 * Le chiffrement du disque. Il se fait au niveau du serveur, pas de
 * l'application : sur Hetzner, un volume chiffré (LUKS) protège aussi les
 * sauvegardes et les journaux, ce qu'un chiffrement applicatif ne ferait
 * pas. Voir le README.
 */

const express = require('express');
const Database = require('better-sqlite3');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');

const PORT        = +(process.env.NOA_PORT || 8080);
const CLE_BORNE   = process.env.NOA_CLE_BORNE   || '';
const MDP_ATELIER = process.env.NOA_MDP_ATELIER || '';
const PURGE_JOURS = +(process.env.NOA_PURGE_JOURS || 30);
const DONNEES     = process.env.NOA_DONNEES || path.join(__dirname, 'donnees');

if (!CLE_BORNE || !MDP_ATELIER){
  console.error('\n  NOA_CLE_BORNE et NOA_MDP_ATELIER sont obligatoires.');
  console.error('  Sans eux le serveur accepterait n\'importe qui : il refuse de démarrer.\n');
  process.exit(1);
}

const PHOTOS = path.join(DONNEES, 'photos');
fs.mkdirSync(PHOTOS, { recursive: true });

const db = new Database(path.join(DONNEES, 'noa.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS dossiers (
    id            TEXT PRIMARY KEY,
    boutique      TEXT,
    nom           TEXT,
    tel           TEXT,
    monture       TEXT,
    extras        TEXT,
    paiement      TEXT,
    montant       INTEGER,
    pd_mm         REAL,
    face_width_cm REAL,
    face_shape    TEXT,
    date          TEXT,
    etat          TEXT NOT NULL DEFAULT 'recu',
    recu_le       TEXT DEFAULT (datetime('now')),
    maj_le        TEXT DEFAULT (datetime('now')),
    livre_le      TEXT,
    purge_le      TEXT,
    consentement    TEXT,
    consentement_le TEXT,
    borne           TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_etat ON dossiers(etat);
  CREATE TABLE IF NOT EXISTS journal (
    quand TEXT DEFAULT (datetime('now')),
    id    TEXT, action TEXT, detail TEXT
  );
`);

// Colonnes ajoutees apres coup : une base deja en service ne se recree pas.
for (const col of ['consentement TEXT', 'consentement_le TEXT', 'borne TEXT']){
  try { db.exec(`ALTER TABLE dossiers ADD COLUMN ${col}`); } catch (_) {}
}

const ETATS = ['recu', 'en_fabrication', 'pret', 'livre'];
const noter = (id, action, detail) =>
  db.prepare('INSERT INTO journal (id, action, detail) VALUES (?,?,?)')
    .run(id, action, detail || null);

// Comparaison à durée constante : comparer deux secrets avec === laisse
// fuir leur longueur et leur préfixe par le temps de réponse.
function memeSecret(a, b){
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

const ORIGINES = (process.env.NOA_ORIGINES || '').split(',').map(x => x.trim()).filter(Boolean);
const mesuresModule = require('./mesures.js');

const app = express();
app.disable('x-powered-by');
// ── CORS, pour le tableau de bord hébergé ailleurs (GitHub Pages) ────
// Le tableau de bord est une page statique ; ses DONNÉES, elles, ne sont que
// sur ce serveur, derrière le mot de passe de l'atelier. Seules les origines
// listées dans NOA_ORIGINES (ex. https://bayla-amadou.github.io) peuvent
// l'interroger depuis un navigateur. Sans cette variable : aucun accès
// depuis un autre site.
app.use((req, res, next) => {
  const o = req.get('Origin');
  if (o && ORIGINES.includes(o)) {
    res.set('Access-Control-Allow-Origin', o);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-NOA-Session');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
// Les photos font monter le corps : une ordonnance en base64 dépasse
// facilement le mégaoctet.
app.use(express.json({ limit: '25mb' }));

// ════════════════════════════════════════════════════════════════════
//  CÔTÉ BORNE
// ════════════════════════════════════════════════════════════════════
app.post('/dossiers', (req, res) => {
  if (!memeSecret(req.get('X-NOA-Cle'), CLE_BORNE))
    return res.status(401).json({ erreur: 'cle_invalide' });

  const d = req.body || {};
  if (!d.id || !d.nom || !d.tel)
    return res.status(400).json({ erreur: 'dossier_incomplet' });

  // La borne renvoie un dossier déjà transmis si notre réponse s'est perdue
  // en route. On réenregistre sans dupliquer, et sans repasser l'état à
  // « reçu » : l'atelier a pu commencer entre-temps.
  const existant = db.prepare('SELECT etat FROM dossiers WHERE id=?').get(d.id);

  db.prepare(`
    INSERT INTO dossiers (id, boutique, nom, tel, monture, extras, paiement,
                          montant, pd_mm, face_width_cm, face_shape, date,
                          consentement, consentement_le, borne)
    VALUES (@id,@boutique,@nom,@tel,@monture,@extras,@paiement,
            @montant,@pd_mm,@face_width_cm,@face_shape,@date,
            @consentement,@consentement_le,@borne)
    ON CONFLICT(id) DO UPDATE SET
      nom=@nom, tel=@tel, monture=@monture, extras=@extras,
      paiement=@paiement, montant=@montant, pd_mm=@pd_mm,
      face_width_cm=@face_width_cm, face_shape=@face_shape, maj_le=datetime('now')
  `).run({
    id: d.id, boutique: d.boutique || null, nom: d.nom, tel: d.tel,
    monture: d.monture || null,
    extras: Array.isArray(d.extras) ? d.extras.join(', ') : (d.extras || null),
    paiement: d.paiement || null,
    montant: d.montant != null ? parseInt(d.montant, 10) || 0 : null,
    pd_mm: d.pd_mm ?? null, face_width_cm: d.faceWidth_cm ?? null,
    face_shape: d.faceShape || null, date: d.date || new Date().toISOString(),
    consentement: d.consentement || null, consentement_le: d.consentementLe || null,
    borne: d.borne || null,
  });

  // Les photos ne sont pas réécrites si le dossier a déjà été livré et
  // purgé : les faire revenir annulerait l'effacement.
  const purge = db.prepare('SELECT purge_le FROM dossiers WHERE id=?').get(d.id);
  if (d.photos && !purge.purge_le){
    const dir = path.join(PHOTOS, d.id.replace(/[^A-Za-z0-9_-]/g, ''));
    fs.mkdirSync(dir, { recursive: true });
    for (const [nom, b64] of Object.entries(d.photos)){
      if (!/^(ordonnance|essai)$/.test(nom)) continue;
      try { fs.writeFileSync(path.join(dir, nom + '.jpg'), Buffer.from(b64, 'base64')); }
      catch (e) { console.error('[photo]', d.id, nom, e.message); }
    }
  }

  noter(d.id, existant ? 'renvoi' : 'recu', d.boutique);
  res.json({ ok: true, id: d.id, etat: existant ? existant.etat : 'recu' });
});

// ════════════════════════════════════════════════════════════════════
//  CÔTÉ ATELIER
// ════════════════════════════════════════════════════════════════════
// Session par jeton signé, en mémoire : une poignée d'opticiens, pas un
// site public. Un redémarrage déconnecte tout le monde, ce qui est très
// bien pour un outil interne.
const sessions = new Map();
const SESSION_MS = 12 * 3600 * 1000;

function atelier(req, res, next){
  const j = (req.get('X-NOA-Session') || '').trim();
  const s = sessions.get(j);
  if (!s || Date.now() > s) { sessions.delete(j); return res.status(401).json({ erreur:'session' }); }
  next();
}

app.post('/api/connexion', (req, res) => {
  if (!memeSecret((req.body || {}).motdepasse, MDP_ATELIER))
    return res.status(401).json({ erreur: 'refuse' });
  const j = crypto.randomBytes(24).toString('hex');
  sessions.set(j, Date.now() + SESSION_MS);
  res.json({ ok: true, jeton: j });
});

app.get('/api/dossiers', atelier, (req, res) => {
  const etat = req.query.etat;
  const q = etat && ETATS.includes(etat)
    ? db.prepare(`SELECT * FROM dossiers WHERE etat=? ORDER BY recu_le DESC LIMIT 500`).all(etat)
    : db.prepare(`SELECT * FROM dossiers ORDER BY recu_le DESC LIMIT 500`).all();
  // On n'expose jamais les photos dans la liste : on dit seulement si elles
  // existent encore. Une liste qui embarque les images serait recopiée dans
  // le cache de chaque navigateur de la boutique.
  res.json({ ok: true, dossiers: q.map(d => ({
    ...d, photos: photosDe(d.id).map(p => p.nom) })) });
});

function photosDe(id){
  const dir = path.join(PHOTOS, String(id).replace(/[^A-Za-z0-9_-]/g, ''));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => /\.jpg$/.test(f))
           .map(f => ({ nom: f.replace(/\.jpg$/, ''), chemin: path.join(dir, f) }));
}

app.get('/api/photo/:id/:nom', atelier, (req, res) => {
  const p = photosDe(req.params.id).find(x => x.nom === req.params.nom);
  if (!p) return res.status(404).end();
  res.type('jpg').send(fs.readFileSync(p.chemin));
});

app.post('/api/dossiers/:id/etat', atelier, (req, res) => {
  const etat = (req.body || {}).etat;
  if (!ETATS.includes(etat)) return res.status(400).json({ erreur:'etat_inconnu' });
  const d = db.prepare('SELECT * FROM dossiers WHERE id=?').get(req.params.id);
  if (!d) return res.status(404).json({ erreur:'inconnu' });
  db.prepare(`UPDATE dossiers SET etat=?, maj_le=datetime('now'),
              livre_le = CASE WHEN ?='livre' THEN datetime('now') ELSE livre_le END
              WHERE id=?`).run(etat, etat, req.params.id);
  noter(req.params.id, 'etat', etat);
  res.json({ ok:true, etat });
});

app.get('/api/etat', atelier, (_req, res) => {
  const r = db.prepare('SELECT etat, COUNT(*) n FROM dossiers GROUP BY etat').all();
  const par = {}; for (const x of r) par[x.etat] = x.n;
  res.json({ ok:true, par_etat: par, purge_jours: PURGE_JOURS,
             photos_restantes: fs.existsSync(PHOTOS) ? fs.readdirSync(PHOTOS).length : 0 });
});

// ════════════════════════════════════════════════════════════════════
//  L'EFFACEMENT, QUI TOURNE TOUT SEUL
// ════════════════════════════════════════════════════════════════════
function purger(){
  const vieux = db.prepare(`
    SELECT id FROM dossiers
    WHERE etat='livre' AND purge_le IS NULL
      AND livre_le IS NOT NULL
      AND julianday('now') - julianday(livre_le) >= ?`).all(PURGE_JOURS);
  let n = 0;
  for (const { id } of vieux){
    const dir = path.join(PHOTOS, String(id).replace(/[^A-Za-z0-9_-]/g, ''));
    try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive:true, force:true }); }
    catch (e) { console.error('[purge]', id, e.message); continue; }
    db.prepare(`UPDATE dossiers SET purge_le=datetime('now') WHERE id=?`).run(id);
    noter(id, 'purge', PURGE_JOURS + ' jours après livraison');
    n++;
  }
  if (n) console.log(`[Purge] ${n} dossier(s) : photos effacées`);
  return n;
}


// ════════════════════════════════════════════════════════════════════
//  LA FLOTTE : SIGNES DE VIE, MESURES, COMMANDES À DISTANCE
// ════════════════════════════════════════════════════════════════════
// Ce que fait McDonald's pour des milliers de bornes, à notre échelle :
// chaque borne dit régulièrement qu'elle est vivante et dans quel état ;
// le serveur sait laquelle est muette ; l'atelier peut lui donner un ordre
// parmi une liste FERMÉE (redémarrer, recharger la page, activer ou couper
// la collecte). Jamais de code arbitraire : une commande est un mot d'une
// liste, validé ici puis revalidé par la borne.
db.exec(`
  CREATE TABLE IF NOT EXISTS bornes (
    nom          TEXT PRIMARY KEY,
    boutique     TEXT,
    build        TEXT,
    premiere_vue TEXT DEFAULT (datetime('now')),
    derniere_vue TEXT,
    etat         TEXT
  );
  CREATE TABLE IF NOT EXISTS mesures (
    id      TEXT PRIMARY KEY,
    borne   TEXT,
    jour    TEXT,
    heure   INTEGER,
    donnees TEXT NOT NULL,
    recu_le TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS mesures_jour ON mesures(jour);
  CREATE TABLE IF NOT EXISTS commandes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    borne      TEXT NOT NULL,
    action     TEXT NOT NULL,
    cree_le    TEXT DEFAULT (datetime('now')),
    envoyee_le TEXT,
    accusee_le TEXT,
    resultat   TEXT
  );
`);
const ACTIONS = ['redemarrer', 'recharger', 'collecte_on', 'collecte_off'];
const nomBorne = v => /^[A-Za-z0-9_.-]{1,40}$/.test(String(v || '')) ? String(v) : null;
const borne = (req, res, next) => {
  if (!memeSecret(req.get('X-NOA-Cle'), CLE_BORNE)) return res.status(401).json({ erreur:'cle' });
  next();
};
const num = (v, mn, mx) => { v = Number(v); return Number.isFinite(v) && v >= mn && v <= mx ? v : null; };

// Signe de vie. La réponse porte les commandes en attente : un seul aller-retour.
app.post('/bornes/signe', borne, (req, res) => {
  const b = req.body || {}, nom = nomBorne(b.borne);
  if (!nom) return res.status(400).json({ erreur:'borne' });
  const etat = {
    uptime_s: num(b.uptime_s, 0, 1e9), memoire_mo: num(b.memoire_mo, 0, 1e5),
    camera: ['ok', 'perdue', 'absente', 'inactive'].includes(b.camera) ? b.camera : null,
    cameras: num(b.cameras, 0, 20), images: num(b.images, 0, 1e12),
    gl_restaures: num(b.gl_restaures, 0, 1e6), file_attente: num(b.file_attente, 0, 1e6),
    dossiers_refuses: num(b.dossiers_refuses, 0, 1e6), session: !!b.session,
    collecte: !!b.collecte, relances: num(b.relances, 0, 1e6),
    electron: typeof b.electron === 'string' ? b.electron.slice(0, 20) : null,
  };
  const build = typeof b.build === 'string' && /^[A-Z]{1,3}$/.test(b.build) ? b.build : null;
  const boutique = typeof b.boutique === 'string' ? b.boutique.slice(0, 40) : null;
  db.prepare(`INSERT INTO bornes (nom, boutique, build, derniere_vue, etat)
              VALUES (?,?,?,datetime('now'),?)
              ON CONFLICT(nom) DO UPDATE SET boutique=excluded.boutique, build=excluded.build,
                derniere_vue=datetime('now'), etat=excluded.etat`)
    .run(nom, boutique, build, JSON.stringify(etat));
  // Une commande vieille de plus d'une heure n'est plus d'actualité : la
  // borne était éteinte, ce n'est pas le moment de la redémarrer.
  db.prepare(`DELETE FROM commandes WHERE envoyee_le IS NULL AND cree_le < datetime('now','-1 hour')`).run();
  const cmds = db.prepare(`SELECT id, action FROM commandes WHERE borne=? AND envoyee_le IS NULL ORDER BY id LIMIT 5`).all(nom);
  for (const c of cmds) db.prepare(`UPDATE commandes SET envoyee_le=datetime('now') WHERE id=?`).run(c.id);
  res.json({ ok:true, commandes: cmds });
});

app.post('/bornes/accuse', borne, (req, res) => {
  const b = req.body || {}, id = parseInt(b.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ erreur:'id' });
  db.prepare(`UPDATE commandes SET accusee_le=datetime('now'), resultat=? WHERE id=?`)
    .run(String(b.resultat || (b.ok ? 'ok' : 'echec')).slice(0, 80), id);
  res.json({ ok:true });
});

// Mesures anonymes : validées une seconde fois ici, et dédoublonnées par identifiant.
app.post('/mesures', borne, (req, res) => {
  const lignes = Array.isArray((req.body || {}).lignes) ? req.body.lignes.slice(0, 500) : [];
  const ins = db.prepare(`INSERT OR IGNORE INTO mesures (id, borne, jour, heure, donnees) VALUES (?,?,?,?,?)`);
  let n = 0;
  for (const l of lignes) {
    const d = mesuresModule.valider(l);
    if (!d || !/^[a-f0-9]{8,16}$/.test(String(l.id || ''))) continue;
    const jour = /^\d{4}-\d{2}-\d{2}$/.test(String(l.jour || '')) ? l.jour : null;
    const h = Number.isInteger(l.heure) && l.heure >= 0 && l.heure < 24 ? l.heure : null;
    n += ins.run(l.id, nomBorne(l.borne), jour, h, JSON.stringify(d)).changes;
  }
  res.json({ ok:true, recues:n });
});

// ── Côté atelier ─────────────────────────────────────────────────────
const MIN = 60;
app.get('/api/flotte', atelier, (_req, res) => {
  const lignes = db.prepare(`SELECT nom, boutique, build, premiere_vue, derniere_vue, etat,
      CAST((julianday('now') - julianday(derniere_vue)) * 86400 AS INTEGER) AS silence_s FROM bornes ORDER BY nom`).all();
  const builds = lignes.map(l => l.build).filter(Boolean).sort();
  const recent = builds.length ? builds.sort((a, b) => a.length - b.length || a.localeCompare(b)).pop() : null;
  const bornes = lignes.map(l => {
    const e = l.etat ? JSON.parse(l.etat) : {}, alertes = [];
    const statut = l.silence_s < 3 * MIN ? 'en_ligne' : l.silence_s < 10 * MIN ? 'retard' : 'hors_ligne';
    if (statut !== 'en_ligne') alertes.push({ niveau: statut === 'hors_ligne' ? 'critique' : 'attention', texte: statut === 'hors_ligne' ? 'Ne répond plus' : 'Signe de vie en retard' });
    if (e.camera === 'perdue') alertes.push({ niveau:'critique', texte:'Caméra perdue pendant un essayage' });
    if (e.camera === 'absente' || e.cameras === 0) alertes.push({ niveau:'critique', texte:'Aucune caméra détectée' });
    if (e.file_attente > 20) alertes.push({ niveau:'attention', texte:`${e.file_attente} dossiers en attente d'envoi` });
    if (e.dossiers_refuses > 0) alertes.push({ niveau:'attention', texte:`${e.dossiers_refuses} dossier(s) refusé(s) par le serveur` });
    if (e.memoire_mo > 1500) alertes.push({ niveau:'attention', texte:`Mémoire élevée (${Math.round(e.memoire_mo)} Mo)` });
    if (recent && l.build && l.build !== recent) alertes.push({ niveau:'info', texte:`Version ${l.build} (la plus récente : ${recent})` });
    return { nom:l.nom, boutique:l.boutique, build:l.build, premiere_vue:l.premiere_vue, derniere_vue:l.derniere_vue, silence_s:l.silence_s, statut, etat:e, alertes };
  });
  res.json({ ok:true, bornes, build_recent: recent });
});

app.get('/api/mesures/stats', atelier, (req, res) => {
  const jours = Math.max(1, Math.min(365, parseInt(req.query.jours, 10) || 30));
  const bn = nomBorne(req.query.borne);
  const rows = db.prepare(`SELECT borne, jour, heure, donnees FROM mesures WHERE jour >= date('now', ?) ${bn ? 'AND borne = ?' : ''} ORDER BY jour DESC LIMIT 50000`)
    .all(...(bn ? ['-' + jours + ' days', bn] : ['-' + jours + ' days'])).map(r => ({ ...JSON.parse(r.donnees), borne:r.borne, jour:r.jour, heure:r.heure }));
  const q = (a, p) => { const t = a.filter(x => x != null).sort((x, y) => x - y); return t.length ? t[Math.min(t.length - 1, Math.floor(p * t.length))] : null; };
  const col = k => rows.map(r => r[k]).filter(x => x != null);
  const resume = k => { const v = col(k); return { n:v.length, p5:q(v, .05), med:q(v, .5), p95:q(v, .95) }; };
  const hist = (k, mn, mx, pas) => { const v = col(k), n = Math.round((mx - mn) / pas), b = Array.from({ length:n }, (_, i) => ({ de: +(mn + i * pas).toFixed(3), n:0 }));
    for (const x of v) { const i = Math.floor((x - mn) / pas); if (i >= 0 && i < n) b[i].n++; else if (i < 0) b[0].n++; else b[n - 1].n++; } return b; };
  const mal = r => (r.part_suit != null && r.part_suit < 0.85) || (r.effacements || 0) >= 2;
  const parHeure = Array.from({ length:24 }, (_, h) => ({ heure:h, n:0, degrades:0 }));
  rows.forEach(r => { if (r.heure != null) { parHeure[r.heure].n++; if (mal(r)) parHeure[r.heure].degrades++; } });
  const K = col('k_tete');
  const issues = {}; rows.forEach(r => { const k = r.issue || 'inconnue'; issues[k] = (issues[k] || 0) + 1; });
  res.json({ ok:true, jours, n: rows.length, degrades: rows.filter(mal).length, issues,
    k: { ...resume('k_tete'), hors_plage_bas: K.filter(x => x < 0.85).length, hors_plage_haut: K.filter(x => x > 1.10).length, histogramme: hist('k_tete', 0.7, 1.3, 0.025) },
    suivi: { ...resume('part_suit'), histogramme: hist('part_suit', 0, 1.0001, 0.1) },
    pd: resume('pd_mm'), yaw: resume('yaw_max'), pitch: resume('pitch_max'), lumiere: resume('lumiere'), ms_image: resume('ms_image'),
    par_heure: parHeure });
});

app.post('/api/commande', atelier, (req, res) => {
  const b = req.body || {}, nom = nomBorne(b.borne);
  if (!nom || !ACTIONS.includes(b.action)) return res.status(400).json({ erreur:'commande' });
  if (!db.prepare('SELECT 1 FROM bornes WHERE nom=?').get(nom)) return res.status(404).json({ erreur:'borne inconnue' });
  const r = db.prepare('INSERT INTO commandes (borne, action) VALUES (?,?)').run(nom, b.action);
  res.json({ ok:true, id: r.lastInsertRowid });
});
app.get('/api/commandes', atelier, (_req, res) =>
  res.json({ ok:true, commandes: db.prepare('SELECT * FROM commandes ORDER BY id DESC LIMIT 50').all() }));

app.get('/sante', (_req, res) => res.json({ ok:true }));
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`\n  N.O.A — serveur de dossiers`);
  console.log(`  écoute sur le port ${PORT}`);
  console.log(`  données dans ${DONNEES}`);
  console.log(`  photos effacées ${PURGE_JOURS} jours après la livraison\n`);
  purger();
  setInterval(purger, 6 * 3600 * 1000);   // quatre fois par jour, c'est assez
});

module.exports = { app, db, purger, photosDe, ACTIONS };
