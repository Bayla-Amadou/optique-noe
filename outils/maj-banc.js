/**
 * Banc de la mise à jour automatique (miseajour.js) avec un faux updater.
 * Il vérifie la DÉCISION — quand installer, quand surtout ne pas le faire —
 * pas le téléchargement réel, qui demande une vraie Release (voir
 * DEPLOIEMENT.md, section 17).
 *   node outils/maj-banc.js
 */
const { EventEmitter } = require('events');
const { creer } = require('../miseajour');
const ec = [];
const silence = { log() {}, error() {} };
const faux = () => { const u = new EventEmitter(); u.installs = []; u.checks = 0;
  u.checkForUpdates = () => { u.checks++; return Promise.resolve(); };
  u.quitAndInstall = (...a) => u.installs.push(a); return u; };
const heure = (h, m) => () => new Date(2026, 9, 2, h, m);
const mk = (o = {}) => { const u = faux(); const page = { session: false };
  const m = creer({ app: { isPackaged: true }, autoUpdater: u, borne: { borne: 'b' }, etatPage: () => page, maintenant: heure(4, 10), env: {}, plateforme: 'win32', journal: silence, ...o });
  return { u, m, page }; };
let nb = 0;
const verifie = (ok, msg) => { nb++; if (!ok) ec.push(msg); };

// 1. Quand la mise à jour est-elle active ?
verifie(mk().m.actif() === true, 'une borne installée sous Windows devrait être active');
verifie(mk({ app: { isPackaged: false } }).m.actif() === false, 'en développement elle doit être inactive');
verifie(mk({ env: { PORTABLE_EXECUTABLE_DIR: 'E:\\' } }).m.actif() === false, 'la version portable (clé USB) ne peut pas se mettre à jour');
verifie(mk({ borne: { miseAJour: false } }).m.actif() === false, '"miseAJour": false doit la désactiver');
verifie(mk({ plateforme: 'darwin' }).m.actif() === false, 'hors Windows elle doit être inactive');
const inactif = mk({ app: { isPackaged: false } }); inactif.m.demarrer();
verifie(inactif.u.listenerCount('update-downloaded') === 0, 'une borne inactive ne doit pas écouter l\'updater');

// 2. Le cycle d'états
{ const { u, m } = mk(); m.demarrer();
  verifie(m.etat().etat === 'inactive', 'état initial');
  u.emit('update-available', { version: '1.0.2' }); verifie(m.etat().etat === 'telechargement', 'après update-available');
  u.emit('update-downloaded', { version: '1.0.2' }); verifie(m.etat().etat === 'prete' && m.etat().version === '1.0.2', 'après update-downloaded');
  u.emit('error', new Error('réseau')); verifie(m.etat().etat === 'erreur', 'après une erreur'); }

// 3. Quand installer ?
const cas = [
  ['04:10, personne, version prête', heure(4, 10), false, 'prete', true],
  ['04:10 mais une séance en cours', heure(4, 10), true, 'prete', false],
  ['14:00 en pleine journée', heure(14, 0), false, 'prete', false],
  ['03:59, juste avant la fenêtre', heure(3, 59), false, 'prete', false],
  ['04:29, fin de fenêtre', heure(4, 29), false, 'prete', true],
  ['04:30, fenêtre close', heure(4, 30), false, 'prete', false],
  ['04:10 mais rien de téléchargé', heure(4, 10), false, 'a_jour', false],
  ['04:10, téléchargement en cours', heure(4, 10), false, 'telechargement', false],
  ['04:10 après une erreur', heure(4, 10), false, 'erreur', false],
];
for (const [nom, h, session, etat, attendu] of cas) {
  const { u, m, page } = mk({ maintenant: h }); m.demarrer(); page.session = session;
  if (etat === 'prete') u.emit('update-downloaded', { version: '1.0.2' });
  else if (etat === 'telechargement') u.emit('update-available', { version: '1.0.2' });
  else if (etat === 'a_jour') u.emit('update-not-available', {}); else u.emit('error', new Error('x'));
  const lance = m.installerSiPrete();
  verifie(lance === attendu, `« ${nom} » : attendu ${attendu}, obtenu ${lance}`);
  verifie(u.installs.length === (attendu ? 1 : 0), `« ${nom} » : quitAndInstall appelé ${u.installs.length} fois`);
  if (attendu) verifie(JSON.stringify(u.installs[0]) === '[true,true]', 'l\'installation doit être silencieuse et relancer la borne');
}
// 4. Heure de redémarrage personnalisée
{ const { u, m } = mk({ borne: { borne: 'b', redemarrage: '03:00' }, maintenant: heure(3, 5) }); m.demarrer(); u.emit('update-downloaded', { version: '1.0.2' });
  verifie(m.installerSiPrete() === true, 'la fenêtre doit suivre "redemarrage" de borne.json'); }
// 5. Un échec de vérification ne plante pas
{ const { u, m } = mk(); u.checkForUpdates = () => Promise.reject(new Error('GitHub injoignable')); m.demarrer(); }
// 6. L'updater n'installe pas tout seul en quittant : c'est la borne qui décide
{ const { u, m } = mk(); m.demarrer(); verifie(u.autoInstallOnAppQuit === false, 'autoInstallOnAppQuit doit être faux'); verifie(u.autoDownload === true, 'le téléchargement doit être automatique'); }

// 7. L'administrateur peut geler les mises à jour, changer l'heure de la fenêtre, forcer une vérification
{ let autorisee = true;
  const { u, m } = mk({ autorisee: () => autorisee, heureNuit: () => '02:00', maintenant: heure(2, 10) }); m.demarrer(); u.emit('update-downloaded', { version: '1.0.2' });
  verifie(m.fenetreNuit() === true, 'l\'heure de la fenêtre doit suivre le réglage de l\'administrateur (02:00)');
  autorisee = false;
  verifie(m.installerSiPrete() === false && u.installs.length === 0, 'une borne gelée ne doit pas installer');
  autorisee = true;
  verifie(m.installerSiPrete() === true, 'dégelée, elle installe');
}
{ let autorisee = false; const { u, m } = mk({ autorisee: () => autorisee }); m.demarrer();
  m.verifierMaintenant().then(r => { verifie(r === 'gelee' && u.checks === 0, 'gelée : la vérification forcée ne contacte pas GitHub'); autorisee = true;
    return m.verifierMaintenant(); }).then(r => { verifie(r === 'verifiee' && u.checks === 1, 'dégelée : la vérification forcée contacte GitHub'); fin(); }); }
function fin() {
console.log(ec.length ? 'ÉCHEC\n - ' + ec.join('\n - ') : `OK : ${nb} contrôles de la décision de mise à jour`);
process.exit(ec.length ? 1 : 0);
}
