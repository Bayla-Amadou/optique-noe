const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('noa', {
  scanPrescription: ()       => ipcRenderer.invoke('scan-prescription'),
  saveOrder:        (data)   => ipcRenderer.invoke('save-order', data),
  getOrders:        ()       => ipcRenderer.invoke('get-orders'),
  // Paiement : la page peut demander, elle ne peut pas décider.
  paymentConfig:    ()       => ipcRenderer.invoke('payment-config'),
  paymentCreate:    (d)      => ipcRenderer.invoke('payment-create', d),
  paymentStatus:    (ref)    => ipcRenderer.invoke('payment-status', ref),
  isDev:            ()       => ipcRenderer.invoke('is-dev'),
  // Dossier client : la page compose, le processus principal conserve et
  // transmet. La page n'a jamais la clé du serveur.
  dossierFile:      (d)      => ipcRenderer.invoke('dossier-file', d),
  dossierEtat:      ()       => ipcRenderer.invoke('dossier-etat'),
  // Mesures anonymes : la page propose, le processus principal valide et écrit.
  mesureEnregistrer: (d)     => ipcRenderer.invoke('mesure-enregistrer', d),
  // Mesure de précision du suivi (lancement avec --trace seulement).
  traceEnregistrer: (t)      => ipcRenderer.invoke('trace-enregistrer', t),
  // Réglages poussés par l'administrateur : lecture au démarrage, puis à chaque changement.
  reglagesLire:     ()       => ipcRenderer.invoke('reglages-lire'),
  surReglages:      (cb)     => ipcRenderer.on('reglages', (_e, d) => { try { cb(d); } catch (_) {} }),
  // Signe de vie : le processus principal recharge la page s'il cesse.
  battement:        (info)   => ipcRenderer.send('battement', info),
});
