/**
 * Compte les lignes de chaque table de la base.
 *
 * Sert à prouver qu'un transfert de machine n'a rien perdu : on lance ceci sur l'ancienne avant
 * l'arrêt, sur la nouvelle avant la restauration, puis sur la nouvelle après — et les deux
 * extrémités doivent coïncider (voir deploiement/ISOLER.md).
 *
 * Pourquoi pas simplement « le nombre de dossiers » : sur une base presque vide, 0 = 0 ne prouve
 * rien, puisque la machine neuve comptait déjà 0. Le journal d'audit, lui, porte des lignes dès la
 * première connexion au tableau de bord. Compter TOUTES les tables fait apparaître ce qui a
 * réellement voyagé.
 *
 *     docker compose exec -T noa node outils/compter.js
 */
const path = require('path');
const Database = require('better-sqlite3');

const DONNEES = process.env.NOA_DONNEES || path.join(__dirname, '..', 'donnees');
const fichier = path.join(DONNEES, 'noa.db');

const db = new Database(fichier, { readonly: true, fileMustExist: true });
const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
).all().map(r => r.name);

let total = 0;
const lignes = tables.map(nom => {
  // Le nom vient de sqlite_master, pas d'une entrée extérieure ; on l'échappe tout de même.
  const n = db.prepare(`SELECT COUNT(*) n FROM "${nom.replace(/"/g, '""')}"`).get().n;
  total += n;
  return { table: nom, lignes: n };
});
db.close();

for (const l of lignes) console.log(`${l.lignes.toString().padStart(8)}  ${l.table}`);
console.log(`${total.toString().padStart(8)}  TOTAL (${tables.length} tables)`);
