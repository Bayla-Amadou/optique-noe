const { app, BrowserWindow, session } = require('electron');
const path = require('path');

// Empêche plusieurs instances de l'app
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

function createWindow() {
  const win = new BrowserWindow({
    // ── Affichage ───────────────────────────────────────────────
    fullscreen: true,          // Plein écran automatique (27")
    frame: false,              // Pas de barre de titre
    backgroundColor: '#0a1628',

    // ── Sécurité / permissions ──────────────────────────────────
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Autorise le chargement des fichiers locaux (modèles 3D, WASM)
      webSecurity: false,
    },
  });

  // Autoriser la caméra sans popup de permission
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);   // accès caméra accordé automatiquement
    } else {
      callback(false);
    }
  });

  // Charger l'interface
  win.loadFile('index.html');

  // Masquer le curseur (borne tactile) — commenter si tu as une souris
  // win.webContents.once('did-finish-load', () => {
  //   win.webContents.insertCSS('* { cursor: none !important; }');
  // });

  // Empêcher la fermeture accidentelle par Alt+F4 ou Cmd+Q
  win.on('close', (e) => {
    // Sur la borne en production, décommenter les 2 lignes suivantes :
    // e.preventDefault();
    // return false;
  });

  // En développement : ouvrir DevTools avec F12
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') win.webContents.openDevTools();
    // Ctrl+R ou Cmd+R pour recharger (pratique pendant le dev)
    if ((input.control || input.meta) && input.key === 'r') win.reload();
    // Escape pour quitter le plein écran (dev uniquement)
    if (input.key === 'Escape') win.setFullScreen(false);
  });
}

app.whenReady().then(() => {
  createWindow();

  // Sur macOS : recréer la fenêtre si on reclique sur l'icône dock
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quitter quand toutes les fenêtres sont fermées (Windows/Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
