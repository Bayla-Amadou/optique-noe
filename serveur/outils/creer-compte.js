#!/usr/bin/env node
/**
 * Fabrique la ligne de compte à coller dans NOA_COMPTES (secrets du serveur).
 *
 *   node serveur/outils/creer-compte.js <utilisateur> <admin|opticien> [boutique]
 *
 * Le mot de passe est lu dans la variable NOA_NOUVEAU_MDP si elle existe, sinon demandé sans écho.
 * Il n'est jamais affiché ni écrit : seule l'empreinte (scrypt, sel aléatoire) sort.
 * Plusieurs comptes : les lignes se mettent bout à bout, séparées par « ; ».
 */
const { empreinte, ROLES } = require('../comptes.js');
const [utilisateur, role, boutique] = process.argv.slice(2);
if (!utilisateur || !ROLES.includes(role)) { console.error('usage : node serveur/outils/creer-compte.js <utilisateur> <admin|opticien> [boutique]'); process.exit(2); }
function demander() {
  return new Promise(res => {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    rl._writeToOutput = s => { if (/^[\r\n]+$/.test(s) || s.includes('Mot de passe')) process.stderr.write(s); };
    rl.question('Mot de passe (12 caractères au moins) : ', r => { rl.close(); process.stderr.write('\n'); res(r); });
  });
}
(async () => {
  const mdp = process.env.NOA_NOUVEAU_MDP || await demander();
  if (String(mdp).length < 12) { console.error('Mot de passe trop court (12 caractères au moins).'); process.exit(1); }
  console.log([utilisateur, role, empreinte(mdp), boutique].filter(x => x !== undefined).join(':'));
})();
