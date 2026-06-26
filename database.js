/**
 * NOA — Base de données SQLite locale
 * Toutes les commandes sont stockées ici, sur la borne.
 */

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const { app }  = require('electron');

let db;

function getDb() {
  if (db) return db;

  const dir  = app.getPath('userData');
  const file = path.join(dir, 'noa.db');
  db = new Database(file);
  db.pragma('journal_mode = WAL');   // meilleures performances en lecture/écriture concurrente

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id          TEXT PRIMARY KEY,
      nom         TEXT NOT NULL,
      tel         TEXT NOT NULL,
      monture     TEXT,
      extras      TEXT,              -- JSON array des add-ons choisis
      paiement    TEXT,
      montant     INTEGER,           -- en FCFA
      pd_mm       REAL,              -- distance interpupillaire mesurée (mm)
      face_width_cm REAL,             -- largeur faciale pommette-à-pommette (cm)
      date        TEXT,              -- ISO 8601
      ordonnance  TEXT,              -- chemin fichier scan
      created_at  TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      tel         TEXT PRIMARY KEY,
      nom         TEXT,
      pd_mm       REAL,
      last_order  TEXT,
      nb_orders   INTEGER DEFAULT 1
    );
  `);

  // Migration depuis l'ancien orders.json si présent
  const jsonPath = path.join(dir, 'orders.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const old = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const insert = db.prepare(`
        INSERT OR IGNORE INTO orders (id, nom, tel, monture, paiement, montant, date)
        VALUES (@id, @nom, @tel, @monture, @paiement, @montant, @date)
      `);
      const migrate = db.transaction((rows) => {
        for (const r of rows) insert.run({
          id:       r.id || ('NOA-' + Date.now()),
          nom:      r.nom || '',
          tel:      r.tel || '',
          monture:  r.monture || '',
          paiement: r.paiement || '',
          montant:  parseInt(r.montant) || 0,
          date:     r.date || new Date().toISOString(),
        });
      });
      if (old.orders?.length) {
        migrate(old.orders);
        fs.renameSync(jsonPath, jsonPath + '.bak');
        console.log(`[DB] Migration JSON → SQLite : ${old.orders.length} commandes importées`);
      }
    } catch (e) {
      console.error('[DB] Migration échouée :', e.message);
    }
  }

  return db;
}

// ── CRUD orders ──────────────────────────────────────────────────────
function saveOrder(data) {
  const d = getDb();
  // Ajout colonne face_width_cm si pas encore présente (migration douce)
  try { d.exec("ALTER TABLE orders ADD COLUMN face_width_cm REAL"); } catch(_) {}
  d.prepare(`
    INSERT OR REPLACE INTO orders (id, nom, tel, monture, extras, paiement, montant, pd_mm, face_width_cm, date, ordonnance)
    VALUES (@id, @nom, @tel, @monture, @extras, @paiement, @montant, @pd_mm, @face_width_cm, @date, @ordonnance)
  `).run({
    id:            data.id,
    nom:           data.nom,
    tel:           data.tel,
    monture:       data.monture,
    extras:        JSON.stringify(data.extras || []),
    paiement:      data.paiement,
    montant:       parseInt(data.montant) || 0,
    pd_mm:         data.pd_mm || null,
    face_width_cm: data.faceWidth_cm || null,
    date:          data.date || new Date().toISOString(),
    ordonnance:    data.prescriptionPath || null,
  });

  // Upsert client
  d.prepare(`
    INSERT INTO clients (tel, nom, pd_mm, last_order, nb_orders)
    VALUES (@tel, @nom, @pd_mm, @id, 1)
    ON CONFLICT(tel) DO UPDATE SET
      nom       = excluded.nom,
      pd_mm     = COALESCE(excluded.pd_mm, pd_mm),
      last_order= excluded.last_order,
      nb_orders = nb_orders + 1
  `).run({ tel: data.tel, nom: data.nom, pd_mm: data.pd_mm || null, id: data.id });
}

function getOrders({ limit = 500, offset = 0, search = '', from = '', to = '' } = {}) {
  let q = 'SELECT * FROM orders WHERE 1=1';
  const p = [];
  if (search) { q += ' AND (nom LIKE ? OR tel LIKE ? OR id LIKE ?)'; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (from)   { q += ' AND date >= ?'; p.push(from); }
  if (to)     { q += ' AND date <= ?'; p.push(to + 'T23:59:59'); }
  q += ' ORDER BY date DESC LIMIT ? OFFSET ?';
  p.push(limit, offset);
  return getDb().prepare(q).all(...p);
}

function getStats() {
  const d = getDb();
  const today = new Date().toISOString().slice(0, 10);
  return {
    total:        d.prepare("SELECT COUNT(*) as n FROM orders").get().n,
    today:        d.prepare("SELECT COUNT(*) as n FROM orders WHERE date >= ?").get(today + 'T00:00:00').n,
    revenue:      d.prepare("SELECT COALESCE(SUM(montant),0) as s FROM orders").get().s,
    revenueToday: d.prepare("SELECT COALESCE(SUM(montant),0) as s FROM orders WHERE date >= ?").get(today + 'T00:00:00').s,
    topMonture:   d.prepare("SELECT monture, COUNT(*) as n FROM orders GROUP BY monture ORDER BY n DESC LIMIT 1").get(),
    clients:      d.prepare("SELECT COUNT(*) as n FROM clients").get().n,
  };
}

function getOrdersCsv() {
  const rows = getDb().prepare("SELECT * FROM orders ORDER BY date DESC").all();
  const cols = ['id','nom','tel','monture','extras','paiement','montant','pd_mm','date'];
  const lines = [cols.join(';')];
  for (const r of rows) lines.push(cols.map(c => `"${(r[c]??'').toString().replace(/"/g,'""')}"`).join(';'));
  return lines.join('\n');
}

module.exports = { saveOrder, getOrders, getStats, getOrdersCsv, getDb };
