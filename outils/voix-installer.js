// Assemble les consignes wolof à partir des phrases découpées (assets/voix/wo-phrases/pNN.mp3).
//   node outils/voix-installer.js "essayage: 3, 4, 5
//   scan_echec: 12, 13"                         affectation en texte (celle de la page « Découpe voix wolof »)
//   node outils/voix-installer.js --fichier affectation.txt
//   node outils/voix-installer.js --a-blanc ... n'écrit rien, montre ce qui serait fait
// Plusieurs phrases d'une même consigne sont mises bout à bout, avec 0,35 s de silence entre elles.
// Demande ffmpeg (installé sur la machine de développement ; la borne n'en a pas besoin : elle ne lit que les mp3 produits).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const V = require('../voix.js');
const racine = path.join(__dirname, '..');
const args = process.argv.slice(2), aBlanc = args.includes('--a-blanc');
const iF = args.indexOf('--fichier');
const texte = iF >= 0 ? fs.readFileSync(args[iF + 1], 'utf8') : args.filter(a => !a.startsWith('--')).join('\n');
if (!texte.trim()) { console.error('Donnez l\'affectation (texte ou --fichier).'); process.exit(2); }
const phr = n => path.join(racine, 'assets/voix/wo-phrases', `p${String(n).padStart(2, '0')}.mp3`);
const plan = {}; const ec = [];
for (const ligne of texte.split(/\r?\n/)) {
  const m = ligne.match(/^\s*([a-z_]+)\s*:\s*([\d,\s]+)\s*$/);
  if (!m) { if (ligne.trim() && !/^ignor/i.test(ligne.trim())) ec.push(`ligne non comprise : « ${ligne.trim()} »`); continue; }
  const ns = m[2].split(',').map(x => parseInt(x, 10)).filter(Number.isFinite);
  if (!V.CONSIGNES[m[1]]) ec.push(`consigne inconnue : ${m[1]}`);
  for (const n of ns) if (!fs.existsSync(phr(n))) ec.push(`phrase introuvable : ${n}`);
  plan[m[1]] = ns;
}
if (ec.length) { console.error('Erreurs :\n - ' + ec.join('\n - ')); process.exit(1); }
const sortie = path.join(racine, 'assets/voix/wo'); if (!aBlanc) fs.mkdirSync(sortie, { recursive: true });
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'voix-'));
const silence = path.join(tmp, 'silence.mp3');
if (!aBlanc) execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.35', '-codec:a', 'libmp3lame', '-b:a', '96k', silence]);
for (const [id, ns] of Object.entries(plan)) {
  const cible = path.join(sortie, `${id}.mp3`);
  console.log(`${id.padEnd(16)} <- phrases ${ns.join(', ')}  ->  assets/voix/wo/${id}.mp3`);
  if (aBlanc) continue;
  const liste = path.join(tmp, id + '.txt');
  fs.writeFileSync(liste, ns.map((n, i) => `${i ? `file '${silence}'\n` : ''}file '${phr(n)}'`).join('\n') + '\n');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', liste, '-c', 'copy', cible]);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(aBlanc ? '\n(à blanc : rien n\'a été écrit)' : '\nFait. Contrôle : node outils/voix-manque.js');
