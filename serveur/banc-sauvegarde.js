/** Banc de la sauvegarde : la copie est relue, la rotation garde les plus récentes, aucun fichier WAL ne traîne. */
const fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noa-sv-'));
Object.assign(process.env, { NOA_DONNEES: tmp, NOA_CLE_BORNE: 'c', NOA_MDP_ATELIER: 'm', NOA_PORT: '8996', NOA_SAUVEGARDES_JOURS: '2' });
const { db } = require('./serveur.js');
db.prepare("INSERT INTO dossiers (id,nom,tel) VALUES ('X1','A','1'),('X2','B','2')").run();
fs.mkdirSync(tmp + '/photos/X1', { recursive: true }); fs.writeFileSync(tmp + '/photos/X1/ordonnance.jpg', 'IMG');
fs.mkdirSync(tmp + '/sauvegardes', { recursive: true });
for (const d of ['2026-01-01-00-00', '2026-01-02-00-00', '2026-01-03-00-00']) { fs.writeFileSync(`${tmp}/sauvegardes/noa-${d}.db`, 'x'); fs.writeFileSync(`${tmp}/sauvegardes/photos-${d}.tar.gz`, 'x'); }
const ec = [];
require('./sauvegarde.js').sauvegarder().then(r => {
  const l = fs.readdirSync(tmp + '/sauvegardes').sort();
  if (!fs.existsSync(r.base)) ec.push('la sauvegarde du jour a été supprimée par la rotation');
  if (l.some(f => /-(wal|shm)$/.test(f))) ec.push('des fichiers WAL traînent');
  if (l.filter(f => f.endsWith('.db')).length !== 2 || l.filter(f => f.endsWith('.tar.gz')).length !== 2) ec.push('la rotation doit garder 2 bases et 2 archives : ' + l.join(', '));
  const Database = require('better-sqlite3'), v = new Database(r.base, { readonly: true });
  if (v.prepare('SELECT COUNT(*) n FROM dossiers').get().n !== 2) ec.push('la copie ne contient pas les 2 dossiers');
  if (!require('child_process').execSync('tar -tzf ' + r.archive).toString().includes('photos/X1/ordonnance.jpg')) ec.push('l\'archive des photos est incomplète');
  console.log(ec.length ? 'ÉCHEC\n - ' + ec.join('\n - ') : 'OK : copie relue, rotation correcte, archive des photos complète');
  process.exit(ec.length ? 1 : 0);
}).catch(e => { console.error('FATAL', e.message); process.exit(1); });
