const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const { exec }      = require('child_process');
const fs            = require('fs');

// ── Base de données locale (JSON) ────────────────────────────────────
function dbPath() {
  return path.join(app.getPath('userData'), 'orders.json');
}
function loadDb() {
  try { return JSON.parse(fs.readFileSync(dbPath(), 'utf8')); }
  catch { return { orders: [] }; }
}
function saveDb(db) {
  fs.writeFileSync(dbPath(), JSON.stringify(db, null, 2));
}

// ── IPC handlers ─────────────────────────────────────────────────────
ipcMain.handle('save-order', (_e, data) => {
  const db = loadDb();
  db.orders.push({ ...data, savedAt: new Date().toISOString() });
  saveDb(db);

  // Sauvegarder l'image de l'ordonnance si présente
  if (data.prescriptionData && data.prescriptionPath) {
    const imgDir = path.join(app.getPath('userData'), 'prescriptions');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
    const b64 = data.prescriptionData.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(path.join(imgDir, path.basename(data.prescriptionPath)), b64, 'base64');
  }
  return { ok: true };
});

ipcMain.handle('get-orders', () => loadDb());

ipcMain.handle('scan-prescription', async (_e) => {
  // Commande SANE pour scanner A4 600 DPI
  // Le scanner intégré à la borne est le premier périphérique détecté
  const scanDir  = path.join(app.getPath('userData'), 'prescriptions');
  if (!fs.existsSync(scanDir)) fs.mkdirSync(scanDir, { recursive: true });
  const outFile  = path.join(scanDir, `scan_${Date.now()}.png`);
  const cmd      = `scanimage --format=png --resolution=600 --mode=Color > "${outFile}"`;

  return new Promise((resolve) => {
    exec(cmd, { timeout: 30000 }, (err) => {
      if (err) {
        // En développement sans scanner physique : renvoyer une erreur claire
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
      preload: path.join(__dirname, 'preload.js'),
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

  // Charger l'interface (--prototype pour la pipeline PnP expérimentale)
  const usePrototype = process.argv.includes('--prototype');
  win.loadFile(usePrototype ? 'prototype.html' : 'index.html');

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
