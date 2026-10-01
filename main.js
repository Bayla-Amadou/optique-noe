const { app, BrowserWindow, session, ipcMain, screen, protocol, net, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { exec }      = require('child_process');
const fs            = require('fs');

// ── LA PAGE N'EST PLUS SERVIE EN file:// ────────────────────────────
// Elle l'était, avec `webSecurity: false` pour que les chargements locaux
// (modèles 3D, WebAssembly) passent. Cela coupe la protection du navigateur
// contre la lecture de fichiers : une page compromise lirait n'importe quel
// fichier de la borne. On sert à la place l'application sous un schéma
// dédié, noa://app/, déclaré sûr : les chargements fonctionnent, la
// protection reste en place, et seuls les fichiers de l'application sont
// accessibles — pas les secrets (voir REFUSES).
protocol.registerSchemesAsPrivileged([{
  scheme: 'noa',
  privileges: { standard:true, secure:true, supportFetchAPI:true, corsEnabled:true, stream:true },
}]);
const ORIGINE = 'noa://app/';
const REFUSES = [
  /(^|\/)paiement\.config\.json$/, /(^|\/)serveur\.config\.json$/, /(^|\/)borne\.json$/,
  /(^|\/)\.env/, /(^|\/)\.git(\/|$)/, /(^|\/)certs(\/|$)/, /(^|\/)serveur(\/|$)/,
  /(^|\/)outils(\/|$)/, /(^|\/)sdk-visage(\/|$)/, /\.(sqlite|db|vlc|pem|key)$/i,
];
function servirApplication() {
  protocol.handle('noa', (req) => {
    try {
      const u = new URL(req.url);
      let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
      const f = path.normalize(path.join(__dirname, rel));
      // Sortir du dossier de l'application, ou toucher un secret : refusé.
      if (!f.startsWith(__dirname + path.sep) || REFUSES.some(r => r.test(rel))) {
        return new Response('refusé', { status: 403 });
      }
      return net.fetch(pathToFileURL(f).toString());
    } catch (e) {
      return new Response('erreur', { status: 500 });
    }
  });
}

// Chaque canal IPC vérifie que l'appel vient bien de NOTRE page. Un
// contenu étranger qui parviendrait à se charger dans la fenêtre ne doit
// pouvoir ni lire les commandes ni créer un paiement.
function origineOk(e) {
  try { return !!e.senderFrame && String(e.senderFrame.url).startsWith(ORIGINE); }
  catch (_) { return false; }
}
function handle(canal, fn) {
  ipcMain.handle(canal, (e, ...a) => {
    if (!origineOk(e)) { console.error('[IPC] origine refusée :', canal); throw new Error('origine refusée'); }
    return fn(e, ...a);
  });
}

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

handle('save-order', (_e, data) => {
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

handle('get-orders', (_e, filters) => {
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
handle('dossier-file', (_e, d) => {
  try { return require('./dossier').enfiler(d.dossier, d.fichiers); }
  catch (e) { console.error('[dossier-file]', e.message); return { ok:false, raison:e.message }; }
});
handle('dossier-etat', () => {
  try { return require('./dossier').etat(); }
  catch (e) { return { ok:false, raison:e.message }; }
});

handle('get-stats', () => {
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

handle('payment-config', () => ({ configure: paiement.estConfigure() }));

handle('payment-create', async (_e, d) => {
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

handle('payment-status', async (_e, ref) => {
  try { return await paiement.statut(ref); }
  catch (e) {
    console.error('[payment-status]', e.message);
    return { ok:false, raison:'erreur_interne' };
  }
});

// Mode développement : réservé au poste de développement, jamais à la borne.
// Il est demandé explicitement au lancement par --dev, et sert uniquement à
// afficher le bouton de simulation dans l'interface.
handle('is-dev', () => process.argv.includes('--dev'));

handle('scan-prescription', async (_e) => {
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
    kiosk: kiosque,          // vrai mode borne : plein écran, sans échappatoire
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
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      // Pas d'outils de développement devant un client. --diag les rend.
      devTools: !kiosque || arg.includes('--diag'),
      spellcheck: false,
    },
  });
  if (kiosque) Menu.setApplicationMenu(null);   // les menus portent des raccourcis (Ctrl+R, Ctrl+W)
  fenetre = win; modeKiosque = kiosque;

  // Autoriser la caméra sans popup de permission
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media' && String(webContents.getURL()).startsWith(ORIGINE));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  // ── Verrouillage de la navigation ─────────────────────────────
  // La page ne va nulle part ailleurs : ni lien, ni fenêtre, ni fichier
  // déposé sur l'écran. Une borne qui ouvre un site web n'est plus une borne.
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGINE)) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  win.webContents.setVisualZoomLevelLimits(1, 1);   // pas de pincement
  if (kiosque) win.webContents.on('context-menu', (e) => e.preventDefault());

  tenirLaDuree(win);

  const usePrototype = process.argv.includes('--prototype');
  // Le badge de diagnostic n'a rien a faire devant un client. Il ne
  // s'affiche qu'a la demande :  npm start -- --diag
  const diag = arg.includes('--diag');
  // Le champ de vision réel de la caméra de CETTE borne voyage dans l'adresse :
  // la page en a besoin avant tout calcul, et un canal asynchrone serait trop tard.
  const q = new URLSearchParams();
  if (diag) q.set('diag', '1');
  const hfov = CONF_BORNE && CONF_BORNE.camera && Number(CONF_BORNE.camera.hfov);
  if (hfov > 0) q.set('hfov', String(hfov));
  const qs = q.toString();
  win.loadURL(ORIGINE + (usePrototype ? 'prototype.html' : 'index.html') + (qs ? '?' + qs : ''));

  // ── Sur la borne : on ne sort pas ──────────────────────────────
  // Alt+F4 est un raccourci de Windows, pas de la page : seul l'événement
  // `close` l'intercepte. Le personnel a, lui, une sortie volontaire :
  // Ctrl+Alt+Maj+Q. Personne ne la tape par hasard.
  win.on('close', (e) => {
    if (kiosque && !quitterVraiment) e.preventDefault();
  });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const k = String(input.key || '').toLowerCase();
    if (input.control && input.alt && input.shift && k === 'q') {
      quitterVraiment = true; app.exit(0); return;
    }
    if (kiosque) {
      // Tout ce qui pourrait sortir de la page, la recharger, la zoomer ou
      // ouvrir un outil : bloqué. Les touches ordinaires passent.
      const f = /^f([1-9]|1[0-2])$/.test(k);
      const combo = (input.control || input.meta) && ['r','w','q','n','t','p','s','u','+','-','=','0','tab'].includes(k);
      if (f || combo || k === 'escape' || (input.alt && ['f4','arrowleft','arrowright'].includes(k))
          || (input.control && input.shift && ['i','j','c','r'].includes(k))) {
        if (!(k === 'f12' && arg.includes('--diag'))) event.preventDefault();
        if (k === 'f12' && arg.includes('--diag')) win.webContents.openDevTools();
      }
      return;
    }
    // Poste de développement.
    if (input.key === 'F12') win.webContents.openDevTools();
    if ((input.control || input.meta) && input.key === 'r') win.reload();
    if (input.key === 'Escape') win.setFullScreen(false);
  });
}
let fenetre = null, quitterVraiment = false, modeKiosque = false;

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
  //    borne a deux heures du matin. On repare au plus petit niveau :
  //    d'abord recharger la page ; relancer toute l'application seulement si
  //    la page retombe en boucle (trois fois en dix minutes), parce qu'un
  //    redemarrage complet coute quinze secondes devant un client.
  const chutes = [];
  const reparer = (raison) => {
    const maintenant = Date.now();
    chutes.push(maintenant);
    while (chutes.length && maintenant - chutes[0] > 600000) chutes.shift();
    console.error(`[Borne] ${raison} — ${chutes.length} incident(s) en 10 min`);
    if (chutes.length >= 3) { setTimeout(() => { app.relaunch(); app.exit(0); }, 2000); return; }
    try { win.webContents.reload(); } catch (_) { app.relaunch(); app.exit(0); }
  };
  win.webContents.on('render-process-gone', (_e, d) => reparer('la page est morte : ' + d.reason));
  let bloque = null;
  win.webContents.on('unresponsive', () => {
    // Vingt secondes de grace : un chargement lourd n'est pas un plantage.
    bloque = setTimeout(() => reparer('page bloquee'), 20000);
  });
  win.webContents.on('responsive', () => { clearTimeout(bloque); bloque = null; });
  // Le processus graphique est relance par Chromium lui-meme ; la page, elle,
  // perd son contexte WebGL et le reconstruit (voir index.html). On note
  // seulement l'evenement : c'est lui qu'on cherchera dans le journal.
  app.on('child-process-gone', (_e, d) => {
    if (d.type === 'GPU') console.error('[Borne] processus graphique perdu :', d.reason);
  });

  // Battement de coeur de la page : si elle ne repond plus alors que le
  // processus vit (erreur JavaScript qui arrete tout), on la recharge.
  let dernierBattement = Date.now();
  ipcMain.on('battement', (e, info) => {
    if (!origineOk(e) || !info || typeof info !== 'object') return;
    dernierBattement = Date.now();
  });
  setInterval(() => {
    if (Date.now() - dernierBattement > 60000) {
      dernierBattement = Date.now();
      reparer('la page ne donne plus signe de vie');
    }
  }, 10000);

  // Demarrage automatique a l'ouverture de session Windows : une borne qui
  // a redemarre (coupure de courant, mise a jour) doit revenir seule. Le
  // chemin est celui de la version portable si elle est utilisee ; dans ce
  // cas l'application doit etre copiee sur le disque de la borne, pas lancee
  // depuis la cle USB, qui sera retiree.
  if (CONF_BORNE.demarrageAuto !== false && (process.platform === 'win32' || process.platform === 'darwin')) {
    try {
      app.setLoginItemSettings({ openAtLogin: true,
        path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath });
    } catch (e) { console.error('[Borne] demarrage automatique :', e.message); }
  }

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
  if (!gotLock) return;     // une autre instance tourne deja
  servirApplication();
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
  // Sur la borne, une fenetre fermee n'est jamais voulue (sauf la sortie
  // du personnel) : on repart plutot que de laisser un ecran de bureau.
  if (modeKiosque && !quitterVraiment) { app.relaunch(); app.exit(0); return; }
  if (process.platform !== 'darwin') app.quit();
});
