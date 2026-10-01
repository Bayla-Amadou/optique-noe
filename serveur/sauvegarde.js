/**
 * Sauvegarde du serveur N.O.A : la base (copie à chaud, cohérente) et les
 * photos, avec rotation. À lancer par cron, tous les jours, via
 * deploiement/sauvegarde.sh. Peut aussi se lancer à la main :
 *     NOA_DONNEES=/donnees node sauvegarde.js
 *
 * Pourquoi l'API de sauvegarde de SQLite et pas un simple « cp » du fichier :
 * la base tourne en mode WAL, avec des écritures en cours. Copier le fichier
 * à la volée donne une copie qui peut être abîmée, et on ne s'en aperçoit
 * qu'au jour où l'on en a besoin. L'API produit une copie cohérente à
 * l'instant T, sans arrêter le serveur.
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const Database = require('better-sqlite3');

const DONNEES = process.env.NOA_DONNEES || path.join(__dirname, 'donnees');
const DEST = process.env.NOA_SAUVEGARDES || path.join(DONNEES, 'sauvegardes');
const GARDER = +(process.env.NOA_SAUVEGARDES_JOURS || 14);

async function sauvegarder() {
  fs.mkdirSync(DEST, { recursive: true });
  const t = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const base = path.join(DEST, `noa-${t}.db`);
  const db = new Database(path.join(DONNEES, 'noa.db'), { readonly: true, fileMustExist: true });
  try { await db.backup(base); } finally { db.close(); }
  // Une sauvegarde qu'on n'a jamais relue n'est qu'une espérance : on l'ouvre et on la compte.
  // La copie est remise en mode « un seul fichier » : sans cela elle traîne des
  // fichiers -wal et -shm qu'il faudrait copier avec elle, et qu'on oublierait.
  const verif = new Database(base);
  verif.pragma('journal_mode = DELETE');
  const n = verif.prepare('SELECT COUNT(*) n FROM dossiers').get().n;
  const ok = verif.pragma('integrity_check', { simple: true });
  verif.close();
  if (ok !== 'ok') throw new Error('la copie de la base est corrompue : ' + ok);
  const photos = path.join(DONNEES, 'photos');
  let archive = null;
  if (fs.existsSync(photos) && fs.readdirSync(photos).length) {
    archive = path.join(DEST, `photos-${t}.tar.gz`);
    execFileSync('tar', ['-czf', archive, '-C', DONNEES, 'photos']);
  }
  // Rotation : on garde les N plus récentes de chaque sorte.
  let supprimees = 0;
  for (const motif of [/^noa-.*\.db$/, /^photos-.*\.tar\.gz$/]) {
    const l = fs.readdirSync(DEST).filter(f => motif.test(f)).sort();
    for (const f of l.slice(0, Math.max(0, l.length - GARDER))) { fs.unlinkSync(path.join(DEST, f)); supprimees++; }
  }
  console.log(`[Sauvegarde] ${path.basename(base)} (${n} dossiers, intégrité ok)${archive ? ' + ' + path.basename(archive) : ''} ; ${supprimees} ancienne(s) supprimée(s)`);
  return { base, archive, dossiers: n };
}

if (require.main === module) sauvegarder().catch(e => { console.error('[Sauvegarde] ÉCHEC :', e.message); process.exit(1); });
module.exports = { sauvegarder };
