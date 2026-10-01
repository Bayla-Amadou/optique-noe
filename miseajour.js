/**
 * N.O.A — Mise à jour automatique de la borne
 *
 * Une borne installée (pas lancée depuis une clé USB) vérifie les « Releases »
 * GitHub, télécharge la nouvelle version en arrière-plan, puis l'INSTALLE LA
 * NUIT, quand plus personne n'est devant. Jamais en plein essayage : une
 * mise à jour qui redémarre la borne sous les yeux d'un client est pire que
 * la version ancienne.
 *
 * Trois garde-fous :
 *   • aucune installation tant qu'une séance est en cours ;
 *   • l'installation n'a lieu que dans la fenêtre de la nuit (celle du
 *     redémarrage nocturne, 30 minutes) ;
 *   • l'atelier garde la main : electron-builder crée chaque version en
 *     BROUILLON. Les bornes ne la voient qu'une fois la Release publiée à
 *     la main sur GitHub, donc après essai sur une borne de test.
 *
 * Désactivable par borne : "miseAJour": false dans borne.json.
 * Sans effet en version portable (clé USB) et hors Windows.
 */
const FENETRE_MIN = 30;                       // minutes après l'heure du redémarrage nocturne
const VERIF_MS = 6 * 3600 * 1000;

function creer({ app, autoUpdater, borne, etatPage, maintenant = () => new Date(), env = process.env, plateforme = process.platform, journal = console }) {
  const etat = { etat: 'inactive', version: null };

  const actif = () => !!(app.isPackaged && plateforme === 'win32' && !env.PORTABLE_EXECUTABLE_DIR && !(borne && borne.miseAJour === false));

  function demarrer() {
    if (!actif()) { journal.log('[MàJ] inactive (non installée, portable, ou désactivée)'); return false; }
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;        // c'est nous qui décidons du moment
    autoUpdater.allowPrerelease = false;
    autoUpdater.on('checking-for-update', () => {});
    autoUpdater.on('update-not-available', () => { etat.etat = 'a_jour'; });
    autoUpdater.on('update-available', (i) => { etat.etat = 'telechargement'; etat.version = i && i.version || null; });
    autoUpdater.on('update-downloaded', (i) => { etat.etat = 'prete'; etat.version = i && i.version || etat.version; journal.log('[MàJ] version ' + etat.version + ' prête, installation cette nuit'); });
    autoUpdater.on('error', (e) => { etat.etat = 'erreur'; journal.error('[MàJ] erreur :', e && e.message); });
    const verifier = () => Promise.resolve().then(() => autoUpdater.checkForUpdates()).catch((e) => { etat.etat = 'erreur'; journal.error('[MàJ]', e.message); });
    setTimeout(verifier, 90 * 1000);
    setInterval(verifier, VERIF_MS);
    return true;
  }

  // Heure du redémarrage nocturne, "04:00" par défaut, comme dans main.js.
  function fenetreNuit() {
    const [h, m] = String((borne && borne.redemarrage) || '04:00').split(':').map(Number);
    const d = maintenant(), min = d.getHours() * 60 + d.getMinutes(), debut = (h || 4) * 60 + (m || 0);
    return min >= debut && min < debut + FENETRE_MIN;
  }

  function peutInstaller() {
    if (etat.etat !== 'prete') return false;
    const page = (etatPage && etatPage()) || {};
    if (page.session) return false;                  // quelqu'un essaie des lunettes
    return fenetreNuit();
  }

  // Appelée chaque minute par le redémarrage nocturne. Vrai si l'installation est lancée.
  function installerSiPrete() {
    if (!peutInstaller()) return false;
    journal.log('[MàJ] installation de la version ' + etat.version);
    autoUpdater.quitAndInstall(true, true);          // silencieux, puis relance la borne
    return true;
  }

  return { demarrer, installerSiPrete, peutInstaller, fenetreNuit, actif, etat: () => ({ ...etat }) };
}

module.exports = { creer, FENETRE_MIN };
