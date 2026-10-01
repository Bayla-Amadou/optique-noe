/**
 * N.O.A — Pilotage : dossiers des patients, ventes, réglages des bornes, audit
 *
 * Ce module porte ce que les deux tableaux de bord affichent et commandent :
 *
 *   ESPACE OPTICIEN   chercher un dossier, le lire en entier (monture,
 *                     ordonnance scannée, portrait d'essai, téléphone),
 *                     faire avancer la commande, laisser une note.
 *   ESPACE ADMIN      ventes et métriques, réglages poussés aux bornes
 *                     (prix, paiements, horaires, maintenance, catalogue,
 *                     mises à jour), journal des actions.
 *
 * L'authentification par rôle n'est PAS encore là : pour l'instant les deux
 * espaces partagent le mot de passe de l'atelier. Les routes sont déjà
 * séparées en `opticien` et `admin` pour que l'ajout des comptes se fasse en
 * remplaçant deux fonctions, sans retoucher une seule route.
 */

const { validerReglages, fusion, texte } = require('./reglages.js');

// ─────────────────────────────────────────────────────────────────────
//  Les routes
// ─────────────────────────────────────────────────────────────────────
function monter(app, { db, opticien, admin, photosDe, noter, ETATS, nomBorne, PHOTOS, fs, path }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reglages (portee TEXT PRIMARY KEY, donnees TEXT NOT NULL, maj_le TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS meta (cle TEXT PRIMARY KEY, valeur TEXT);
    CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, dossier TEXT NOT NULL, quand TEXT DEFAULT (datetime('now')), texte TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS notes_dossier ON notes(dossier);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, quand TEXT DEFAULT (datetime('now')), qui TEXT, action TEXT, cible TEXT, detail TEXT);
  `);
  const QUI = 'atelier';                              // deviendra l'identité du compte connecté
  const audit = (action, cible, detail) => db.prepare('INSERT INTO audit (qui, action, cible, detail) VALUES (?,?,?,?)').run(QUI, action, cible || null, detail ? String(detail).slice(0, 300) : null);

  // ── Réglages ───────────────────────────────────────────────────────
  const lire = portee => { const r = db.prepare('SELECT donnees FROM reglages WHERE portee=?').get(portee); return r ? JSON.parse(r.donnees) : {}; };
  const versionReglages = () => +(db.prepare("SELECT valeur FROM meta WHERE cle='reglages_version'").get() || { valeur: 0 }).valeur;
  const reglagesPour = nom => ({ version: versionReglages(), donnees: fusion(lire('global'), lire('borne:' + nom)) });

  app.get('/api/reglages', admin, (_req, res) => {
    const bornes = {};
    for (const r of db.prepare("SELECT portee, donnees, maj_le FROM reglages WHERE portee LIKE 'borne:%'").all()) bornes[r.portee.slice(6)] = JSON.parse(r.donnees);
    res.json({ ok: true, version: versionReglages(), global: lire('global'), bornes });
  });
  app.post('/api/reglages', admin, (req, res) => {
    const b = req.body || {}, p = String(b.portee || '');
    const portee = p === 'global' ? 'global' : (/^borne:/.test(p) && nomBorne(p.slice(6)) ? p : null);
    if (!portee) return res.status(400).json({ erreur: 'portee' });
    const donnees = validerReglages(b.donnees);
    const avant = JSON.stringify(lire(portee));
    db.prepare(`INSERT INTO reglages (portee, donnees, maj_le) VALUES (?,?,datetime('now')) ON CONFLICT(portee) DO UPDATE SET donnees=excluded.donnees, maj_le=datetime('now')`).run(portee, JSON.stringify(donnees));
    if (JSON.stringify(donnees) !== avant) {
      db.prepare("INSERT INTO meta (cle, valeur) VALUES ('reglages_version','1') ON CONFLICT(cle) DO UPDATE SET valeur=CAST(valeur AS INTEGER)+1").run();
      audit('reglages', portee, Object.keys(donnees).join(', ') || '(vide)');
    }
    res.json({ ok: true, version: versionReglages(), donnees });
  });

  // ── Dossiers : recherche, détail, notes, export ───────────────────
  const filtres = q => {
    const w = [], a = [];
    if (q.etat && ETATS.includes(q.etat)) { w.push('etat = ?'); a.push(q.etat); }
    if (q.boutique) { w.push('boutique = ?'); a.push(String(q.boutique).slice(0, 60)); }
    if (q.borne && nomBorne(q.borne)) { w.push('borne = ?'); a.push(q.borne); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.du || '')) { w.push('date(recu_le) >= ?'); a.push(q.du); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.au || '')) { w.push('date(recu_le) <= ?'); a.push(q.au); }
    if (q.q) {
      const t = '%' + String(q.q).replace(/[%_\\]/g, '\\$&').slice(0, 60) + '%';
      w.push("(nom LIKE ? ESCAPE '\\' OR tel LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' OR monture LIKE ? ESCAPE '\\')"); a.push(t, t, t, t);
    }
    return { where: w.length ? 'WHERE ' + w.join(' AND ') : '', args: a };
  };
  app.get('/api/dossiers', opticien, (req, res) => {
    const { where, args } = filtres(req.query);
    const limite = Math.max(1, Math.min(200, parseInt(req.query.limite, 10) || 100)), decalage = Math.max(0, parseInt(req.query.decalage, 10) || 0);
    const total = db.prepare(`SELECT COUNT(*) n FROM dossiers ${where}`).get(...args).n;
    const lignes = db.prepare(`SELECT * FROM dossiers ${where} ORDER BY recu_le DESC LIMIT ? OFFSET ?`).all(...args, limite, decalage);
    // Jamais les images dans la liste : on dit seulement lesquelles existent.
    res.json({ ok: true, total, dossiers: lignes.map(d => ({ ...d, photos: photosDe(d.id).map(p => p.nom) })) });
  });
  app.get('/api/dossiers/:id', opticien, (req, res) => {
    const d = db.prepare('SELECT * FROM dossiers WHERE id=?').get(req.params.id);
    if (!d) return res.status(404).json({ erreur: 'inconnu' });
    const journal = db.prepare('SELECT quand, action, detail FROM journal WHERE id=? ORDER BY rowid').all(d.id);
    const notes = db.prepare('SELECT quand, texte FROM notes WHERE dossier=? ORDER BY id').all(d.id);
    res.json({ ok: true, dossier: { ...d, photos: photosDe(d.id).map(p => p.nom) }, journal, notes });
  });
  app.post('/api/dossiers/:id/note', opticien, (req, res) => {
    const t = texte((req.body || {}).texte, 500);
    if (!t) return res.status(400).json({ erreur: 'note_vide' });
    if (!db.prepare('SELECT 1 FROM dossiers WHERE id=?').get(req.params.id)) return res.status(404).json({ erreur: 'inconnu' });
    db.prepare('INSERT INTO notes (dossier, texte) VALUES (?,?)').run(req.params.id, t);
    audit('note', req.params.id, t.slice(0, 80));
    res.json({ ok: true });
  });
  app.get('/api/dossiers.csv', opticien, (req, res) => {
    const { where, args } = filtres(req.query);
    const cols = ['id', 'recu_le', 'etat', 'boutique', 'borne', 'nom', 'tel', 'monture', 'extras', 'paiement', 'montant', 'pd_mm', 'face_width_cm', 'face_shape'];
    // Une cellule qui commence par = + - @ serait lue comme une formule par un tableur.
    const cel = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const lignes = db.prepare(`SELECT ${cols.join(',')} FROM dossiers ${where} ORDER BY recu_le DESC LIMIT 20000`).all(...args);
    audit('export_csv', null, lignes.length + ' dossiers');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="noa-dossiers.csv"');
    res.send('﻿' + cols.join(',') + '\n' + lignes.map(l => cols.map(c => cel(l[c])).join(',')).join('\n'));
  });

  // ── Ventes et métriques ───────────────────────────────────────────
  app.get('/api/ventes/stats', admin, (req, res) => {
    const jours = Math.max(1, Math.min(365, parseInt(req.query.jours, 10) || 30));
    const f = []; const a = [];
    if (req.query.boutique) { f.push('boutique = ?'); a.push(String(req.query.boutique).slice(0, 60)); }
    if (req.query.borne && nomBorne(req.query.borne)) { f.push('borne = ?'); a.push(req.query.borne); }
    const et = f.length ? ' AND ' + f.join(' AND ') : '';
    // « il y a n jours » en modificateur SQLite : n > 0 recule, n < 0 avance.
    const il = n => (n > 0 ? '-' : '+') + Math.abs(n) + ' days';
    const periode = (de, a2) => db.prepare(`SELECT * FROM dossiers WHERE date(recu_le) >= date('now', ?) AND date(recu_le) < date('now', ?) ${et}`).all(il(de), il(a2), ...a);
    const lignes = periode(jours - 1, -1), avant = periode(2 * jours - 1, jours - 1);
    const somme = l => l.reduce((s, d) => s + (d.montant || 0), 0);
    const groupe = (l, cle) => { const m = {}; for (const d of l) { const k = (cle(d) || 'Non renseigné'); m[k] = m[k] || { n: 0, ca: 0 }; m[k].n++; m[k].ca += d.montant || 0; } return Object.entries(m).map(([nom, v]) => ({ nom, ...v })).sort((x, y) => y.ca - x.ca); };
    // Une ligne par jour, même sans vente : un graphique à trous mentirait.
    const parJour = []; const idx = {};
    for (let i = jours - 1; i >= 0; i--) { const j = db.prepare("SELECT date('now', ?) d").get(`-${i} days`).d; idx[j] = { jour: j, n: 0, ca: 0 }; parJour.push(idx[j]); }
    for (const d of lignes) { const j = (d.recu_le || '').slice(0, 10); if (idx[j]) { idx[j].n++; idx[j].ca += d.montant || 0; } }
    const parHeure = Array.from({ length: 24 }, (_, h) => ({ heure: h, n: 0 })), parSemaine = Array.from({ length: 7 }, (_, j) => ({ jour: j, n: 0 }));
    for (const d of lignes) { const t = new Date((d.recu_le || '').replace(' ', 'T') + 'Z'); if (!isNaN(t)) { parHeure[t.getUTCHours()].n++; parSemaine[t.getUTCDay()].n++; } }
    const livrees = lignes.filter(d => d.livre_le && d.recu_le);
    const heures = livrees.map(d => (new Date(d.livre_le.replace(' ', 'T') + 'Z') - new Date(d.recu_le.replace(' ', 'T') + 'Z')) / 3600000).filter(h => h >= 0);
    const ess = db.prepare(`SELECT COUNT(*) n, SUM(CASE WHEN json_extract(donnees,'$.issue')='choisi' THEN 1 ELSE 0 END) choisis FROM mesures WHERE jour >= date('now', ?)`).get(`-${jours - 1} days`);
    const retard = db.prepare(`SELECT id, nom, etat, monture, recu_le, CAST((julianday('now') - julianday(recu_le)) AS INTEGER) AS jours FROM dossiers WHERE etat != 'livre' AND julianday('now') - julianday(recu_le) > ? ${et} ORDER BY recu_le LIMIT 20`).all(+(req.query.retard_jours || 5), ...a);
    const etats = Object.fromEntries(ETATS.map(e => [e, 0])); for (const r of db.prepare(`SELECT etat, COUNT(*) n FROM dossiers WHERE 1=1 ${et} GROUP BY etat`).all(...a)) etats[r.etat] = r.n;
    const ca = somme(lignes), caAvant = somme(avant);
    res.json({ ok: true, jours,
      commandes: lignes.length, ca, panier_moyen: lignes.length ? Math.round(ca / lignes.length) : 0,
      precedent: { commandes: avant.length, ca: caAvant },
      avec_express: lignes.filter(d => /express/i.test(d.extras || '')).length, avec_spray: lignes.filter(d => /spray/i.test(d.extras || '')).length,
      par_jour: parJour, par_paiement: groupe(lignes, d => d.paiement), par_monture: groupe(lignes, d => d.monture).slice(0, 10),
      par_boutique: groupe(lignes, d => d.boutique), par_borne: groupe(lignes, d => d.borne),
      par_forme: groupe(lignes, d => d.face_shape), par_heure: parHeure, par_semaine: parSemaine,
      etats, delai_livraison_h: heures.length ? Math.round(heures.reduce((s, h) => s + h, 0) / heures.length) : null, livrees: livrees.length,
      essayages: ess.n || 0, essayages_choisis: ess.choisis || 0, conversion: ess.n ? lignes.length / ess.n : null,
      en_retard: retard });
  });

  // ── Journal d'audit ───────────────────────────────────────────────
  app.get('/api/audit', admin, (req, res) => res.json({ ok: true, lignes: db.prepare('SELECT quand, qui, action, cible, detail FROM audit ORDER BY id DESC LIMIT ?').all(Math.min(300, parseInt(req.query.limite, 10) || 100)) }));

  return { reglagesPour, versionReglages, audit };
}

module.exports = { monter, validerReglages, fusion };
