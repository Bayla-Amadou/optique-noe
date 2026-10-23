// Liste les enregistrements de l'assistance vocale qui manquent, par langue.
//   node outils/voix-manque.js             rapport (le wolof manquant n'est pas une erreur : la borne dit alors le français)
//   node outils/voix-manque.js --strict    sort en erreur si un enregistrement WOLOF manque (à lancer avant de livrer une borne)
const fs = require('fs'), path = require('path');
const V = require('../voix.js');
const racine = path.join(__dirname, '..');
const existe = c => { try { return fs.statSync(path.join(racine, c)).size > 500; } catch (_) { return false; } };
let manque_wo = 0;
for (const l of ['wo', 'fr']) {
  const m = V.manquants(l, existe), total = Object.keys(V.CONSIGNES).length;
  if (l === 'wo') manque_wo = m.length;
  console.log(`\n${l === 'wo' ? 'WOLOF' : 'FRANÇAIS'} : ${total - m.length}/${total} enregistrements présents dans assets/voix/${l}/`);
  for (const id of m) console.log(`  manque  ${id}.mp3   « ${V.CONSIGNES[id].fr} »`);
}
if (manque_wo) console.log('\nTant que le wolof manque, la borne dit ces consignes en FRANÇAIS (voir VOIX_WOLOF.md).');
process.exit(process.argv.includes('--strict') && manque_wo ? 1 : 0);
