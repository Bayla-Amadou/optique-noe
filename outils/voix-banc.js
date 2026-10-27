// Banc de l'assistance vocale : cohérence entre voix.js et la page, sans navigateur.
const fs = require('fs'), path = require('path');
const V = require('../voix.js');
const page = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ec = [];
const ids = Object.keys(V.CONSIGNES);
// 1. chaque consigne a un texte français de référence, court
for (const id of ids) {
  const t = V.CONSIGNES[id].fr;
  if (!t || t.length < 10) ec.push(`${id} : texte français absent`);
  if (t.length > 120) ec.push(`${id} : consigne trop longue (${t.length} signes) pour être enregistrée et comprise`);
}
// 2. chaque identifiant déclenché par la page existe
const utilises = new Set([...page.matchAll(/voix\(\s*'([a-z_]+)'\s*\)/g)].map(m => m[1]));
for (const m of page.matchAll(/voix\(\s*\{([^}]*)\}\s*\[/g)) for (const x of m[1].matchAll(/:\s*'([a-z_]+)'/g)) utilises.add(x[1]);
for (const m of page.matchAll(/voix\(\s*\[([^\]]*)\]/g)) for (const x of m[1].matchAll(/'([a-z_]+)'/g)) utilises.add(x[1]);
for (const m of page.matchAll(/voix\(\s*mode === 'Wave' \? '([a-z_]+)' : '([a-z_]+)'/g)) { utilises.add(m[1]); utilises.add(m[2]); }
for (const u of utilises) if (!V.CONSIGNES[u]) ec.push(`la page déclenche « ${u} », qui n'existe pas dans voix.js`);
// 3. chaque consigne est déclenchée quelque part (accueil : bouton seulement)
for (const id of ids) if (id !== 'accueil' && !utilises.has(id)) ec.push(`la consigne « ${id} » n'est déclenchée nulle part`);
// 4. le wolof n'a jamais de voix de synthèse
const src = fs.readFileSync(path.join(__dirname, '..', 'voix.js'), 'utf8');
if (!/lang\s*=\s*'fr-FR'/.test(src) || /lang\s*=\s*'wo/.test(src)) ec.push('la synthèse vocale doit rester française');
// 5. manquants : logique
const faux = c => c.endsWith('/essayage.mp3');
const m = V.manquants('wo', faux);
if (m.includes('essayage') || m.length !== ids.length - 1) ec.push('manquants() se trompe');
console.log(JSON.stringify({ consignes: ids.length, declenchees: [...utilises].sort(), resultat: ec.length ? 'ÉCHEC' : 'OK', echecs: ec }, null, 1));
process.exit(ec.length ? 1 : 0);
