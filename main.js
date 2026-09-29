const { app, BrowserWindow, session, ipcMain, screen } = require('electron');
const path = require('path');
const { exec }      = require('child_process');
const fs            = require('fs');

// ── Base de données SQLite ───────────────────────────────────────────
let db;
function getDb() {
  if (!db) {
    const { getDb: _getDb } = require('./database');
    db = { saveOrder: require('./database').saveOrder,
           getOrders: require('./database').getOrders,
           getStats:  require('./database').getStats };
  }
  return db;
}

// ── IPC handlers ─────────────────────────────────────────────────────
// Ecrit une image transmise par la page, et renvoie son chemin absolu :
// c'est ce chemin que la file de transmission relira au moment de l'envoi.
function ecrireImage(sousDossier, nom, dataUrl) {
  if (!dataUrl || !nom) return null;
  const dir = path.join(app.getPath('userData'), sousDossier);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, path.basename(nom));
  fs.writeFileSync(f, dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  return f;
}

ipcMain.handle('save-order', (_e, data) => {
  try {
    const fichiers = {};
    const ord = ecrireImage('prescriptions', data.prescriptionPath, data.prescriptionData);
    if (ord) fichiers.ordonnance = ord;
    const ess = ecrireImage('essais', data.essaiPath, data.essaiData);
    if (ess) fichiers.essai = ess;
    const { saveOrder } = require('./database');
    saveOrder(data);
    // Les chemins remontent a la page, qui les joint au dossier. Les images
    // elles-memes ne repassent jamais par la page : elles sont relues ici
    // au moment de l'envoi.
    return { ok: true, fichiers };
  } catch (e) {
    console.error('[save-order]', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('get-orders', (_e, filters) => {
  try {
    const { getOrders } = require('./database');
    return { ok: true, orders: getOrders(filters || {}) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Dossiers clients ─────────────────────────────────────────────────
// Ils vivent sur le serveur, pas sur la borne. Mais ils sont ecrits
// localement AVANT toute tentative d'envoi : une commande ne doit pas se
// perdre parce que le reseau a hoquete pendant qu'un client payait.
ipcMain.handle('dossier-file', (_e, d) => {
  try { return require('./dossier').enfiler(d.dossier, d.fichiers); }
  catch (e) { console.error('[dossier-file]', e.message); return { ok:false, raison:e.message }; }
});
ipcMain.handle('dossier-etat', () => {
  try { return require('./dossier').etat(); }
  catch (e) { return { ok:false, raison:e.message }; }
});

ipcMain.handle('get-stats', () => {
  try {
    const { getStats } = require('./database');
    return { ok: true, stats: getStats() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Paiement ─────────────────────────────────────────────────────────
// La vérification vit ici, dans le processus principal, et non dans la page.
// Le code de la page peut demander l'état d'un paiement, il ne peut pas le
// décider. C'est la règle : une commande n'est confirmée que sur une
// notification serveur vérifiée, jamais sur un signal venu de la borne.
const paiement = require('./paiement');

ipcMain.handle('payment-config', () => ({ configure: paiement.estConfigure() }));

ipcMain.handle('payment-create', async (_e, d) => {
  try {
    return await paiement.creer({
      montant:   parseInt(d && d.montant) || 0,
      operateur: (d && d.operateur) || null,
      commande:  (d && d.commande)  || null,
    });
  } catch (e) {
    console.error('[payment-create]', e.message);
    return { ok:false, raison:'erreur_interne' };
  }
});

ipcMain.handle('payment-status', async (_e, ref) => {
  try { return await paiement.statut(ref); }
  catch (e) {
    console.error('[payment-status]', e.message);
    return { ok:false, raison:'erreur_interne' };
  }
});

// Mode développement : réservé au poste de développement, jamais à la borne.
// Il est demandé explicitement au lancement par --dev, et sert uniquement à
// afficher le bouton de simulation dans l'interface.
ipcMain.handle('is-dev', () => process.argv.includes('--dev'));

ipcMain.handle('scan-prescription', async (_e) => {
  // Commande SANE pour scanner A4 600 DPI
  const scanDir  = path.join(app.getPath('userData'), 'prescriptions');
  if (!fs.existsSync(scanDir)) fs.mkdirSync(scanDir, { recursive: true });
  const outFile  = path.join(scanDir, `scan_${Date.now()}.png`);
  const cmd      = `scanimage --format=png --resolution=600 --mode=Color > "${outFile}"`;

  return new Promise((resolve) => {
    exec(cmd, { timeout: 30000 }, (err) => {
      if (err) {
        resolve({ ok: false, error: err.message, file: null });
      } else {
        const b64 = fs.readFileSync(outFile).toString('base64');
        resolve({ ok: true, file: outFile, data: `data:image/png;base64,${b64}` });
      }
    });
  });
});

// Empêche plusieurs instances de l'app
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

// ── LA BORNE DÉFINITIVE ───────────────────────────────────────────
// Écran tactile 27 pouces, 1920 x 1080, surface utile 597,9 x 336,3 mm,
// monté À LA VERTICALE sur son pied : l'affichage fait donc 1080 de large
// pour 1920 de haut. Machine Windows, Intel Core i7, 16 Go, graphique
// Intel Iris Xe intégré, caméra 13 MP orientable.
// Référence HN-27SK-F, facture proforma HN20260626M.
const BORNE = { largeur: 1080, hauteur: 1920 };

// ── QU'EST-CE QUI FAIT QU'UNE MACHINE EST UNE BORNE ───────────────
// Un fichier, borne.json, pose a cote de l'executable. Sa seule presence
// suffit : plein ecran, aucun moyen d'en sortir, veille interdite,
// redemarrage nocturne.
//
// Pourquoi un fichier plutot qu'un argument de lancement : une borne
// tourne des mois sans qu'on la touche. Le jour ou quelqu'un la relance
// depuis le menu Demarrer, depuis l'explorateur ou apres une mise a jour
// de Windows, l'argument est perdu et la borne s'ouvre en fenetre au
// milieu d'une boutique. Le fichier, lui, est toujours la.
//
//   { "borne": "dakar-plateau-1", "redemarrage": "04:00" }
//
// Il est cherche a cote de l'executable — donc sur la cle USB en version
// portable — puis dans les donnees de l'application.
function lireBorne() {
  const coins = [
    process.env.PORTABLE_EXECUTABLE_DIR,          // version portable, cle USB
    path.dirname(app.getPath('exe')),
    path.join(app.getPath('exe'), '..', 'resources'),
    __dirname,
    app.getPath('userData'),
  ].filter(Boolean);
  for (const d of coins) {
    try {
      const f = path.join(d, 'borne.json');
      if (fs.existsSync(f)) {
        const c = JSON.parse(fs.readFileSync(f, 'utf8'));
        console.log(`[Borne] ${c.borne || 'sans nom'} — ${f}`);
        return c;
      }
    } catch (e) { console.error('[Borne] borne.json illisible :', e.message); }
  }
  return null;
}
const CONF_BORNE = lireBorne();

function createWindow() {
  // ── DEUX USAGES, DEUX FENÊTRES ──────────────────────────────────
  // L'application s'installe aussi bien sur la borne que sur l'ordinateur
  // d'un opticien ou d'un commercial. Ce ne sont pas les mêmes besoins, et
  // le défaut doit être le cas le plus courant.
  //
  // Sur un ordinateur ordinaire : une fenêtre normale, avec sa barre de
  // titre, qu'on déplace et qu'on ferme. Une application qui s'ouvre en
  // plein écran sans bordure et sans moyen visible d'en sortir passe pour
  // un logiciel malveillant — et sur un Mac, l'utilisateur ne devinera pas
  // Cmd+Q.
  //
  // Sur la borne : plein écran, sans bordure, avec --kiosque. C'est un
  // choix explicite, pas un défaut subi.
  //
  //   --kiosque            plein écran sans bordure (la borne)
  //   --borne              fenêtre au gabarit 1080 x 1920 (pour juger)
  //   --paysage            fenêtre 16:9 (pour comparer)
  //   (rien)               fenêtre normale
  const arg = process.argv.slice(1);
  const kiosque = arg.includes('--kiosque') || !!CONF_BORNE;
  const simule = arg.includes('--borne') || arg.includes('--paysage');
  const paysage = arg.includes('--paysage');
  // Une fenêtre de 1920 de haut ne tient sur aucun portable. Plutôt que de
  // la réduire d'un facteur arbitraire — ce qui donnait une fenêtre grande
  // comme un téléphone, impossible à juger — on prend la plus grande qui
  // tienne dans l'écran disponible, en conservant le rapport de la borne.
  // C'est le rapport qui compte pour la mise en page, pas les pixels.
  const zone = screen.getPrimaryDisplay().workAreaSize;
  const ref  = paysage ? { largeur: 1280, hauteur: 720 } : BORNE;
  const k = Math.min(1, (zone.height - 40) / ref.hauteur,
                        (zone.width  - 40) / ref.largeur);
  const win = new BrowserWindow({
    // ── Affichage ───────────────────────────────────────────────
    fullscreen: kiosque,
    frame: !kiosque,
    ...(kiosque ? {} : {
      width:  Math.round(ref.largeur * k),
      height: Math.round(ref.hauteur * k),
      minWidth: 420, minHeight: 620,
      resizable: true,
      title: 'NOA Optique',
    }),
    backgroundColor: '#ffffff',

    // ── Sécurité / permissions ──────────────────────────────────
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
  });

  // Autoriser la caméra sans popup de permission
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  tenirLaDuree(win);

  const usePrototype = process.argv.includes('--prototype');
  // Le badge de diagnostic n'a rien a faire devant un client. Il ne
  // s'affiche qu'a la demande :  npm start -- --diag
  const diag = arg.includes('--diag');
  win.loadFile(usePrototype ? 'prototype.html' : 'index.html',
               diag ? { query: { diag: '1' } } : undefined);

  // Empêcher la fermeture accidentelle par Alt+F4 ou Cmd+Q
  win.on('close', (e) => {
    // Sur la borne en production, décommenter les 2 lignes suivantes :
    // e.preventDefault();
    // return false;
  });

  // En développement : ouvrir DevTools avec F12
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') win.webContents.openDevTools();
    if ((input.control || input.meta) && input.key === 'r') win.reload();
    if (input.key === 'Escape') win.setFullScreen(false);
  });
}

// ── TENIR VINGT-QUATRE HEURES SUR VINGT-QUATRE ───────────────────
// Une borne allumee en permanence pose trois problemes qu'un poste de
// bureau ne pose pas. Ils sont traites ici parce qu'aucun ne se voit en
// developpement : ils apparaissent au bout de plusieurs jours.
function tenirLaDuree(win) {
  if (!CONF_BORNE) return;

  // 1. L'ecran ne doit jamais s'eteindre. Windows finit toujours par
  //    reappliquer une politique de veille apres une mise a jour, et on
  //    retrouve la borne noire un matin.
  try {
    const { powerSaveBlocker } = require('electron');
    powerSaveBlocker.start('prevent-display-sleep');
  } catch (e) { console.error('[Borne] veille :', e.message); }

  // 2. Un plantage doit se rattraper tout seul. Personne ne surveille une
  //    borne a deux heures du matin.
  win.webContents.on('render-process-gone', (_e, d) => {
    console.error('[Borne] la page est morte :', d.reason, '— redemarrage');
    app.relaunch(); app.exit(0);
  });
  win.webContents.on('unresponsive', () => {
    console.error('[Borne] page bloquee — redemarrage');
    app.relaunch(); app.exit(0);
  });

  // 3. Redemarrage nocturne. Aucun logiciel qui tourne des semaines sans
  //    interruption ne garde une memoire stable — ni le notre, ni Chromium,
  //    ni les pilotes de la camera. Plutot que d'attendre le jour ou ca
  //    lachera devant un client, on repart chaque nuit a une heure ou la
  //    boutique est fermee. Quatre heures du matin par defaut.
  const [h, m] = String(CONF_BORNE.redemarrage || '04:00').split(':').map(Number);
  setInterval(() => {
    const d = new Date();
    if (d.getHours() === (h || 4) && d.getMinutes() === (m || 0)) {
      console.log('[Borne] redemarrage nocturne');
      app.relaunch(); app.exit(0);
    }
  }, 60000);
}

app.whenReady().then(() => {
  createWindow();

  // Démarrer le serveur dashboard (accessible depuis téléphone/PC sur le même WiFi)
  try {
    const { startDashboard } = require('./dashboard-server');
    startDashboard();
    // Le reseau revient sans prevenir : on retente la file regulierement.
    require('./dossier').demarrer(60000, CONF_BORNE);
  } catch (e) {
    console.error('[Dashboard] Impossible de démarrer :', e.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quitter quand toutes les fenêtres sont fermées (Windows/Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
