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
    consentement_le TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_etat ON dossiers(etat);
  CREATE TABLE IF NOT EXISTS journal (
    quand TEXT DEFAULT (datetime('now')),
    id    TEXT, action TEXT, detail TEXT
  );
`);

// Colonnes ajoutees apres coup : une base deja en service ne se recree pas.
for (const col of ['consentement TEXT', 'consentement_le TEXT']){
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

const app = express();
app.disable('x-powered-by');
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
                          consentement, consentement_le)
    VALUES (@id,@boutique,@nom,@tel,@monture,@extras,@paiement,
            @montant,@pd_mm,@face_width_cm,@face_shape,@date,
            @consentement,@consentement_le)
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

module.exports = { app, db, purger, photosDe };
