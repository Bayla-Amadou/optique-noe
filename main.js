const { app, BrowserWindow, session, ipcMain } = require('electron');
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
ipcMain.handle('save-order', (_e, data) => {
  try {
    // Sauvegarder l'image de l'ordonnance si présente
    if (data.prescriptionData && data.prescriptionPath) {
      const imgDir = path.join(app.getPath('userData'), 'prescriptions');
      if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
      const b64 = data.prescriptionData.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(path.join(imgDir, path.basename(data.prescriptionPath)), b64, 'base64');
    }
    const { saveOrder } = require('./database');
    saveOrder(data);
    return { ok: true };
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

ipcMain.handle('get-stats', () => {
  try {
    const { getStats } = require('./database');
    return { ok: true, stats: getStats() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

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
      callback(true);
    } else {
      callback(false);
    }
  });

  const usePrototype = process.argv.includes('--prototype');
  win.loadFile(usePrototype ? 'prototype.html' : 'index.html');

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

app.whenReady().then(() => {
  createWindow();

  // Démarrer le serveur dashboard (accessible depuis téléphone/PC sur le même WiFi)
  try {
    const { startDashboard } = require('./dashboard-server');
    startDashboard();
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
